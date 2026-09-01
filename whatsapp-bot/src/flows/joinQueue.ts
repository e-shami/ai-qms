import { getSession, updateSession, resetSession } from '../whatsapp/session';
import { getWhatsAppClient } from '../whatsapp/client';
import { getEnv } from '../config';
import { WhatsAppMessage } from '../whatsapp/types';
import { CounterPublic, TokenPublic } from '../api/types';

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

  const institutionId = message.interactive.list_reply.id.replace('inst_', '');

  try {
    const response = await fetch(`${getEnv().BACKEND_API_URL}/public/institutions/${institutionId}/counters`, {
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
        description: `${c.type} • ${c.current_queue_length ?? 0} waiting`,
      })),
    }];

    await waClient.sendInteractiveList(
      phone,
      '🎯 Choose Counter',
      `You selected: ${message.interactive.list_reply.title}\n\nPick a service counter:`,
      'Choose Counter',
      sections,
      'Type "restart" to go back.'
    );

    await updateSession(phone, {
      state: 'awaiting_counter',
      data: {
        ...session.data,
        institutionId,
        institutionName: message.interactive.list_reply.title,
        step: 2,
      },
    });
  } catch (error) {
    console.error('Counter fetch failed:', error);
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

  const counterId = message.interactive.list_reply.id.replace('cnt_', '');

  await updateSession(phone, {
    state: 'awaiting_name',
    data: {
      ...session.data,
      counterId,
      counterName: message.interactive.list_reply.title,
      step: 3,
    },
  });

  await waClient.sendText(
    phone,
    `You selected: ${message.interactive.list_reply.title}\n\n` +
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

  if (!name || name.toLowerCase() === 'skip') {
    await updateSession(phone, {
      data: { ...session.data, customerName: undefined, step: 4 },
    });
  } else if (name.length > 100) {
    await waClient.sendText(phone, 'Name is too long. Please enter a shorter name (max 100 characters).');
    return;
  } else {
    await updateSession(phone, {
      data: { ...session.data, customerName: name, step: 4 },
    });
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
    'Token will be generated with your position and estimated wait time.'
  );
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
    const position = token.queue_position ?? 'N/A';
    const estWait = token.estimated_wait_min ? ` ~${token.estimated_wait_min} min` : '';

    const trackingUrl = `${getEnv().BACKEND_API_URL.replace('/api/v1', '')}/token/${token.token_number}?institution=${token.institution_id}`;

    await waClient.sendText(
      phone,
      `${statusEmoji} Your token has been issued!\n\n` +
      `🎫 Token: ${token.token_number}\n` +
      `🏢 Institution: ${session.data.institutionName}\n` +
      `🎯 Counter: ${session.data.counterName}\n` +
      `👤 Name: ${session.data.customerName ?? 'Anonymous'}\n` +
      `📍 Position: ${position}${estWait}\n` +
      `⏰ Issued: ${new Date(token.issued_at).toLocaleString()}\n\n` +
      `🔗 Track live: ${trackingUrl}\n\n` +
      `Type "status" to check your position, "cancel" to leave the queue, or "support" for help.`
    );

    await updateSession(phone, {
      state: 'in_queue',
      data: {
        ...session.data,
        tokenNumber: token.token_number,
        tokenId: token.id,
        flow: undefined,
        step: undefined,
      },
    });
  } catch (error) {
    console.error('Token issuance failed:', error);
    await waClient.sendText(phone, `Failed to issue token: ${error instanceof Error ? error.message : 'Please try again.'}`);
  }
}

async function startJoinQueueFlow(phone: string): Promise<void> {
  const waClient = getWhatsAppClient();

  try {
    const response = await fetch(`${getEnv().BACKEND_API_URL}/public/institutions`, {
      headers: { 'X-Internal-API-Key': getEnv().INTERNAL_API_KEY },
    });

    if (!response.ok) throw new Error('Failed to fetch institutions');
    const institutions = (await response.json()) as { id: string; name: string; type: string; counters?: CounterPublic[] }[];

    if (!institutions.length) {
      await waClient.sendText(phone, 'No institutions are currently available. Please try again later.');
      return;
    }

    const sections = [{
      title: 'Select Institution',
      rows: institutions.map((inst) => ({
        id: `inst_${inst.id}`,
        title: inst.name,
        description: `${inst.type} • ${inst.counters?.length ?? 0} counters`,
      })),
    }];

    await waClient.sendInteractiveList(
      phone,
      '🏢 Choose Institution',
      'Select the institution where you want to join a queue:',
      'Choose Institution',
      sections,
      'Type "restart" to cancel anytime.'
    );

    await updateSession(phone, { state: 'awaiting_institution', data: { flow: 'join_queue', step: 1 } });
  } catch (error) {
    console.error('Failed to fetch institutions:', error);
    await waClient.sendText(phone, 'Unable to load institutions right now. Please try again later.');
  }
}

function isListReply(message: WhatsAppMessage): message is WhatsAppMessage & { interactive: { type: 'list_reply'; list_reply: { id: string; title: string; description?: string } } } {
  return message.type === 'interactive' && message.interactive?.type === 'list_reply';
}

function isButtonReply(message: WhatsAppMessage): message is WhatsAppMessage & { interactive: { type: 'button_reply'; button_reply: { id: string; title: string } } } {
  return message.type === 'interactive' && message.interactive?.type === 'button_reply';
}