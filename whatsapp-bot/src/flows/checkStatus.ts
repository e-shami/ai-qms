import { getSession, updateSession } from '../whatsapp/session';
import { getWhatsAppClient } from '../whatsapp/client';
import { getEnv } from '../config';
import { WhatsAppMessage } from '../whatsapp/types';
import { BotTicket } from '../api/types';
import { priorityStatus } from '../api/priority';

export async function startCheckStatusFlow(phone: string, offset = 0, tokenNumber?: string, tokenId?: number): Promise<void> {
  const client = getWhatsAppClient();
  try {
    const response = await fetch(`${getEnv().BACKEND_API_URL}/internal/bot/tokens/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-API-Key': getEnv().INTERNAL_API_KEY },
      body: JSON.stringify({ phone, offset, token_number: tokenNumber, token_id: tokenId }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Lookup HTTP ${response.status}`);
    const page = await response.json() as { items: BotTicket[]; has_more: boolean };
    await updateSession(phone, { state: 'checking_status', data: {
      flow: 'check_status', step: 2, statusFilter: tokenNumber,
      statusTokenIds: page.items.map(t => t.id), statusOffset: offset, statusHasMore: page.has_more,
    } });
    if (!page.items.length) {
      await client.sendText(phone, 'No matching active tokens are linked to this WhatsApp number. Served, declined, and no-show tokens are not listed. Type "join" for a new token or contact institution staff if an active token is missing.');
      return;
    }
    if (page.items.length === 1 && !page.has_more && offset === 0) {
      const token = page.items[0];
      const webUrl = getEnv().PUBLIC_WEB_URL;
      await client.sendText(phone,
        `Token: ${token.token_number}\nInstitution: ${token.institution_name}\n` +
        `Counter: ${token.counter_name}\nStatus: ${token.status.replace(/_/g, ' ').toUpperCase()}\n` +
        `${priorityStatus(token)}\n` +
        `Position: ${token.position ?? 'N/A'}\nEstimated wait: ${token.estimated_wait_min == null ? 'N/A' : `${token.estimated_wait_min} min`}\n` +
        `Issued: ${new Date(token.issued_at).toLocaleString()}\n\n` +
        (webUrl ? `Track: ${webUrl.replace(/\/$/, '')}/token/${encodeURIComponent(token.token_number)}?institution=${token.institution_id}\n\n` : '') +
        'Type "status" for your active tokens, "join" for a new token, or "support" for help.');
      return;
    }
    const rows = page.items.map(t => ({ id: `ticket_${t.id}`, title: t.token_number,
      description: `${t.institution_name} / ${t.counter_name} / ${t.status}` }));
    if (offset > 0) rows.push({ id: `status_page_${offset - 8}`, title: 'Previous page', description: 'Earlier results' });
    if (page.has_more) rows.push({ id: `status_page_${offset + 8}`, title: 'Next page', description: 'More tokens' });
    await client.sendInteractiveList(phone, 'Your Active Tokens', 'Select an active token to see its current status (newest first).', 'Choose Token', [{ title: 'Tokens', rows }], 'Type "menu" for main menu.');
  } catch {
    console.error('Token lookup or delivery failed');
    await client.sendText(phone, 'Unable to check tokens right now. Please try "status" again later.');
  }
}

export async function processCheckStatusFlow(phone: string, session: Awaited<ReturnType<typeof getSession>>, textBody: string | null, _message: WhatsAppMessage): Promise<void> {
  const selection = /^ticket_(\d+)$/.exec(textBody ?? '');
  if (selection && session.data.statusTokenIds?.includes(Number(selection[1]))) {
    await startCheckStatusFlow(phone, 0, undefined, Number(selection[1]));
    return;
  }
  const page = /^status_page_(\d+)$/.exec(textBody ?? '');
  const offset = Number(page?.[1]);
  const current = session.data.statusOffset ?? 0;
  if (page && ((offset === current - 8 && offset >= 0) || (offset === current + 8 && session.data.statusHasMore))) {
    await startCheckStatusFlow(phone, offset, session.data.statusFilter);
    return;
  }
  // Existing saved-token buttons remain usable, but lookup is always phone-scoped.
  if (textBody === 'check_saved') {
    await startCheckStatusFlow(phone);
    return;
  }
  if (/^[\p{L}\p{N}]{1,3}-\d{4,}$/u.test(textBody ?? '')) {
    await startCheckStatusFlow(phone, 0, textBody!.toUpperCase());
    return;
  }
  await getWhatsAppClient().sendText(phone, 'Enter a token number (e.g., GEN-0042), select a token above, or type "status" for your active tokens. Only tokens linked to your phone can be recovered here.');
}
