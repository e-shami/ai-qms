import { getSession, updateSession, resetSession } from '../whatsapp/session';
import { getWhatsAppClient } from '../whatsapp/client';
import { getEnv } from '../config';
import { WhatsAppMessage } from '../whatsapp/types';

export async function processSupportFlow(
  phone: string,
  session: Awaited<ReturnType<typeof getSession>>,
  textBody: string | null,
  message: WhatsAppMessage
): Promise<void> {
  const waClient = getWhatsAppClient();

  if (isButtonReply(message)) {
    const choice = message.interactive.button_reply.id;

    switch (choice) {
      case 'support_queue':
        await waClient.sendText(
          phone,
          'For queue-related issues (long wait, counter closed, etc.), ' +
          'please contact the institution directly or speak to staff on-site.\n\n' +
          'Type "menu" to return to main menu.'
        );
        break;

      case 'support_token':
        await waClient.sendText(
          phone,
          'If you have issues with your token (lost, wrong counter, etc.), ' +
          'please provide your token number and I\'ll help you check it.\n\n' +
          'Type your token number or "menu" to return.'
        );
        await updateSession(phone, { state: 'checking_status', data: { flow: 'check_status' } });
        break;

      case 'support_human':
        await waClient.sendText(
          phone,
          '🤝 Connecting you with a human agent...\n\n' +
          'Please describe your issue briefly, and an agent will respond shortly.\n\n' +
          'Type "menu" to cancel.'
        );
        await updateSession(phone, { data: { ...session.data, awaitingHuman: true } });
        break;

      default:
        await waClient.sendText(phone, 'Please select an option from the buttons above.');
    }
    return;
  }

  if (session.data.awaitingHuman) {
    if (textBody?.toLowerCase() === 'menu') {
      await resetSession(phone);
      return;
    }

    await waClient.sendText(
      phone,
      '✅ Your message has been forwarded to our support team. ' +
      'An agent will contact you shortly via WhatsApp.\n\n' +
      'Type "menu" to return to main menu.'
    );
    await updateSession(phone, { data: { ...session.data, awaitingHuman: false } });
    return;
  }

  await waClient.sendInteractiveButtons(
    phone,
    '🤝 Support Options',
    'How can we help you?',
    [
      { id: 'support_queue', title: 'Queue Issue' },
      { id: 'support_token', title: 'Token Problem' },
      { id: 'support_human', title: 'Talk to Human' },
    ],
    'Type "menu" to return to main menu.'
  );
}

function isButtonReply(message: WhatsAppMessage): message is WhatsAppMessage & { interactive: { type: 'button_reply'; button_reply: { id: string; title: string } } } {
  return message.type === 'interactive' && message.interactive?.type === 'button_reply';
}