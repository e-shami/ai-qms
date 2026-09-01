export interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'contacts' | 'interactive' | 'button' | 'order' | 'reaction' | 'system' | 'unknown';
  text?: { body: string };
  interactive?: {
    type: 'list_reply' | 'button_reply' | 'nfm_reply';
    list_reply?: { id: string; title: string; description?: string };
    button_reply?: { id: string; title: string };
    nfm_reply?: { name: string; response_json: string; params_json: string };
  };
  button?: { payload: string; text: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string };
  audio?: { id: string; mime_type: string; sha256: string };
  video?: { id: string; mime_type: string; sha256: string; caption?: string };
  contacts?: Array<{ name: { formatted_name: string }; phones: Array<{ phone: string; type: string }> }>;
  reaction?: { message_id: string; emoji: string };
  context?: { from: string; id: string };
  referral?: { source_url: string; source_type: string; source_id: string; headline: string; body: string };
}

export interface WhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  conversation?: { id: string; expiration_timestamp: string; origin: { type: string } };
  pricing?: { billable: boolean; pricing_model: string; category: string };
  errors?: Array<{ code: string; title: string; message: string; error_data: { details: string } }>;
}

export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: WhatsAppMessage[];
        statuses?: WhatsAppStatus[];
      };
      field: 'messages';
    }>;
  }>;
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters: TemplateParameter[];
}

export interface TemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  text?: string;
  currency?: { fallback_value: string; code: string; amount_1000: number };
  date_time?: { fallback_value: string };
  image?: { id?: string; link?: string };
  document?: { id?: string; link?: string; filename?: string };
  video?: { id?: string; link?: string };
}

export interface InteractiveHeader {
  type: 'text' | 'image' | 'document' | 'video';
  text?: string;
  image?: { id?: string; link?: string };
  document?: { id?: string; link?: string; filename?: string };
  video?: { id?: string; link?: string };
}

export interface InteractiveAction {
  name?: string;
  parameters?: Record<string, unknown>;
  button?: string;
  buttons?: Array<{ type: 'reply'; reply: { id: string; title: string } }>;
  sections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
}

export interface SendMessageParams {
  to: string;
  type: 'text' | 'template' | 'interactive' | 'image' | 'document' | 'location';
  text?: { body: string; preview_url?: boolean };
  template?: {
    name: string;
    language: { code: string; policy?: 'deterministic' };
    components?: TemplateComponent[];
  };
  interactive?: {
    type: 'list' | 'button' | 'cta_url' | 'flow';
    header?: InteractiveHeader;
    body: { text: string };
    footer?: { text: string };
    action: InteractiveAction;
  };
  image?: { id?: string; link?: string; caption?: string };
  document?: { id?: string; link?: string; caption?: string; filename?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}

export interface WhatsAppApiResponse {
  messaging_product: 'whatsapp';
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface WhatsAppErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id: string;
  };
}