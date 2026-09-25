import { getSession, updateSession, clearedIntake } from '../whatsapp/session';
import { getWhatsAppClient } from '../whatsapp/client';
import { getEnv } from '../config';
import { WhatsAppMessage } from '../whatsapp/types';
import { CounterPublic, TokenPublic } from '../api/types';
import { showListPage } from '../whatsapp/lists';
import { priorityStatus } from '../api/priority';

export async function processJoinQueueFlow(
  phone: string,
  session: Awaited<ReturnType<typeof getSession>>,
  textBody: string | null,
  message: WhatsAppMessage
): Promise<void> {
  const waClient = getWhatsAppClient();
  const step = session.data.step ?? 1;
  if ((session.data.reuseIntake || (step === 5 && textBody === 'reuse_yes')) &&
      (!Number.isSafeInteger(session.data.profileRef) || (session.data.profileRef ?? 0) <= 0 ||
       session.data.profileInstitutionId !== session.data.institutionId)) {
    await updateSession(phone, { state: 'idle', data: { ...clearedIntake, flow: undefined, step: undefined } });
    await waClient.sendText(phone, 'Saved intake confirmation has expired. Type "join" to refresh and confirm the person again.');
    return;
  }

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
    case 5:
      if (textBody === 'reuse_yes') {
        await updateSession(phone, { data: { reuseIntake: true } });
        await askPriority(phone, session);
      } else if (textBody === 'reuse_no') {
        await updateSession(phone, { data: { reuseIntake: false, profileRef: undefined, profileInstitutionId: undefined, step: 6 } });
        await waClient.sendText(phone, 'Enter the customer CNIC: exactly 13 digits, no spaces or dashes. Demo: use dummy data only.');
      } else await waClient.sendText(phone, 'Choose same person or new/change details.');
      break;
    case 6: {
      const cnic = message.type === 'text' ? message.text?.body : undefined;
      if (!cnic || !/^[0-9]{13}$/.test(cnic)) {
        await waClient.sendText(phone, 'CNIC must be exactly 13 ASCII digits, without spaces or dashes.');
        break;
      }
      await updateSession(phone, { data: { customerCnic: cnic, step: 7 } });
      await waClient.sendInteractiveButtons(phone, 'Referring organization',
        'How were you referred? This is not a medical referral.', [
          { id: 'ref_website', title: 'Website' },
          { id: 'ref_institution', title: 'This institution' },
          { id: 'ref_other', title: 'Other organization' },
        ]);
      break;
    }
    case 7: {
      const source = textBody?.replace('ref_', '');
      if (source !== 'website' && source !== 'institution' && source !== 'other') {
        await waClient.sendText(phone, 'Select a referring organization option.');
        break;
      }
      await updateSession(phone, { data: { referralSource: source, referralOrganization: undefined, step: 8 } });
      if (source === 'other') await waClient.sendText(phone, 'Type the name of the referring organization (not clinical details).');
      else await askPriority(phone, session);
      break;
    }
    case 8:
      if (!textBody?.trim() || textBody.length > 255) {
        await waClient.sendText(phone, 'Enter an organization name of 1 to 255 characters.');
        break;
      }
      await updateSession(phone, { data: { referralOrganization: textBody.trim() } });
      await askPriority(phone, session);
      break;
    case 9:
      if (session.data.institutionType !== 'hospital') {
        await askPriority(phone, session);
        break;
      }
      if (!['priority_normal', 'priority_elderly', 'priority_disability'].includes(textBody ?? '')) {
        await waClient.sendText(phone, 'Choose Normal, Elderly or Disability.');
        break;
      }
      await updateSession(phone, { data: { priorityReason: textBody === 'priority_normal' ? undefined : textBody!.replace('priority_', '') as 'elderly' | 'disability', step: 3 } });
      await waClient.sendText(phone, 'Enter your name (optional), or type "skip".');
      break;
    default:
      await updateSession(phone, { state: 'idle', data: { ...clearedIntake, flow: undefined, step: undefined } });
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
  await updateSession(phone, { data: { ...clearedIntake } });

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
        institutionType: selected.description?.trim().toLowerCase(),
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
    state: 'awaiting_intake',
    data: {
      counterId,
      counterName: selected.title,
      step: 6,
    },
  });

  let profileRef: number | undefined;
  await updateSession(phone, { data: { reuseIntake: undefined, profileRef: undefined, profileInstitutionId: undefined } });
  try {
    const response = await fetch(`${getEnv().BACKEND_API_URL}/internal/bot/profile`, {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', 'X-Internal-API-Key': getEnv().INTERNAL_API_KEY },
      body: JSON.stringify({ phone, institution_id: session.data.institutionId }),
    });
    if (response.ok) {
      const profile = await response.json() as { available: boolean; profile_ref: number | null };
      if (profile.available === true && Number.isSafeInteger(profile.profile_ref) && (profile.profile_ref ?? 0) > 0) {
        profileRef = profile.profile_ref!;
      }
    }
  } catch { /* New intake remains available when profile lookup fails. */ }
  if (profileRef !== undefined) {
    await updateSession(phone, { data: { step: 5, profileRef, profileInstitutionId: session.data.institutionId } });
    await waClient.sendInteractiveButtons(phone, 'Saved intake',
      'Is this for the same person as the most recent saved CNIC/referral intake at this institution? A phone can be shared. If unsure, choose new/change details. No saved identity will be shown.', [
        { id: 'reuse_yes', title: 'Same person, reuse' },
        { id: 'reuse_no', title: 'New / change details' },
      ]);
    return;
  }
  await waClient.sendText(phone, 'Enter the customer CNIC: exactly 13 digits, no spaces or dashes. Demo: use dummy data only.');
}

