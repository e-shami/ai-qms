import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSession } from '../whatsapp/session';
import type { WhatsAppMessage } from '../whatsapp/types';

const client = vi.hoisted(() => ({ sendInteractiveButtons: vi.fn(), sendText: vi.fn() }));
vi.mock('../whatsapp/client', () => ({ getWhatsAppClient: () => client }));
vi.mock('../whatsapp/session', () => ({
  getSession: vi.fn(), updateSession: vi.fn(), resetSession: vi.fn(),
}));
import { updateSession } from '../whatsapp/session';
import { processJoinQueueFlow } from './joinQueue';

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
