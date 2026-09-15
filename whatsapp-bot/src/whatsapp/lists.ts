import { getWhatsAppClient } from './client';
import { updateSession } from './session';

export async function showListPage(phone: string, rows: Array<{ id: string; title: string; description?: string }>, page = 0): Promise<void> {
  if (!Number.isInteger(page) || page < 0 || page * 8 >= rows.length) {
    await getWhatsAppClient().sendText(phone, 'That page is unavailable. Type "join" to reload the list.');
    return;
  }
  const visible = rows.slice(page * 8, page * 8 + 8);
  if (page > 0) visible.push({ id: `list_page_${page - 1}`, title: 'Previous page' });
  if ((page + 1) * 8 < rows.length) visible.push({ id: `list_page_${page + 1}`, title: 'Next page' });
  await getWhatsAppClient().sendInteractiveList(phone, 'Join Queue', 'Choose an institution or service counter below.', 'Choose', [{ title: `Page ${page + 1}`, rows: visible }], 'Type "menu" to return to main menu.');
  await updateSession(phone, { data: { listRows: rows, listPage: page } });
}
