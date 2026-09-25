import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../whatsapp/session', async (importOriginal) => ({
  ...await importOriginal<typeof import('../whatsapp/session')>(),
  getSession: vi.fn(),
  updateSession: vi.fn(),
  resetSession: vi.fn(),
  extractPhoneFromMessage: () => '15551234567',
  getTextBody: (message: { text?: { body: string }; interactive?: { button_reply: { id: string } } }) => message.text?.body ?? message.interactive?.button_reply.id,
  isInteractiveListReply: () => false,
  isInteractiveButtonReply: () => false,
}));
vi.mock('../whatsapp/client', () => ({
  getWhatsAppClient: () => client,
}));
vi.mock('../flows/checkStatus', () => ({ processCheckStatusFlow: vi.fn(), startCheckStatusFlow: vi.fn() }));
vi.mock('../config', () => ({ getEnv: () => ({ PHONE_NUMBER_ID: 'test' }) }));

const client = vi.hoisted(() => ({
  markAsRead: vi.fn(), sendText: vi.fn(), sendInteractiveButtons: vi.fn(),
}));

import { getSession, updateSession, resetSession, clearedIntake } from '../whatsapp/session';
import { processCheckStatusFlow, startCheckStatusFlow } from '../flows/checkStatus';
import { handleWebhook } from './handler';

async function send(text: string, button = false, phoneNumberId = 'test') {
  const req = { body: {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: phoneNumberId },
      messages: [button
        ? { from: '15551234567', id: 'test', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: text, title: 'Check Status' } } }
        : { from: '15551234567', id: 'test', type: 'text', text: { body: text } }],
    } }] }],
  } } as Request;
  const res = { status: vi.fn().mockReturnThis(), send: vi.fn() };
  await handleWebhook(req, res as unknown as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
  client.markAsRead.mockResolvedValue(undefined);
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
      expect(updateSession).toHaveBeenCalledWith('15551234567', {
        state: 'idle', data: { ...clearedIntake, flow: undefined, step: undefined, awaitingHuman: undefined },
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
  it.each(['menu', 'status', 'support'])('clears sensitive unfinished intake on %s without deleting saved tokens', async (command) => {
    vi.mocked(getSession).mockResolvedValue({
      phone: '15551234567', state: 'awaiting_intake', createdAt: 0, updatedAt: 0,
      data: { step: 9, customerName: 'Private Customer', customerCnic: '0123456789012', reuseIntake: true, profileRef: 73, profileInstitutionId: '1', tokenNumber: 'GEN-0042' },
    });
    await send(command);
    const data = vi.mocked(updateSession).mock.calls[0][1].data!;
    expect(data).toMatchObject(clearedIntake);
    expect(Object.hasOwn(data, 'customerCnic')).toBe(true);
    expect(Object.hasOwn(data, 'profileRef')).toBe(true);
    expect(data.profileRef).toBeUndefined();
    expect(data.profileInstitutionId).toBeUndefined();
    expect(Object.hasOwn(data, 'tokenNumber')).toBe(false);
    expect(resetSession).not.toHaveBeenCalled();
  });
  it('routes the new intake state to priority handling', async () => {
    vi.mocked(getSession).mockResolvedValue({
      phone: '15551234567', state: 'awaiting_intake', createdAt: 0, updatedAt: 0,
      data: { step: 9, institutionType: 'hospital' },
    });
    await send('priority_elderly', true);
    expect(updateSession).toHaveBeenCalledWith('15551234567', { data: { priorityReason: 'elderly', step: 3 } });
  });

  it('looks up existing tokens even with no saved chat token', async () => {
    vi.mocked(getSession).mockResolvedValue({
      phone: '123', state: 'idle', data: {}, createdAt: 0, updatedAt: 0,
    });
    await send('status');
    expect(startCheckStatusFlow).toHaveBeenCalledWith('15551234567');
  });
  it.each(['status', 'check', 'my token'])('routes %s out of an existing flow', async (command) => {
    await send(command);
    expect(startCheckStatusFlow).toHaveBeenCalledWith('15551234567');
  });
  it('does not claim cancellation happened', async () => {
    await send('cancel');
    expect(client.sendText).toHaveBeenCalledWith('15551234567', expect.stringContaining('has not been changed'));
  });
  it('continues after failed read receipt', async () => {
    client.markAsRead.mockRejectedValueOnce(new Error('failed'));
    await send('status');
    expect(startCheckStatusFlow).toHaveBeenCalled();
  });
  it('routes the Check Status button from another conversation flow', async () => {
    await send('status', true);
    expect(startCheckStatusFlow).toHaveBeenCalledWith('15551234567');
  });
  it('ignores events for other business phone-number IDs', async () => {
    await send('status', false, 'other-business');
    expect(getSession).not.toHaveBeenCalled();
    expect(startCheckStatusFlow).not.toHaveBeenCalled();
  });
});
