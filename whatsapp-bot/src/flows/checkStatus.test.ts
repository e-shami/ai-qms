import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSession } from '../whatsapp/session';
import type { WhatsAppMessage } from '../whatsapp/types';

const client = vi.hoisted(() => ({ sendText: vi.fn(), sendInteractiveList: vi.fn() }));
vi.mock('../whatsapp/client', () => ({ getWhatsAppClient: () => client }));
vi.mock('../whatsapp/session', () => ({ getSession: vi.fn(), updateSession: vi.fn() }));
vi.mock('../config', () => ({ getEnv: () => ({ BACKEND_API_URL: 'http://backend/api/v1', INTERNAL_API_KEY: 'test', PUBLIC_WEB_URL: 'https://qms.example' }) }));
import { processCheckStatusFlow, startCheckStatusFlow } from './checkStatus';
import { updateSession } from '../whatsapp/session';

const ticket = { id: 42, institution_id: 7, institution_name: 'Test institution', token_number: 'GEN-0042', status: 'waiting', counter_name: 'General', position: 1, estimated_wait_min: 0, issued_at: '2026-09-15T10:00:00Z' };
const session: UserSession = { phone: '15551234567', state: 'checking_status', data: {}, createdAt: 0, updatedAt: 0 };
const fetchMock = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetchMock); });
function respond(items: unknown[], has_more = false) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ items, has_more }) });
}

describe('phone-scoped status', () => {
  it.each(['pending', 'approved', 'rejected', 'normal'])('shows safe %s priority status from the server', async priority_review => {
    respond([{ ...ticket, priority_review, requested_priority: 'accessibility', effective_priority: priority_review === 'approved' ? 'accessibility' : 'normal', priority_reason: 'disability', customer_cnic: '0000000000001' }]);
    await startCheckStatusFlow(session.phone);
    const output = client.sendText.mock.calls[0][1];
    expect(output).toContain(priority_review === 'normal' ? 'returned to normal' : priority_review);
    expect(output).not.toMatch(/disability|0000000000001/);
    expect(output).toContain('Effective priority:');
  });
  it('retrieves a website-issued copy without creating another token or sending to its stored recipient', async () => {
    respond([{ ...ticket, customer_phone: '19999999999' }]);
    await startCheckStatusFlow(session.phone);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/internal/bot/tokens/lookup');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).phone).toBe(session.phone);
    expect(client.sendText).toHaveBeenCalledTimes(1);
    expect(client.sendText.mock.calls[0][0]).toBe(session.phone);
    expect(client.sendText.mock.calls[0][1]).toContain('Token: GEN-0042');
  });
  it('auto-displays a single existing token with position and zero wait', async () => {
    respond([ticket]);
    await startCheckStatusFlow(session.phone);
    expect(fetchMock).toHaveBeenCalledWith('http://backend/api/v1/internal/bot/tokens/lookup', expect.objectContaining({ method: 'POST', body: JSON.stringify({ phone: session.phone, offset: 0 }) }));
    expect(client.sendText).toHaveBeenCalledWith(session.phone, expect.stringContaining('Position: 1\nEstimated wait: 0 min'));
    expect(client.sendText).toHaveBeenCalledWith(session.phone, expect.stringContaining('https://qms.example/token/GEN-0042?institution=7'));
    expect(client.sendInteractiveList).not.toHaveBeenCalled();
  });
  it('offers distinct IDs for colliding token numbers across institutions', async () => {
    respond([ticket, { ...ticket, id: 43, institution_id: 8 }]);
    await startCheckStatusFlow(session.phone);
    expect(client.sendInteractiveList.mock.calls[0][4][0].rows.map((row: { id: string }) => row.id)).toEqual(['ticket_42', 'ticket_43']);
  });
  it('uses at most ten rows with both navigation directions', async () => {
    respond(Array.from({ length: 8 }, (_, id) => ({ ...ticket, id })), true);
    await startCheckStatusFlow(session.phone, 8);
    const rows = client.sendInteractiveList.mock.calls[0][4][0].rows;
    expect(rows).toHaveLength(10);
    expect(rows[8].id).toBe('status_page_0');
    expect(rows[9].id).toBe('status_page_16');
  });
  it('refreshes a selected ID with the sender phone', async () => {
    respond([ticket]);
    await processCheckStatusFlow(session.phone, { ...session, data: { statusTokenIds: [42] } }, 'ticket_42', {} as WhatsAppMessage);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ phone: session.phone, offset: 0, token_id: 42 });
  });
  it('rejects stale or forged selections without fetching', async () => {
    await processCheckStatusFlow(session.phone, session, 'ticket_99', {} as WhatsAppMessage);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['GEN-0042', 'Q-0001', '123-0001'])('accepts backend format %s without a step-1 trap', async number => {
    respond([ticket]);
    await processCheckStatusFlow(session.phone, session, number, {} as WhatsAppMessage);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).token_number).toBe(number);
  });
  it('explains lookup scope when no phone-linked tokens exist', async () => {
    respond([]);
    await startCheckStatusFlow(session.phone);
    expect(client.sendText).toHaveBeenCalledWith(session.phone, expect.stringContaining('No matching active tokens are linked to this WhatsApp number. Served, declined, and no-show tokens are not listed.'));
    expect(updateSession).toHaveBeenCalled();
  });
  it('handles backend rejection without exposing response data', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    await startCheckStatusFlow(session.phone);
    expect(client.sendText).toHaveBeenCalledWith(session.phone, expect.stringContaining('Unable to check tokens'));
  });
});
