import axios, { AxiosInstance, AxiosError } from 'axios';
import { getEnv } from '../config';
import { SendMessageParams, WhatsAppApiResponse, WhatsAppErrorResponse, TemplateComponent } from './types';

class WhatsAppClient {
  private client: AxiosInstance;
  private token: string;
  private phoneNumberId: string;
  private apiVersion: string;

  constructor() {
    const env = getEnv();
    this.token = env.WHATSAPP_TOKEN;
    this.phoneNumberId = env.PHONE_NUMBER_ID;
    this.apiVersion = env.WHATSAPP_API_VERSION;

    this.client = axios.create({
      baseURL: `https://graph.facebook.com/${this.apiVersion}`,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<WhatsAppErrorResponse>) => {
        if (error.response?.data?.error) {
          console.error('WhatsApp API request failed', { status: error.response.status, code: error.response.data.error.code });
        }
        return Promise.reject(new Error('WhatsApp API request failed'));
      }
    );
  }

  async sendMessage(params: SendMessageParams): Promise<WhatsAppApiResponse> {
    const payload = {
      messaging_product: 'whatsapp',
      to: params.to,
      type: params.type,
      ...(params.text && { text: params.text }),
      ...(params.template && { template: params.template }),
      ...(params.interactive && { interactive: params.interactive }),
      ...(params.image && { image: params.image }),
      ...(params.document && { document: params.document }),
      ...(params.location && { location: params.location }),
    };

    const response = await this.client.post<WhatsAppApiResponse>(
      `/${this.phoneNumberId}/messages`,
      payload
    );
    return response.data;
  }

  async sendText(to: string, body: string, previewUrl = false): Promise<WhatsAppApiResponse> {
    return this.sendMessage({
      to,
      type: 'text',
      text: { body: body.slice(0, 4096), preview_url: previewUrl },
    });
  }

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: TemplateComponent[]
  ): Promise<WhatsAppApiResponse> {
    return this.sendMessage({
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: components ?? [],
      },
    });
  }

  async sendInteractiveList(
    to: string,
    headerText: string,
    bodyText: string,
    buttonText: string,
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
    footerText?: string
  ): Promise<WhatsAppApiResponse> {
    if (sections.reduce((count, section) => count + section.rows.length, 0) > 10) {
      throw new Error('WhatsApp lists require pagination above 10 rows');
    }
    return this.sendMessage({
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: headerText.slice(0, 60) },
        body: { text: bodyText.slice(0, 1024) },
        footer: footerText ? { text: footerText.slice(0, 60) } : undefined,
        action: {
          button: buttonText.slice(0, 20),
          sections: sections.map(section => ({ title: section.title.slice(0, 24), rows: section.rows.map(row => ({
            id: row.id, title: row.title.slice(0, 24), description: row.description?.slice(0, 72),
          })) })),
        },
      },
    });
  }

  async sendInteractiveButtons(
    to: string,
    headerText: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    footerText?: string
  ): Promise<WhatsAppApiResponse> {
    if (buttons.length < 1 || buttons.length > 3) throw new Error('WhatsApp requires 1-3 buttons');
    return this.sendMessage({
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: { type: 'text', text: headerText.slice(0, 60) },
        body: { text: bodyText.slice(0, 1024) },
        footer: footerText ? { text: footerText.slice(0, 60) } : undefined,
        action: { buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })) },
      },
    });
  }

  async markAsRead(messageId: string): Promise<void> {
    await this.client.post(`/${this.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  async getBusinessProfile(): Promise<{ about: string; address: string; description: string; email: string; vertical: string; websites: string[] }> {
    const response = await this.client.get(`/${this.phoneNumberId}/whatsapp_business_profile`);
    return response.data.data[0];
  }
}

let clientInstance: WhatsAppClient | null = null;

export function getWhatsAppClient(): WhatsAppClient {
  if (!clientInstance) {
    clientInstance = new WhatsAppClient();
  }
  return clientInstance;
}

export function resetWhatsAppClient(): void {
  clientInstance = null;
}
