import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSession } from '../whatsapp/session';
import type { WhatsAppMessage } from '../whatsapp/types';

const client = vi.hoisted(() => ({ sendInteractiveButtons: vi.fn(), sendText: vi.fn(), sendInteractiveList: vi.fn() }));
vi.mock('../config', () => ({ getEnv: () => ({ BACKEND_API_URL: 'http://backend/api/v1', INTERNAL_API_KEY: 'test', PUBLIC_WEB_URL: 'https://qms.example' }) }));
vi.mock('../whatsapp/client', () => ({ getWhatsAppClient: () => client }));
vi.mock('../whatsapp/session', async (importOriginal) => ({
  ...await importOriginal<typeof import('../whatsapp/session')>(),
  getSession: vi.fn(), updateSession: vi.fn(), resetSession: vi.fn(),
}));
import { updateSession, clearedIntake } from '../whatsapp/session';
import { processJoinQueueFlow, startJoinQueueFlow } from './joinQueue';

const session: UserSession = {
  phone: '123', state: 'awaiting_name', createdAt: 0, updatedAt: 0,
  data: { step: 3, institutionName: 'Test institution', counterName: 'General' },
};
const message = { type: 'text' } as WhatsAppMessage;

beforeEach(() => vi.resetAllMocks());

describe('name confirmation', () => {
  it.each(['Alex', 'skip'])('sends a valid confirmation for %s before advancing', async (name) => {
    client.sendInteractiveButtons.mockImplementation(async (...args: unknown[]) => {
      expect(String(args[5]).length).toBeLessThanOrEqual(60);
      expect(updateSession).not.toHaveBeenCalled();
      expect(String(args[2])).not.toContain('Alex');
    });
    await processJoinQueueFlow('123', session, name, message);
    expect(updateSession).toHaveBeenCalledWith('123', {
      state: 'awaiting_confirmation',
      data: { customerName: name === 'skip' ? undefined : name, step: 4 },
    });
  });

  it('does not advance when Meta rejects the confirmation', async () => {
    client.sendInteractiveButtons.mockRejectedValue(new Error('Send failed'));
    await expect(processJoinQueueFlow('123', session, 'skip', message)).rejects.toThrow('Send failed');
    expect(updateSession).not.toHaveBeenCalled();
  });
});

describe('public API contracts', () => {
  it('does not invent institution counter counts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 1, name: 'Test institution', type: 'Hospital' }] }));
    await startJoinQueueFlow('123');
    expect(client.sendInteractiveList.mock.calls[0][4][0].rows).toEqual([{ id: 'inst_1', title: 'Test institution', description: 'Hospital' }]);
  });
  it('uses real counter fields and retains full names from server-side options', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 2, name: 'General service counter', type: null }] }));
    await processJoinQueueFlow('123', { ...session, state: 'awaiting_institution', data: { step: 1, listRows: [{ id: 'inst_1', title: 'Full institution name' }] } }, 'inst_1', {
      type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'inst_1', title: 'Truncated name' } },
    } as WhatsAppMessage);
    expect(client.sendInteractiveList.mock.calls[0][4][0].rows[0].description).toBe('Service counter');
    expect(updateSession).toHaveBeenLastCalledWith('123', { state: 'awaiting_counter', data: { institutionId: '1', institutionName: 'Full institution name', institutionType: undefined, step: 2 } });
  });
  it('uses position and known institution scope when issuing a public ticket without IDs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token_number: 'GEN-0042', position: 1, estimated_wait_min: 0, issued_at: '2026-09-15T10:00:00Z' }) });
    vi.stubGlobal('fetch', fetchMock);
    await processJoinQueueFlow('123', { ...session, state: 'awaiting_confirmation', data: { step: 4, institutionId: '7', counterId: '8', customerCnic: '0123456789012', referralSource: 'website' } }, 'confirm_yes', {
      type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'confirm_yes', title: 'Yes' } },
    } as WhatsAppMessage);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ institution_id: '7', counter_id: '8', customer_phone: '123' });
    expect(client.sendText).toHaveBeenCalledWith('123', expect.stringContaining('Position: 1 ~0 min'));
    expect(client.sendText).toHaveBeenCalledWith('123', expect.stringContaining('?institution=7'));
    expect(updateSession).toHaveBeenCalledWith('123', { state: 'in_queue', data: { ...clearedIntake, tokenNumber: 'GEN-0042', tokenId: undefined, flow: undefined, step: undefined } });
  });
});
