import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSession } from '../whatsapp/session';
import type { WhatsAppMessage } from '../whatsapp/types';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const contract = JSON.parse(readFileSync(resolve(__dirname, '../../../backend/tests/bot_intake_contract.json'), 'utf8'));

const client = vi.hoisted(() => ({ sendText: vi.fn(), sendInteractiveButtons: vi.fn(), sendInteractiveList: vi.fn() }));
vi.mock('../config', () => ({ getEnv: () => ({ BACKEND_API_URL: 'http://backend/api/v1', INTERNAL_API_KEY: 'test' }) }));
vi.mock('../whatsapp/client', () => ({ getWhatsAppClient: () => client }));
vi.mock('../whatsapp/session', async (original) => ({
  ...await original<typeof import('../whatsapp/session')>(), getSession: vi.fn(), updateSession: vi.fn(),
}));
import { getSession, updateSession, clearedIntake } from '../whatsapp/session';
import { processJoinQueueFlow, startJoinQueueFlow } from './joinQueue';

let session: UserSession;
const fetchMock = vi.fn();
const ticket = contract.ticket;
function respond(value: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => value });
}
async function input(body: string, kind: 'text' | 'button' | 'list' = 'text') {
  const message = kind === 'text' ? { type: 'text', text: { body } }
    : { type: 'interactive', interactive: { type: `${kind}_reply`, [`${kind}_reply`]: { id: body, title: 'Untrusted title' } } };
  await processJoinQueueFlow(session.phone, structuredClone(session), body.trim(), message as WhatsAppMessage);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  session = { phone: '15551234567', state: 'awaiting_intake', createdAt: 0, updatedAt: 0,
    data: { flow: 'join_queue', step: 6, institutionId: '1', institutionName: 'Hospital', institutionType: 'hospital', counterId: '2', counterName: 'General', tokenNumber: 'OLD-0001' } };
  vi.mocked(getSession).mockImplementation(async () => structuredClone(session));
  vi.mocked(updateSession).mockImplementation(async (_phone, updates) => {
    session = { ...session, ...updates, data: { ...session.data, ...updates.data } };
    return structuredClone(session);
  });
});

describe('intake validation and routing', () => {
  it.each(['123', '12345678901234', '01234-6789012', ' 0123456789012 ', '\u0660'.repeat(13), '\uff10'.repeat(13)])('rejects malformed CNIC %s without echoing it', async (value) => {
    await input(value);
    expect(session.data.step).toBe(6);
    expect(session.data.customerCnic).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(client.sendText.mock.calls.map(call => call[1]))).not.toContain(value);
  });
  it.each(['elderly', 'disability', 'normal'])('issues hospital intake with %s request and no identity echo', async (reason) => {
    await input('0123456789012');
    expect(session.data.customerCnic).toBe('0123456789012');
    await input('ref_other', 'button');
    await input('   ');
    expect(session.data.step).toBe(8);
    await input('x'.repeat(256));
    expect(session.data.step).toBe(8);
    await input('Community organization');
    expect(session.data.step).toBe(9);
    await input(`priority_${reason}`, 'button');
    await input('Private Customer');
    respond({ ...ticket, requested_priority: reason === 'normal' ? 'normal' : 'accessibility', priority_review: reason === 'normal' ? 'not_requested' : 'pending' });
    await input('confirm_yes', 'button');
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toMatchObject({ customer_cnic: '0123456789012', referral_source: 'other', referral_organization: 'Community organization', requested_priority: reason === 'normal' ? 'normal' : 'accessibility' });
    expect(payload.priority_reason).toBe(reason === 'normal' ? undefined : reason);
    expect(session.state).toBe('in_queue');
    expect(session.data.customerName).toBeUndefined();
    expect(session.data.customerCnic).toBeUndefined();
    const outgoing = JSON.stringify([client.sendText.mock.calls, client.sendInteractiveButtons.mock.calls]);
    expect(outgoing).not.toContain('Private Customer');
    expect(outgoing).not.toContain('0123456789012');
    expect(outgoing).toContain(reason === 'normal' ? 'No accessibility priority requested' : 'pending staff verification');
    for (const [, header, body, buttons] of client.sendInteractiveButtons.mock.calls) {
      expect(header.length).toBeLessThanOrEqual(60);
      expect(body.length).toBeLessThanOrEqual(1024);
      expect(buttons.length).toBeLessThanOrEqual(3);
      for (const button of buttons) expect(button.title.length).toBeLessThanOrEqual(20);
    }
  });
  it.each(['bank', 'university', undefined])('skips priority for %s and suppresses stale requests', async (type) => {
    session.data.institutionType = type;
    session.data.priorityReason = 'elderly';
    await input('0123456789012');
    await input('ref_website', 'button');
    expect(session.data.step).toBe(3);
    expect(session.data.priorityReason).toBeUndefined();
  });
  it('does not issue incomplete stale confirmation', async () => {
    session.data.step = 4;
    await input('confirm_yes', 'button');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(session.state).toBe('idle');
  });
  it('uses the server institution type, not the interactive title or counter type', async () => {
    session.data.step = 1;
    session.data.profileRef = 73;
    session.data.profileInstitutionId = '2';
    session.data.listRows = [{ id: 'inst_1', title: 'A clinic', description: ' Hospital ' }];
    respond([{ id: 2, name: 'General', type: 'bank' }]);
    await input('inst_1', 'list');
    expect(session.data.institutionType).toBe('hospital');
    expect(session.data.profileRef).toBeUndefined();
  });
});

