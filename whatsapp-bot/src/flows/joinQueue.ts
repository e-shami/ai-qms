import { getSession, updateSession, resetSession } from '../whatsapp/session';
import { getWhatsAppClient } from '../whatsapp/client';
import { getEnv } from '../config';
import { WhatsAppMessage } from '../whatsapp/types';
import { CounterPublic, TokenPublic } from '../api/types';
import { showListPage } from '../whatsapp/lists';

export async function processJoinQueueFlow(
  phone: string,
  session: Awaited<ReturnType<typeof getSession>>,
  textBody: string | null,
  message: WhatsAppMessage
): Promise<void> {
  const waClient = getWhatsAppClient();
  const step = session.data.step ?? 1;

  switch (step) {
    case 1:
      await handleInstitutionSelection(phone, session, message);
      break;
    case 2:
      await handleCounterSelection(phone, session, message);
      break;
    case 3:
      await handleNameInput(phone, session, textBody);
      break;
    case 4:
      await handleConfirmation(phone, session, message);
      break;
    default:
      await resetSession(phone);
      await waClient.sendText(phone, 'Session error. Please type "join" to start over.');
  }
}

async function handleInstitutionSelection(
  phone: string,
  session: Awaited<ReturnType<typeof getSession>>,
  message: WhatsAppMessage
): Promise<void> {
  const waClient = getWhatsAppClient();

  if (!isListReply(message)) {
    await waClient.sendText(phone, 'Please select an institution from the list above.');
    return;
  }

  const selected = session.data.listRows?.find(row => row.id === message.interactive.list_reply.id);
  if (!selected || !/^inst_\d+$/.test(selected.id)) {
    await waClient.sendText(phone, 'Please select an institution from the current list, or type "join" to reload.');
    return;
  }
  const institutionId = selected.id.replace('inst_', '');

  try {
    const response = await fetch(`${getEnv().BACKEND_API_URL}/public/institutions/${institutionId}/counters`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'X-Internal-API-Key': getEnv().INTERNAL_API_KEY },
    });

    if (!response.ok) throw new Error('Failed to fetch counters');
    const counters = (await response.json()) as CounterPublic[];

    if (!counters.length) {
      await waClient.sendText(phone, 'No active counters at this institution. Please choose another.');
      return await startJoinQueueFlow(phone);
    }

    const sections = [{
      title: 'Select Counter',
      rows: counters.map((c) => ({
        id: `cnt_${c.id}`,
        title: c.name,
        description: c.type ?? 'Service counter',
      })),
    }];

    await showListPage(phone, sections[0].rows);

    await updateSession(phone, {
      state: 'awaiting_counter',
      data: {
        institutionId,
        institutionName: selected.title,
        step: 2,
      },
    });
  } catch (error) {
    console.error('Counter fetch failed');
    await waClient.sendText(phone, 'Unable to load counters. Please try again.');
  }
}

async function handleCounterSelection(
  phone: string,
  session: Awaited<ReturnType<typeof getSession>>,
  message: WhatsAppMessage
): Promise<void> {
  const waClient = getWhatsAppClient();

  if (!isListReply(message)) {
    await waClient.sendText(phone, 'Please select a counter from the list above.');
    return;
  }

  const selected = session.data.listRows?.find(row => row.id === message.interactive.list_reply.id);
  if (!selected || !/^cnt_\d+$/.test(selected.id)) {
    await waClient.sendText(phone, 'Please select a counter from the current list.');
    return;
  }
  const counterId = selected.id.replace('cnt_', '');

  await updateSession(phone, {
    state: 'awaiting_name',
    data: {
      counterId,
      counterName: selected.title,
      step: 3,
    },
  });

  await waClient.sendText(
    phone,
    `You selected: ${selected.title}\n\n` +
    `Please enter your name (optional, for identification):\n` +
    `Or type "skip" to proceed without a name.`
  );
}

async function handleNameInput(
  phone: string,
  session: Awaited<ReturnType<typeof getSession>>,
  textBody: string | null
): Promise<void> {
  const waClient = getWhatsAppClient();
  const name = textBody?.trim();
  if (!name) {
    await waClient.sendText(phone, 'Please type your name or "skip".');
    return;
  }

  if (name && name.length > 100) {
    await waClient.sendText(phone, 'Name is too long. Please enter a shorter name (max 100 characters).');
    return;
  }

  const displayName = name && name.toLowerCase() !== 'skip' ? name : 'Anonymous';
  await waClient.sendInteractiveButtons(
    phone,
    '✅ Confirm Token Request',
    `Institution: ${session.data.institutionName}\n` +
    `Counter: ${session.data.counterName}\n` +
    `Name: ${displayName}\n\n` +
    `Proceed to get your token?`,
    [
      { id: 'confirm_yes', title: 'Yes, Get Token' },
      { id: 'confirm_no', title: 'No, Go Back' },
    ],
    'Your token will include your position and estimated wait.'
  );
  await updateSession(phone, {
    state: 'awaiting_confirmation',
    data: {
      customerName: name && name.toLowerCase() !== 'skip' ? name : undefined,
      step: 4,
    },
  });
}