async function askPriority(phone: string, session: Awaited<ReturnType<typeof getSession>>): Promise<void> {
  const client = getWhatsAppClient();
  if (session.data.institutionType === 'hospital') {
    await updateSession(phone, { data: { step: 9 } });
    await client.sendInteractiveButtons(phone, 'Accessibility request',
      'Optional nonclinical priority. Staff must approve; pending requests stay in normal order. Not emergency triage.', [
        { id: 'priority_normal', title: 'Normal' }, { id: 'priority_elderly', title: 'Elderly' },
        { id: 'priority_disability', title: 'Disability' },
      ]);
  } else {
    await updateSession(phone, { data: { step: 3, priorityReason: undefined } });
    await client.sendText(phone, 'Enter your name (optional), or type "skip".');
  }
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

  await waClient.sendInteractiveButtons(
    phone,
    '✅ Confirm Token Request',
    `Institution: ${session.data.institutionName}\n` +
    `Counter: ${session.data.counterName}\n` +
    (session.data.priorityReason ? 'Accessibility requested; staff verification required. Pending requests remain in normal order.\n\n' : '\n') +
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
    await updateSession(phone, { state: 'idle', data: { ...clearedIntake, flow: undefined, step: undefined } });
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

  if (!session.data.reuseIntake && (!/^[0-9]{13}$/.test(session.data.customerCnic ?? '') ||
      !['website', 'institution', 'other'].includes(session.data.referralSource ?? '') ||
      (session.data.referralSource === 'other' && !session.data.referralOrganization?.trim()))) {
    await updateSession(phone, { state: 'idle', data: { ...clearedIntake, flow: undefined, step: undefined } });
    await waClient.sendText(phone, 'Intake details are incomplete. Type "join" to enter them again.');
    return;
  }
  const priorityReason = session.data.institutionType === 'hospital' ? session.data.priorityReason : undefined;
  try {
    const response = await fetch(`${getEnv().BACKEND_API_URL}/${session.data.reuseIntake ? 'internal/bot/tokens/reuse' : 'public/tokens'}`, {
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
        ...(!session.data.reuseIntake ? {
          customer_cnic: session.data.customerCnic,
          referral_source: session.data.referralSource,
          referral_organization: session.data.referralOrganization,
        } : {}),
        requested_priority: priorityReason ? 'accessibility' : 'normal',
        priority_reason: priorityReason,
        ...(session.data.reuseIntake ? { phone, confirm_same_person: true, profile_ref: session.data.profileRef } : {}),
      }),
    });

    if (!response.ok) {
      await updateSession(phone, { state: 'idle', data: { ...clearedIntake, flow: undefined, step: undefined } });
      await waClient.sendText(phone, response.status === 409 && session.data.reuseIntake
        ? 'Saved intake is no longer available. Type "join" and choose new/change details.'
        : response.status === 422 ? 'The intake request was rejected. Type "join" to enter new details.'
        : response.status === 429 ? 'Too many requests. Please wait before trying again.'
        : 'Unable to complete this request. Check "status" before trying again.');
      return;
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
      ...clearedIntake,
    } });

    await waClient.sendText(
      phone,
      `${statusEmoji} Your token has been issued!\n\n` +
      `🎫 Token: ${token.token_number}\n` +
      `🏢 Institution: ${session.data.institutionName}\n` +
      `🎯 Counter: ${session.data.counterName}\n` +
      `${priorityStatus(token)}\n` +
      `📍 Position: ${position}${estWait}\n` +
      `⏰ Issued: ${new Date(token.issued_at).toLocaleString()}\n\n` +
      (trackingUrl ? `Track live: ${trackingUrl}\n\n` : '') +
      `Type "status" to check your position or "support" for help. Contact staff for cancellation.`
    );

  } catch (error) {
    await updateSession(phone, { state: 'idle', data: { ...clearedIntake, flow: undefined, step: undefined } });
    console.error('Token issuance or delivery failed');
    await waClient.sendText(phone, 'Unable to complete this request. Type "status" to check whether a token was issued before trying again.');
  }
}

export async function startJoinQueueFlow(phone: string): Promise<void> {
  const waClient = getWhatsAppClient();
  await updateSession(phone, { state: 'idle', data: { ...clearedIntake, flow: undefined, step: undefined } });

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
