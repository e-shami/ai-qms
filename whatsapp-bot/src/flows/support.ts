import { getSession } from '../whatsapp/session';
import { getWhatsAppClient } from '../whatsapp/client';
import { WhatsAppMessage } from '../whatsapp/types';
import { startCheckStatusFlow } from './checkStatus';

export async function processSupportFlow(phone: string, _session: Awaited<ReturnType<typeof getSession>>, textBody: string | null, _message: WhatsAppMessage): Promise<void> {
  const client = getWhatsAppClient();
  if (textBody === 'support_token') {
    await startCheckStatusFlow(phone);
  } else if (textBody === 'support_queue' || textBody === 'support_human') {
    await client.sendText(phone, 'Please contact the institution directly or speak to staff on-site for queue issues, corrections, or cancellation. This bot cannot connect you to a human agent or forward messages. Type "status" to check tokens or "menu" for options.');
  } else {
    await client.sendInteractiveButtons(phone, 'Support Options', 'How can we help you?', [
      { id: 'support_queue', title: 'Queue Issue' },
      { id: 'support_token', title: 'Token Problem' },
      { id: 'support_human', title: 'Contact Staff' },
    ], 'Type "menu" to return to main menu.');
  }
}