async function handleConfirmation(
  phone: string,
  session: Awaited<ReturnType<typeof getSession>>,
  message: WhatsAppMessage
): Promise<void> {
  const waClient = getWhatsAppClient();

  if (!isButtonReply(message)) {
    await waClient.sendText(phone, 'Please confirm using the buttons above.');
    return;
  }

  if (message.interactive.button_reply.id === 'confirm_no') {
    await waClient.sendText(phone, 'Cancelled. Type "join" to start over.');
    await resetSession(phone);
    return;
  }

  if (message.interactive.button_reply.id === 'confirm_yes') {
    await issueToken(phone, session);
    return;
  }

  await waClient.sendText(phone, 'Please confirm using the buttons above.');
}

async function issueToken(phone: string, session: Awaited<ReturnType<typeof getSession>>): Promise<void> {
  const waClient = getWhatsAppClient();

  try {
    const response = await fetch(`${getEnv().BACKEND_API_URL}/public/tokens`, {
      signal: AbortSignal.timeout(10000),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-API-Key': getEnv().INTERNAL_API_KEY,
      },
      body: JSON.stringify({
        institution_id: session.data.institutionId,
        counter_id: session.data.counterId,
        customer_name: session.data.customerName,
        customer_phone: phone,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({ detail: 'Unknown error' }))) as { detail?: string };
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }

    const token = (await response.json()) as TokenPublic;
    const statusEmoji = '⏳';
    const position = token.position ?? 'N/A';
    const estWait = token.estimated_wait_min != null ? ` ~${token.estimated_wait_min} min` : '';

    const webUrl = getEnv().PUBLIC_WEB_URL;
    const trackingUrl = webUrl ? `${webUrl.replace(/\/$/, '')}/token/${encodeURIComponent(token.token_number)}?institution=${session.data.institutionId}` : undefined;

    // Persist issuance before delivery so a send failure cannot leave Confirm active.
    await updateSession(phone, { state: 'in_queue', data: {
      tokenNumber: token.token_number, tokenId: undefined, flow: undefined, step: undefined,
    } });

    await waClient.sendText(
      phone,
      `${statusEmoji} Your token has been issued!\n\n` +
      `🎫 Token: ${token.token_number}\n` +
      `🏢 Institution: ${session.data.institutionName}\n` +
      `🎯 Counter: ${session.data.counterName}\n` +
      `👤 Name: ${session.data.customerName ?? 'Anonymous'}\n` +
      `📍 Position: ${position}${estWait}\n` +
      `⏰ Issued: ${new Date(token.issued_at).toLocaleString()}\n\n` +
      (trackingUrl ? `Track live: ${trackingUrl}\n\n` : '') +
      `Type "status" to check your position or "support" for help. Contact staff for cancellation.`
    );

  } catch (error) {
    console.error('Token issuance or delivery failed');
    await waClient.sendText(phone, 'Unable to complete this request. Type "status" to check whether a token was issued before trying again.');
  }
}

export async function startJoinQueueFlow(phone: string): Promise<void> {
  const waClient = getWhatsAppClient();

  try {
    const response = await fetch(`${getEnv().BACKEND_API_URL}/public/institutions`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'X-Internal-API-Key': getEnv().INTERNAL_API_KEY },
    });

    if (!response.ok) throw new Error('Failed to fetch institutions');
    const institutions = (await response.json()) as { id: number; name: string; type: string | null }[];

    if (!institutions.length) {
      await waClient.sendText(phone, 'No institutions are currently available. Please try again later.');
      return;
    }

    const sections = [{
      title: 'Select Institution',
      rows: institutions.map((inst) => ({
        id: `inst_${inst.id}`,
        title: inst.name,
        description: inst.type ?? 'Institution',
      })),
    }];

    await showListPage(phone, sections[0].rows);

    await updateSession(phone, { state: 'awaiting_institution', data: { flow: 'join_queue', step: 1 } });
  } catch (error) {
    console.error('Failed to fetch institutions');
    await waClient.sendText(phone, 'Unable to load institutions right now. Please try again later.');
  }
}

function isListReply(message: WhatsAppMessage): message is WhatsAppMessage & { interactive: { type: 'list_reply'; list_reply: { id: string; title: string; description?: string } } } {
  return message.type === 'interactive' && message.interactive?.type === 'list_reply';
}

function isButtonReply(message: WhatsAppMessage): message is WhatsAppMessage & { interactive: { type: 'button_reply'; button_reply: { id: string; title: string } } } {
  return message.type === 'interactive' && message.interactive?.type === 'button_reply';
}
