import { useAuthStore } from "@/store/auth";
import type { QueueSnapshot } from "@/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws";

type Listener = (snapshot: QueueSnapshot) => void;
type StateListener = (connected: boolean) => void;
const RECONNECT_MS = 2000;

class QueueSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<StateListener>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  connect(): void {
    this.disposed = false;
    if (typeof window === "undefined" || this.ws) return;
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    const ws = new WebSocket(`${WS_BASE}/queue?token=${token}`);
    this.ws = ws;

    ws.onopen = () => this.emitState(true);
    ws.onmessage = (event) => {
      try {
        const snapshot = JSON.parse(event.data as string) as QueueSnapshot;
        this.listeners.forEach((listener) => listener(snapshot));
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      this.ws = null;
      this.emitState(false);
      if (this.disposed) return;
      // Access tokens expire after 15 min — silently rotate before retrying
      // so an idle tab doesn't loop on rejected connections forever.
      void useAuthStore
        .getState()
        .refresh()
        .finally(() => {
          if (!this.disposed && useAuthStore.getState().accessToken) {
            this.retryTimer = setTimeout(() => this.connect(), RECONNECT_MS);
          }
        });
    };
    ws.onerror = () => ws.close();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
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

  private emitState(connected: boolean): void {
    this.stateListeners.forEach((listener) => listener(connected));
  }
}

export const queueSocket = new QueueSocket();
