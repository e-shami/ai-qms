import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../config', () => ({ getEnv: () => ({ WHATSAPP_TOKEN: 'test', PHONE_NUMBER_ID: 'test', WHATSAPP_API_VERSION: 'v20.0' }) }));
import { getWhatsAppClient } from './client';
import { showListPage } from './lists';
vi.mock('./session', () => ({ updateSession: vi.fn() }));
const client = getWhatsAppClient();
beforeEach(() => vi.restoreAllMocks());

describe('Meta payload limits', () => {
  it('bounds all list text fields without changing IDs', async () => {
    const send = vi.spyOn(client, 'sendMessage').mockResolvedValue({} as never);
    await client.sendInteractiveList('test', 'h'.repeat(80), 'b'.repeat(1200), 'c'.repeat(30), [{ title: 's'.repeat(40), rows: [{ id: 'inst_123', title: 't'.repeat(100), description: 'd'.repeat(100) }] }], 'f'.repeat(80));
    const interactive = send.mock.calls[0][0].interactive!;
    expect(interactive.header?.text?.length).toBe(60);
    expect(interactive.body.text.length).toBe(1024);
    expect(interactive.footer?.text.length).toBe(60);
    expect(interactive.action.sections![0].rows[0]).toEqual({ id: 'inst_123', title: 't'.repeat(24), description: 'd'.repeat(72) });
  });
  it('bounds button titles, including the formerly invalid status button', async () => {
    const send = vi.spyOn(client, 'sendMessage').mockResolvedValue({} as never);
    await client.sendInteractiveButtons('test', 'Header', 'Body', [{ id: 'check_other', title: 'Enter Different Token' }]);
    expect(send.mock.calls[0][0].interactive!.action.buttons![0].reply.title.length).toBeLessThanOrEqual(20);
  });
  it('paginates every institution/counter without silently dropping rows', async () => {
    const send = vi.spyOn(client, 'sendInteractiveList').mockResolvedValue({} as never);
    const rows = Array.from({ length: 19 }, (_, id) => ({ id: `inst_${id}`, title: `Institution ${id}` }));
    for (let page = 0; page < 3; page++) await showListPage('test', rows, page);
    const actual = send.mock.calls.flatMap(call => call[4][0].rows.filter(row => row.id.startsWith('inst_')));
    expect(actual).toEqual(rows);
    expect(send.mock.calls.every(call => call[4][0].rows.length <= 10)).toBe(true);
  });
});
