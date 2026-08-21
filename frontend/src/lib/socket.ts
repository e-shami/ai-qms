import { useAuthStore } from "@/store/auth";
import type { QueueSnapshot } from "@/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws";

type Listener = (snapshot: QueueSnapshot) => void;

class QueueSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  connect(): void {
    this.disposed = false;
    if (typeof window === "undefined" || this.ws) return;
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    const ws = new WebSocket(`${WS_BASE}/queue?token=${token}`);
    this.ws = ws;

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
      if (!this.disposed && useAuthStore.getState().accessToken) {
        this.retryTimer = setTimeout(() => this.connect(), 2000);
      }
    };
    ws.onerror = () => ws.close();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  disconnect(): void {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const queueSocket = new QueueSocket();