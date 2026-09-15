export interface InstitutionPublic {
  id: number;
  name: string;
  type: string | null;
  whatsapp_number?: string | null;
}

export interface CounterPublic {
  id: number;
  name: string;
  type: string | null;
}

export interface TokenPublic {
  token_number: string;
  status: 'waiting' | 'called' | 'in_service' | 'served' | 'no_show' | 'declined';
  counter_id: number;
  counter_name: string;
  position: number | null;
  people_ahead: number | null;
  estimated_wait_min: number | null;
  issued_at: string;
  called_at: string | null;
  completed_at: string | null;
}

export interface BotTicket extends TokenPublic {
  id: number;
  institution_id: number;
  institution_name: string;
}
