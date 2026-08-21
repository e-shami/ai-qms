export type Role = "admin" | "staff";

export type TokenStatus = "waiting" | "called" | "in_service" | "served" | "no_show";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  institution_id: number;
  is_active: boolean;
  created_at: string;
}

export interface Institution {
  id: number;
  name: string;
  type: string | null;
  whatsapp_number: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Counter {
  id: number;
  name: string;
  type: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Personnel {
  id: number;
  name: string;
  title: string | null;
  counter_id: number | null;
  user_id: number | null;
  is_active: boolean;
  created_at: string;
}

export interface Token {
  id: number;
  token_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  status: TokenStatus;
  issued_at: string;
  called_at: string | null;
  completed_at: string | null;
  counter_id: number;
  position: number | null;
}

export interface TokenPage {
  items: Token[];
  total: number;
}

export interface CounterQueueStatus {
  counter: Counter;
  waiting_count: number;
  called_count: number;
  in_service_count: number;
  tokens: Token[];
}

export interface QueueSnapshot {
  institution_id: number;
  counter_id: number | null;
  updated_at: string;
  counters: CounterQueueStatus[];
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  institution_name: string;
  institution_type?: string;
}

export interface ProfileUpdate {
  full_name?: string;
  email?: string;
}

export interface PublicInstitution {
  id: number;
  name: string;
  type: string | null;
  whatsapp_number: string | null;
}

export interface PublicCounter {
  id: number;
  name: string;
  type: string | null;
}

export interface PublicTicket {
  token_number: string;
  status: TokenStatus;
  counter_id: number;
  counter_name: string;
  issued_at: string;
  called_at: string | null;
  completed_at: string | null;
  position: number | null;
  people_ahead: number | null;
  estimated_wait_min: number | null;
}

export interface WaitPrediction {
  counter_id: number;
  queue_ahead: number;
  estimated_wait_min: number;
}

export interface HourlyCount {
  hour: number;
  count: number;
}

export interface CounterAnalytics {
  counter_id: number;
  counter_name: string;
  issued: number;
  served: number;
  no_shows: number;
  waiting: number;
  avg_wait_min: number | null;
}

export interface AnalyticsSummary {
  from_at: string | null;
  to_at: string | null;
  issued: number;
  served: number;
  no_shows: number;
  waiting_now: number;
  in_service_now: number;
  abandonment_rate: number | null;
  avg_wait_min: number | null;
  avg_total_min: number | null;
  peak_hour: number | null;
  hourly: HourlyCount[];
  per_counter: CounterAnalytics[];
}