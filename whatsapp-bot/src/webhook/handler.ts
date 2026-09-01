import { Request, Response } from 'express';
import { getEnv } from '../config';
import { WhatsAppWebhookPayload, WhatsAppMessage } from '../whatsapp/types';
import { getSession, updateSession, resetSession, extractPhoneFromMessage, getTextBody, isInteractiveListReply, isInteractiveButtonReply } from '../whatsapp/session';
import { getWhatsAppClient } from '../whatsapp/client';
import { processJoinQueueFlow } from '../flows/joinQueue';
import { processCheckStatusFlow } from '../flows/checkStatus';
import { processSupportFlow } from '../flows/support';
import { InstitutionPublic } from '../api/types';

export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const body = req.body as WhatsAppWebhookPayload;

  res.status(200).send('EVENT_RECEIVED');

  if (body.object !== 'whatsapp_business_account') {
    return;
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;

      if (value.statuses) {
        for (const status of value.statuses) {
          console.log('📱 Message status:', status.id, status.status);
        }
        continue;
      }

      if (value.messages) {
        for (const message of value.messages) {
          try {
            await processIncomingMessage(message, value.metadata.phone_number_id);
          } catch (error) {
            console.error('❌ Error processing message:', error);
            const phone = extractPhoneFromMessage(message);
            await getWhatsAppClient().sendText(
              phone,
              'Sorry, something went wrong. Please try again or type "help" for assistance.'
            );
          }
        }
      }
    }
  }
}

async function processIncomingMessage(message: WhatsAppMessage, phoneNumberId: string): Promise<void> {
  const phone = extractPhoneFromMessage(message);
  const session = await getSession(phone);
  const textBody = getTextBody(message);
  const waClient = getWhatsAppClient();

  await waClient.markAsRead(message.id);

  console.log(`📨 From ${phone} (state: ${session.state}):`, textBody ?? `${message.type} message`);

  const isHelp = textBody?.toLowerCase() === 'help' || textBody?.toLowerCase() === 'menu';
  const isRestart = textBody?.toLowerCase() === 'restart' || textBody?.toLowerCase() === 'start over';

  if (isRestart) {
    await resetSession(phone);
    await waClient.sendText(phone, '🔄 Session restarted. Type "help" to see what I can do.');
    return;
  }

  if (isHelp) {
    await showHelpMenu(phone);
    return;
  }

  switch (session.state) {
    case 'idle':
      await handleIdleState(phone, textBody, message);
      break;

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

    case 'in_queue':
      await handleInQueueState(phone, textBody, message);
      break;

    default:
      await waClient.sendText(phone, "I'm not sure how to handle that. Type 'help' for options.");
  }
}

async function handleIdleState(phone: string, textBody: string | null, message: WhatsAppMessage): Promise<void> {
  const waClient = getWhatsAppClient();
  const normalized = textBody?.toLowerCase().trim();

  if (!normalized) {
    await showHelpMenu(phone);
    return;
  }

  if (normalized === 'join' || normalized === 'queue' || normalized === 'token') {
    await startJoinQueueFlow(phone);
    return;
  }

  if (normalized === 'status' || normalized === 'check' || normalized === 'my token') {
    await startCheckStatusFlow(phone);
    return;
  }

  if (normalized === 'support' || normalized === 'help' || normalized === 'agent') {
    await startSupportFlow(phone);
    return;
  }

  if (/^[A-Z]{3}\d{4,}$/i.test(normalized)) {
    await checkTokenByNumber(phone, normalized.toUpperCase());
    return;
  }

  await showHelpMenu(phone);
}

async function handleInQueueState(phone: string, textBody: string | null, message: WhatsAppMessage): Promise<void> {
  const waClient = getWhatsAppClient();
  const normalized = textBody?.toLowerCase().trim();

  if (!normalized) {
    await waClient.sendText(phone, 'You have an active token. Type "status" to check your position, "cancel" to leave the queue, or "support" to talk to an agent.');
    return;
  }

  if (normalized === 'status' || normalized === 'position' || normalized === 'wait') {
    const session = await getSession(phone);
    if (session.data.tokenNumber) {
      await checkTokenByNumber(phone, session.data.tokenNumber);
    } else {
      await waClient.sendText(phone, "I couldn't find your token. Please provide your token number.");
    }
    return;
  }

  if (normalized === 'cancel' || normalized === 'leave' || normalized === 'exit') {
    const session = await getSession(phone);
    if (session.data.tokenId) {
      await waClient.sendInteractiveButtons(
        phone,
        'Cancel Token',
        `Are you sure you want to cancel token ${session.data.tokenNumber}?`,
        [
          { id: 'confirm_cancel', title: 'Yes, cancel' },
          { id: 'keep_token', title: 'No, keep it' },
        ],
        'This will remove you from the queue.'
      );
      await updateSession(phone, { state: 'awaiting_confirmation', data: { flow: 'cancel_token' } });
      return;
    }
    await waClient.sendText(phone, "No active token to cancel.");
    return;
  }

  if (normalized === 'support' || normalized === 'agent') {
    await startSupportFlow(phone);
    return;
  }

  await waClient.sendText(phone, 'You have an active token. Type "status" to check position, "cancel" to leave queue, or "support" for help.');
}

