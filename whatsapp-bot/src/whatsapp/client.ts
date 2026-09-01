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
          console.error('WhatsApp API Error:', JSON.stringify(error.response.data.error, null, 2));
        }
        return Promise.reject(error);
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
      text: { body, preview_url: previewUrl },
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
    return this.sendMessage({
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: headerText },
        body: { text: bodyText },
        footer: footerText ? { text: footerText } : undefined,
        action: {
          button: buttonText,
          sections,
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
    return this.sendMessage({
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        header: { type: 'text', text: headerText },
        body: { text: bodyText },
        footer: footerText ? { text: footerText } : undefined,
        action: { buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
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