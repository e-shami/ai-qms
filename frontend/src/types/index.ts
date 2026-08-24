export type Role = "admin" | "staff";

export type WorkStatus = "off_duty" | "available" | "on_break";

export type TokenStatus =
  | "waiting"
  | "called"
  | "in_service"
  | "served"
  | "no_show"
  | "declined";

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
  code: string;
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
  work_status: WorkStatus;
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
  decline_reason: string | null;
  served_by_personnel_id: number | null;
  issued_at: string;
  called_at: string | null;
  completed_at: string | null;
  counter_id: number;
  position: number | null;
  served_by_name: string | null;
  eta_min: number | null;
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

export interface PresenceEntry {
  personnel_id: number;
  name: string;
  title: string | null;
  work_status: WorkStatus;
  counter_id: number | null;
  serving_token_number: string | null;
  serving_token_status: TokenStatus | null;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
}

export interface RegisterResponse extends AuthResponse {
  institution_code: string;
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

/** Payloads of the tagged WebSocket frames sent by the backend. */
export type SocketFrame =
  | { event: "queue"; data: QueueSnapshot }
  | { event: "presence"; data: { entries: PresenceEntry[] } };

export interface InstitutionVerify {
  code: string;
  name: string;
  type: string | null;
  is_active: boolean;
}

// --- admin overview -----------------------------------------------------------

export interface LiveFunnel {
  waiting: number;
  called: number;
  in_service: number;
}

export type CounterBoardState = "serving" | "idle" | "closed";

export interface CounterBoardEntry {
  counter_id: number;
  counter_name: string;
  counter_type: string | null;
  is_active: boolean;
  status: CounterBoardState;
  waiting_count: number;
  current_token_number: string | null;
  current_token_status: TokenStatus | null;
  served_by_name: string | null;
}

export interface TodayTotals {
  issued: number;
  served: number;
  no_shows: number;
  declined: number;
  avg_wait_min: number | null;
}

export interface HourlyPair {
  hour: number;
  issued: number;
  completed: number;
}

export interface AdminOverview {
  institution_id: number;
  updated_at: string;
  live: LiveFunnel;
  today: TodayTotals;
  counters: CounterBoardEntry[];
  staff: PresenceEntry[];
  hourly: HourlyPair[];
}

// --- staff workspace ----------------------------------------------------------

export interface StaffToday {
  served_by_me: number;
  no_shows_by_me: number;
  declined_by_me: number;
  avg_service_min: number | null;
}

export interface StaffWorkspace {
  personnel_id: number;
  name: string;
  title: string | null;
  work_status: WorkStatus;
  counter: Counter | null;
  queue: CounterQueueStatus | null;
  today: StaffToday;
  updated_at: string;
}

// --- public -------------------------------------------------------------------

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
  declined: number;
  waiting: number;
  avg_wait_min: number | null;
}

export interface AnalyticsSummary {
  from_at: string | null;
  to_at: string | null;
  issued: number;
  served: number;
  no_shows: number;
  declined: number;
  waiting_now: number;
  in_service_now: number;
  abandonment_rate: number | null;
  avg_wait_min: number | null;
  avg_total_min: number | null;
  peak_hour: number | null;
  hourly: HourlyCount[];
  per_counter: CounterAnalytics[];
}
