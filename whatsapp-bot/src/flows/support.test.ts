import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSession } from '../whatsapp/session';
import type { WhatsAppMessage } from '../whatsapp/types';
const client = vi.hoisted(() => ({ sendText: vi.fn(), sendInteractiveButtons: vi.fn() }));
vi.mock('../whatsapp/client', () => ({ getWhatsAppClient: () => client }));
vi.mock('./checkStatus', () => ({ startCheckStatusFlow: vi.fn() }));
import { processSupportFlow } from './support';
import { startCheckStatusFlow } from './checkStatus';
beforeEach(() => vi.clearAllMocks());
describe('honest support', () => {
  it('routes token problems through the same automatic lookup', async () => {
    await processSupportFlow('test', {} as UserSession, 'support_token', {} as WhatsAppMessage);
    expect(startCheckStatusFlow).toHaveBeenCalledWith('test');
  });
  it('does not promise an agent or forwarded message', async () => {
    await processSupportFlow('test', {} as UserSession, 'support_human', {} as WhatsAppMessage);
    expect(client.sendText).toHaveBeenCalledWith('test', expect.stringContaining('cannot connect you to a human agent or forward messages'));
  });
});
