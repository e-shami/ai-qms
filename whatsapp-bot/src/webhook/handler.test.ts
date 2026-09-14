import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../whatsapp/session', () => ({
  getSession: vi.fn(),
  updateSession: vi.fn(),
  resetSession: vi.fn(),
  extractPhoneFromMessage: () => '123',
  getTextBody: (message: { text: { body: string } }) => message.text.body,
  isInteractiveListReply: () => false,
  isInteractiveButtonReply: () => false,
}));
vi.mock('../whatsapp/client', () => ({
  getWhatsAppClient: () => client,
}));
vi.mock('../flows/checkStatus', () => ({ processCheckStatusFlow: vi.fn() }));

const client = vi.hoisted(() => ({
  markAsRead: vi.fn(), sendText: vi.fn(), sendInteractiveButtons: vi.fn(),
}));

import { getSession, updateSession, resetSession } from '../whatsapp/session';
import { processCheckStatusFlow } from '../flows/checkStatus';
import { handleWebhook } from './handler';

async function send(text: string) {
  const req = { body: {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: 'test' },
      messages: [{ from: '123', id: 'test', type: 'text', text: { body: text } }],
    } }] }],
  } } as Request;
  const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
  await handleWebhook(req, res as unknown as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({
    phone: '123', state: 'checking_status',
    data: { tokenNumber: 'GEN-0042', flow: 'check_status' },
    createdAt: 0, updatedAt: 0,
  });
});

describe('global menu navigation', () => {
  it.each(['hi', ' Hi ', 'hello', 'hey', 'menu', 'help', 'restart', 'start over'])
    ('exits status entry for %s without clearing token data', async (command) => {
      await send(command);
      expect(updateSession).toHaveBeenCalledWith('123', {
        state: 'idle', data: { flow: undefined, step: undefined, awaitingHuman: undefined },
      });
      expect(resetSession).not.toHaveBeenCalled();
      expect(client.sendInteractiveButtons).toHaveBeenCalled();
      expect(processCheckStatusFlow).not.toHaveBeenCalled();
    });

  it('continues validating ordinary status input', async () => {
    await send('GEN-0042');
    expect(processCheckStatusFlow).toHaveBeenCalled();
    expect(client.sendInteractiveButtons).not.toHaveBeenCalled();
  });

  it('explains missing chat token when status is selected from idle', async () => {
    vi.mocked(getSession).mockResolvedValue({
      phone: '123', state: 'idle', data: {}, createdAt: 0, updatedAt: 0,
    });
    await send('status');
    expect(client.sendText).toHaveBeenCalledWith('123', expect.stringContaining('No token is saved in this chat'));
  });
});
