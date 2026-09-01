export interface InstitutionPublic {
  id: string;
  name: string;
  type: string;
  whatsapp_number?: string | null;
  counters?: CounterPublic[];
}

export interface CounterPublic {
  id: string;
  name: string;
  type: string;
  current_queue_length?: number;
  is_active: boolean;
}

export interface TokenPublic {
  id: string;
  token_number: string;
  status: 'waiting' | 'called' | 'in_service' | 'served' | 'no_show' | 'declined';
  counter_id: string;
  counter_name: string;
  institution_id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  queue_position?: number | null;
  estimated_wait_min?: number | null;
  issued_at: string;
  called_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface TokenIssueRequest {
  institution_id: string;
  counter_id: string;
  customer_name?: string;
  customer_phone?: string;
}

export interface TokenIssueResponse extends TokenPublic {}