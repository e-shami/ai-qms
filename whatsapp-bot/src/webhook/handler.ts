import { Request, Response } from 'express';
import { getEnv } from '../config';
import { WhatsAppWebhookPayload, WhatsAppMessage } from '../whatsapp/types';
import { getSession, updateSession, extractPhoneFromMessage, getTextBody } from '../whatsapp/session';
import { getWhatsAppClient } from '../whatsapp/client';
import { processJoinQueueFlow, startJoinQueueFlow } from '../flows/joinQueue';
import { processCheckStatusFlow, startCheckStatusFlow } from '../flows/checkStatus';
import { processSupportFlow } from '../flows/support';
import { showListPage } from '../whatsapp/lists';

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const body = req.body as WhatsAppWebhookPayload;
  res.status(200).send('EVENT_RECEIVED');
  if (body.object !== 'whatsapp_business_account') return;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (value.metadata?.phone_number_id !== getEnv().PHONE_NUMBER_ID) continue;
      for (const message of value.messages ?? []) {
        try {
          await processIncomingMessage(message);
        } catch {
          console.error('Incoming message processing failed');
          try {
            await getWhatsAppClient().sendText(extractPhoneFromMessage(message), 'Sorry, something went wrong. Type "menu" to try again.');
          } catch {
            console.error('Unable to deliver error message');
          }
        }
      }
    }
  }
}

async function processIncomingMessage(message: WhatsAppMessage): Promise<void> {
  const phone = extractPhoneFromMessage(message);
  if (!/^[1-9]\d{6,14}$/.test(phone)) return;
  const session = await getSession(phone);
  const textBody = getTextBody(message);
  const client = getWhatsAppClient();
  // Read receipts are cosmetic; a failure must not block the conversation.
  await client.markAsRead(message.id).catch(() => undefined);
  const command = textBody?.trim().toLowerCase();
  if (command && ['hi', 'hello', 'hey', 'help', 'menu', 'restart', 'start over'].includes(command)) {
    await updateSession(phone, { state: 'idle', data: { flow: undefined, step: undefined, awaitingHuman: undefined } });
    await client.sendInteractiveButtons(phone, 'AI-QMS Assistant', 'How can I help you today?', [
      { id: 'join', title: 'Join Queue' }, { id: 'status', title: 'Check Status' }, { id: 'support', title: 'Support' },
    ], 'Type "hi" or "menu" anytime to return here.');
    return;
  }
  if (command && ['status', 'check', 'my token', 'position', 'wait'].includes(command)) {
    await startCheckStatusFlow(phone);
    return;
  }
  if (command && ['join', 'queue', 'token'].includes(command)) {
    await startJoinQueueFlow(phone);
    return;
  }
  if (command && ['support', 'agent'].includes(command)) {
    await updateSession(phone, { state: 'support_escalated', data: { flow: 'support', step: undefined, awaitingHuman: false } });
    await processSupportFlow(phone, session, null, { ...message, type: 'text', interactive: undefined });
    return;
  }
  if (command && ['cancel', 'leave', 'exit', 'confirm_cancel', 'keep_token'].includes(command)) {
    await client.sendText(phone, 'This bot cannot cancel issued tokens. Your token has not been changed. Contact institution staff for cancellation. Type "menu" to leave this conversation flow.');
    return;
  }
  if (/^[\p{L}\p{N}]{1,3}-\d{4,}$/u.test(textBody ?? '') && session.state !== 'checking_status') {
    await startCheckStatusFlow(phone, 0, textBody!.toUpperCase());
    return;
  }
  if (['awaiting_institution', 'awaiting_counter'].includes(session.state) && /^list_page_\d+$/.test(textBody ?? '')) {
    await showListPage(phone, session.data.listRows ?? [], Number(textBody!.slice(10)));
    return;
  }
  switch (session.state) {
    case 'awaiting_institution':
    case 'awaiting_counter':
    case 'awaiting_name':
    case 'awaiting_confirmation':
      await processJoinQueueFlow(phone, session, textBody, message);
      break;
    case 'checking_status':
      await processCheckStatusFlow(phone, session, textBody, message);
      break;
    case 'support_escalated':
      await processSupportFlow(phone, session, textBody, message);
      break;
    default:
      await client.sendText(phone, 'Type "join" for a new token, "status" for your tokens, or "menu" for options.');
  }
}