async function startJoinQueueFlow(phone: string): Promise<void> {
  const waClient = getWhatsAppClient();

  try {
    const response = await fetch(`${getEnv().BACKEND_API_URL}/public/institutions`, {
      headers: { 'X-Internal-API-Key': getEnv().INTERNAL_API_KEY },
    });

    if (!response.ok) throw new Error('Failed to fetch institutions');
    const institutions = (await response.json()) as InstitutionPublic[];

    if (!institutions.length) {
      await waClient.sendText(phone, 'No institutions are currently available. Please try again later.');
      return;
    }

    const sections = [{
      title: 'Select Institution',
      rows: institutions.map((inst) => ({
        id: `inst_${inst.id}`,
        title: inst.name,
        description: `${inst.type} • ${inst.counters?.length ?? 0} counters`,
      })),
    }];

    await waClient.sendInteractiveList(
      phone,
      '🏢 Choose Institution',
      'Select the institution where you want to join a queue:',
      'Choose Institution',
      sections,
      'Type "restart" to cancel anytime.'
    );

    await updateSession(phone, { state: 'awaiting_institution', data: { flow: 'join_queue', step: 1 } });
  } catch (error) {
    console.error('Failed to fetch institutions:', error);
    await waClient.sendText(phone, 'Unable to load institutions right now. Please try again later.');
  }
}

async function startCheckStatusFlow(phone: string): Promise<void> {
  const waClient = getWhatsAppClient();
  await waClient.sendText(phone, 'Please enter your token number (e.g., GEN-0042) or institution code + token:');
  await updateSession(phone, { state: 'checking_status', data: { flow: 'check_status' } });
}

async function startSupportFlow(phone: string): Promise<void> {
  const waClient = getWhatsAppClient();
  await waClient.sendInteractiveButtons(
    phone,
    '🤝 Support Options',
    'How can we help you?',
    [
      { id: 'support_queue', title: 'Queue Issue' },
      { id: 'support_token', title: 'Token Problem' },
      { id: 'support_human', title: 'Talk to Human' },
    ],
    'Type "restart" to return to main menu.'
  );
  await updateSession(phone, { state: 'support_escalated', data: { flow: 'support' } });
}

async function checkTokenByNumber(phone: string, tokenNumber: string): Promise<void> {
  const waClient = getWhatsAppClient();

  try {
    const response = await fetch(`${getEnv().BACKEND_API_URL}/public/tokens/${encodeURIComponent(tokenNumber)}`, {
      headers: { 'X-Internal-API-Key': getEnv().INTERNAL_API_KEY },
    });

    if (!response.ok) {
      if (response.status === 404) {
        await waClient.sendText(phone, `Token ${tokenNumber} not found. Please check the number and try again.`);
        return;
      }
      throw new Error(`API error: ${response.status}`);
    }

    const token = (await response.json()) as {
      token_number: string;
      status: string;
      counter_name: string;
      queue_position?: number | null;
      estimated_wait_min?: number | null;
      issued_at: string;
      id: string;
      institution_id: string;
    };
    const statusEmoji: Record<string, string> = {
      waiting: '⏳',
      called: '📢',
      in_service: '🔄',
      served: '✅',
      no_show: '❌',
      declined: '⚠️',
    };

    const position = token.queue_position ?? 'N/A';
    const estWait = token.estimated_wait_min ? ` ~${token.estimated_wait_min} min` : '';

    await waClient.sendText(
      phone,
      `${statusEmoji[token.status] || '❓'} Token: ${token.token_number}\n` +
      `Status: ${token.status.replace('_', ' ').toUpperCase()}\n` +
      `Counter: ${token.counter_name}\n` +
      `Position: ${position}${estWait}\n` +
      `Issued: ${new Date(token.issued_at).toLocaleString()}\n\n` +
      `Track live: ${getEnv().BACKEND_API_URL.replace('/api/v1', '')}/token/${token.token_number}?institution=${token.institution_id}\n` +
      `Type "status" to check again, "cancel" to leave queue.`
    );

    await updateSession(phone, {
      state: 'in_queue',
      data: { tokenNumber: token.token_number, tokenId: token.id, institutionId: token.institution_id },
    });
  } catch (error) {
    console.error('Token lookup failed:', error);
    await waClient.sendText(phone, 'Unable to check token right now. Please try again later.');
  }
}

async function showHelpMenu(phone: string): Promise<void> {
  const waClient = getWhatsAppClient();
  await waClient.sendInteractiveButtons(
    phone,
    '🤖 AI-QMS Assistant',
    'How can I help you today?',
    [
      { id: 'join', title: 'Join Queue' },
      { id: 'status', title: 'Check Status' },
      { id: 'support', title: 'Support' },
    ],
    'You can also type a token number directly (e.g., GEN-0042).'
  );
}