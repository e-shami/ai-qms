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
  status: TokenStatus;
  issued_at: string;
  called_at: string | null;
  completed_at: string | null;
  counter_id: number;
  position: number | null;
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