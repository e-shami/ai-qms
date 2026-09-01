import { getWhatsAppClient } from '../whatsapp/client';
import { getEnv } from '../config';
import { TemplateComponent, TemplateParameter } from '../whatsapp/types';

export interface NotificationPayload {
  to: string;
  type: 'token_called' | 'token_served' | 'token_rescheduled' | 'token_cancelled' | 'queue_update';
  tokenNumber: string;
  counterName?: string;
  position?: number;
  estimatedWaitMin?: number;
  newTime?: string;
  reason?: string;
}

const TEMPLATE_NAMES = {
  token_called: 'token_called_notification',
  token_served: 'token_served_notification',
  token_rescheduled: 'token_rescheduled_notification',
  token_cancelled: 'token_cancelled_notification',
  queue_update: 'queue_position_update',
} as const;

export async function sendNotification(payload: NotificationPayload): Promise<boolean> {
  const waClient = getWhatsAppClient();

  try {
    switch (payload.type) {
      case 'token_called':
        return await sendTokenCalled(waClient, payload);
      case 'token_served':
        return await sendTokenServed(waClient, payload);
      case 'token_rescheduled':
        return await sendTokenRescheduled(waClient, payload);
      case 'token_cancelled':
        return await sendTokenCancelled(waClient, payload);
      case 'queue_update':
        return await sendQueueUpdate(waClient, payload);
      default:
        console.warn('Unknown notification type:', payload.type);
        return false;
    }
  } catch (error) {
    console.error('Failed to send notification:', error);
    return false;
  }
}

async function sendTokenCalled(waClient: ReturnType<typeof getWhatsAppClient>, payload: NotificationPayload): Promise<boolean> {
  const components: TemplateComponent[] = [
    { type: 'body', parameters: [
      { type: 'text', text: payload.tokenNumber },
      { type: 'text', text: payload.counterName || 'N/A' },
    ] as TemplateParameter[] },
  ];

  return await waClient.sendTemplate(
    payload.to,
    TEMPLATE_NAMES.token_called,
    'en_US',
    components
  ).then(() => true).catch(() => false);
}

async function sendTokenServed(waClient: ReturnType<typeof getWhatsAppClient>, payload: NotificationPayload): Promise<boolean> {
  const components: TemplateComponent[] = [
    { type: 'body', parameters: [
      { type: 'text', text: payload.tokenNumber },
      { type: 'text', text: payload.counterName || 'N/A' },
    ] as TemplateParameter[] },
  ];

  return await waClient.sendTemplate(
    payload.to,
    TEMPLATE_NAMES.token_served,
    'en_US',
    components
  ).then(() => true).catch(() => false);
}

async function sendTokenRescheduled(waClient: ReturnType<typeof getWhatsAppClient>, payload: NotificationPayload): Promise<boolean> {
  const components: TemplateComponent[] = [
    { type: 'body', parameters: [
      { type: 'text', text: payload.tokenNumber },
      { type: 'text', text: payload.newTime || 'TBD' },
      { type: 'text', text: payload.reason || 'Rescheduled by staff' },
    ] as TemplateParameter[] },
  ];

  return await waClient.sendTemplate(
    payload.to,
    TEMPLATE_NAMES.token_rescheduled,
    'en_US',
    components
  ).then(() => true).catch(() => false);
}

async function sendTokenCancelled(waClient: ReturnType<typeof getWhatsAppClient>, payload: NotificationPayload): Promise<boolean> {
  const components: TemplateComponent[] = [
    { type: 'body', parameters: [
      { type: 'text', text: payload.tokenNumber },
      { type: 'text', text: payload.reason || 'Cancelled by staff' },
    ] as TemplateParameter[] },
  ];

  return await waClient.sendTemplate(
    payload.to,
    TEMPLATE_NAMES.token_cancelled,
    'en_US',
    components
  ).then(() => true).catch(() => false);
}

async function sendQueueUpdate(waClient: ReturnType<typeof getWhatsAppClient>, payload: NotificationPayload): Promise<boolean> {
  const components: TemplateComponent[] = [
    { type: 'body', parameters: [
      { type: 'text', text: payload.tokenNumber },
      { type: 'text', text: String(payload.position || 'N/A') },
      { type: 'text', text: String(payload.estimatedWaitMin || 'N/A') },
    ] as TemplateParameter[] },
  ];

  return await waClient.sendTemplate(
    payload.to,
    TEMPLATE_NAMES.queue_update,
    'en_US',
    components
  ).then(() => true).catch(() => false);
}

export async function sendSessionMessage(
  to: string,
  text: string
): Promise<boolean> {
  const waClient = getWhatsAppClient();
  try {
    await waClient.sendText(to, text);
    return true;
  } catch (error) {
    console.error('Failed to send session message:', error);
    return false;
  }
}