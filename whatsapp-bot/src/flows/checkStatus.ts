import { getSession, updateSession, resetSession } from '../whatsapp/session';
import { getWhatsAppClient } from '../whatsapp/client';
import { getEnv } from '../config';
import { WhatsAppMessage } from '../whatsapp/types';
import { TokenPublic } from '../api/types';

export async function processCheckStatusFlow(
  phone: string,
  session: Awaited<ReturnType<typeof getSession>>,
  textBody: string | null,
  message: WhatsAppMessage
): Promise<void> {
  const waClient = getWhatsAppClient();

  if (!textBody) {
    await waClient.sendText(phone, 'Please enter your token number (e.g., GEN-0042).');
    return;
  }

  const tokenNumber = textBody.trim().toUpperCase();

  if (!/^[A-Z]{3}\d{4,}$/i.test(tokenNumber)) {
    await waClient.sendText(phone, 'Invalid token format. Please enter a valid token number (e.g., GEN-0042).');
    return;
  }

  await checkTokenByNumber(phone, tokenNumber);
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

    const token = (await response.json()) as TokenPublic;
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

    const trackingUrl = `${getEnv().BACKEND_API_URL.replace('/api/v1', '')}/token/${token.token_number}?institution=${token.institution_id}`;

    await waClient.sendText(
      phone,
      `${statusEmoji[token.status] || '❓'} Token: ${token.token_number}\n` +
      `Status: ${token.status.replace('_', ' ').toUpperCase()}\n` +
      `Counter: ${token.counter_name}\n` +
      `Position: ${position}${estWait}\n` +
      `Issued: ${new Date(token.issued_at).toLocaleString()}\n\n` +
      `🔗 Track live: ${trackingUrl}\n\n` +
      `Type another token number to check, "join" to get a new token, or "menu" for main menu.`
    );

    if (['waiting', 'called', 'in_service'].includes(token.status)) {
      await updateSession(phone, {
        state: 'in_queue',
        data: { tokenNumber: token.token_number, tokenId: token.id, institutionId: token.institution_id, flow: undefined },
      });
    } else {
      await resetSession(phone);
    }
  } catch (error) {
    console.error('Token lookup failed:', error);
    await waClient.sendText(phone, 'Unable to check token right now. Please try again later.');
  }
}