describe('profile reuse contract', () => {
  async function selectCounter(available: unknown = contract.profile.available, profile_ref: unknown = contract.profile.profile_ref) {
    session.data.step = 2;
    session.data.listRows = [{ id: 'cnt_2', title: 'General' }];
    respond({ available, profile_ref });
    await input('cnt_2', 'list');
  }
  it('requires explicit confirmation and sends only scoped reuse, never saved identity', async () => {
    await selectCounter();
    expect(session.state).toBe('awaiting_intake');
    expect(session.data.step).toBe(5);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ phone: session.phone, institution_id: '1' });
    await input('yes');
    expect(session.data.reuseIntake).toBeUndefined();
    await input('reuse_yes', 'button');
    await input('priority_normal', 'button');
    await input('skip');
    respond(ticket);
    await input('confirm_yes', 'button');
    expect(fetchMock.mock.calls[1][0]).toContain('/internal/bot/tokens/reuse');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ phone: session.phone, institution_id: '1', confirm_same_person: true, profile_ref: 73 });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(contract.reuse);
    expect(session.data.profileRef).toBeUndefined();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty('customer_cnic');
    expect(JSON.stringify(client.sendInteractiveButtons.mock.calls)).not.toContain('Private saved name');
  });
  it('allows a different person with new CNIC and referral', async () => {
    await selectCounter();
    await input('reuse_no', 'button');
    expect(session.data.step).toBe(6);
    expect(session.data.reuseIntake).toBe(false);
    expect(session.data.profileRef).toBeUndefined();
    await input('0123456789012');
    expect(session.data.step).toBe(7);
  });
  it.each([false, 'true', null])('requires boolean availability, not %s', async (available) => {
    await selectCounter(available);
    expect(session.data.step).toBe(6);
  });
  it.each([null, undefined, '73', 0, -1, 1.5])('rejects missing or invalid profile reference %s', async (ref) => {
    await selectCounter(true, ref === undefined ? null : ref);
    expect(session.data.step).toBe(6);
    expect(session.data.profileRef).toBeUndefined();
  });
  it.each([5, 4])('refreshes old or cross-institution reuse sessions at step %s', async step => {
    for (const scope of [undefined, '2']) {
      session.data = { ...session.data, step, reuseIntake: step === 4, profileRef: 73, profileInstitutionId: scope };
      await input(step === 5 ? 'reuse_yes' : 'confirm_yes', 'button');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(session.data.profileRef).toBeUndefined();
      expect(client.sendText).toHaveBeenLastCalledWith(session.phone, expect.stringContaining('refresh'));
    }
  });
  it('does not reinterpret Meta delivery failure as profile absence', async () => {
    client.sendInteractiveButtons.mockRejectedValueOnce(new Error('Meta failed'));
    await expect(selectCounter()).rejects.toThrow('Meta failed');
    expect(session.data.step).toBe(5);
    expect(client.sendText).not.toHaveBeenCalled();
  });
  it('allows fresh intake after profile lookup timeout', async () => {
    session.data.step = 2;
    session.data.listRows = [{ id: 'cnt_2', title: 'General' }];
    fetchMock.mockRejectedValueOnce(new Error('Timeout'));
    await input('cnt_2', 'list');
    expect(session.data.step).toBe(6);
    expect(session.data.reuseIntake).toBeUndefined();
  });
});

describe('safe errors and cleanup', () => {
  beforeEach(() => { session.data.profileRef = 73; session.data.profileInstitutionId = '1'; });
  it.each([409, 422, 429, 500])('handles HTTP %s without exposing backend detail or retaining identity', async (status) => {
    session.data = { ...session.data, step: 4, reuseIntake: true, customerName: 'Private Customer', customerCnic: '0123456789012' };
    respond({ detail: 'Private Customer 0123456789012' }, status);
    await input('confirm_yes', 'button');
    expect(session.state).toBe('idle');
    expect(session.data.customerCnic).toBeUndefined();
    expect(session.data.tokenNumber).toBe('OLD-0001');
    expect(JSON.stringify(client.sendText.mock.calls)).not.toContain('Private Customer');
    expect(JSON.stringify(client.sendText.mock.calls)).not.toContain('0123456789012');
  });
  it('clears sensitive data on timeout and does not automatically retry issuance', async () => {
    session.data = { ...session.data, step: 4, reuseIntake: true, customerName: 'Private Customer' };
    fetchMock.mockRejectedValueOnce(new Error('Private Customer'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await input('confirm_yes', 'button');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session.data.customerName).toBeUndefined();
    expect(JSON.stringify(log.mock.calls)).not.toContain('Private Customer');
    log.mockRestore();
  });
  it('new join clears intake but preserves saved token even if institution lookup fails', async () => {
    session.data = { ...session.data, customerCnic: '0123456789012', customerName: 'Private Customer', reuseIntake: true };
    respond([], 503);
    await startJoinQueueFlow(session.phone);
    expect(session.data).toMatchObject(clearedIntake);
    expect(session.data.tokenNumber).toBe('OLD-0001');
  });
  it('retains the issued token and disables confirmation after Meta delivery failure', async () => {
    session.data = { ...session.data, step: 4, reuseIntake: true, customerName: 'Private Customer' };
    respond(ticket);
    client.sendText.mockRejectedValueOnce(new Error('Meta failed'));
    await input('confirm_yes', 'button');
    expect(session.data.tokenNumber).toBe(ticket.token_number);
    expect(session.data.customerName).toBeUndefined();
    expect(session.data.step).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
