import { refreshOnce } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";
import type { PresenceEntry, QueueSnapshot, SocketFrame } from "@/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws";

type QueueListener = (snapshot: QueueSnapshot) => void;
type PresenceListener = (entries: PresenceEntry[]) => void;
type StateListener = (connected: boolean) => void;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10000;
const RECONNECT_JITTER_MS = 500;

/** Frames without a tag (older deployments) fall back to the queue handler. */
function routeFrame(
  raw: unknown,
  onQueue: QueueListener,
  onPresence: PresenceListener
): void {
  const frame = raw as SocketFrame | QueueSnapshot;
  if (frame && typeof frame === "object" && "event" in frame) {
    if (frame.event === "queue") onQueue(frame.data);
    if (frame.event === "presence") onPresence(frame.data.entries);
    return;
  }
  const snapshot = frame as QueueSnapshot;
  if (snapshot && Array.isArray(snapshot.counters)) onQueue(snapshot);
}

class QueueSocket {
  private ws: WebSocket | null = null;
  private queueListeners = new Set<QueueListener>();
  private presenceListeners = new Set<PresenceListener>();
  private stateListeners = new Set<StateListener>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private connectedState = false;
  private reconnectAttempt = 0;

  /** Current link status — lets late subscribers read state, not just changes. */
  isConnected(): boolean {
    return this.connectedState;
  }

  /** Force a reconnection with the current token (e.g., after manual token refresh). */
  forceReconnect(): void {
    if (this.ws) {
      this.ws.close();
    } else if (!this.disposed) {
      this.reconnectAttempt = 0;
      this.connect();
    }
  }

  connect(): void {
    this.disposed = false;
    if (typeof window === "undefined" || this.ws) return;
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    const ws = new WebSocket(`${WS_BASE}/queue?token=${token}`);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.emitState(true);
    };
    ws.onmessage = (event) => {
      try {
        routeFrame(JSON.parse(event.data as string), this.dispatchQueue, this.dispatchPresence);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = (event) => {
      this.ws = null;
      this.emitState(false);
      if (this.disposed) return;
      // 1008 = backend rejected the token → rotate before retrying. Any other
      // close (server restart, network blip) just reconnects — no refresh
      // spam, and a transient outage must never log the user out.
      const authRejected = event.code === 1008;
      const attempt = authRejected ? refreshOnce() : Promise.resolve(true);
      void attempt.finally(() => {
        if (!this.disposed && useAuthStore.getState().accessToken) {
          const delay = Math.min(
            RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt) +
              Math.random() * RECONNECT_JITTER_MS,
            RECONNECT_MAX_MS
          );
          this.reconnectAttempt++;
          this.retryTimer = setTimeout(() => this.connect(), delay);
        }
      });
    };
    ws.onerror = () => ws.close();
  }

  subscribe(listener: QueueListener): () => void {
    this.queueListeners.add(listener);
    return () => {
      this.queueListeners.delete(listener);
    };
  }

  subscribePresence(listener: PresenceListener): () => void {
    this.presenceListeners.add(listener);
    return () => {
      this.presenceListeners.delete(listener);
    };
  }

  subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  disconnect(): void {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
    this.emitState(false);
  }

  private dispatchQueue = (snapshot: QueueSnapshot) => {
    this.queueListeners.forEach((listener) => listener(snapshot));
  };

  private dispatchPresence = (entries: PresenceEntry[]) => {
    this.presenceListeners.forEach((listener) => listener(entries));
  };

  private emitState(connected: boolean): void {
    this.connectedState = connected;
    this.stateListeners.forEach((listener) => listener(connected));
  }
}

export const queueSocket = new QueueSocket();
