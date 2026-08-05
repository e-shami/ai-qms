const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws";

/**
 * WebSocket client stub for real-time queue updates.
 * No connection logic yet — wired up in Phase 4 / Phase 6.
 */
export function createSocket(): WebSocket {
  return new WebSocket(WS_BASE);
}