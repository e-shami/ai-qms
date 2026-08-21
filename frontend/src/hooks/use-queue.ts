"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import { queueSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/auth";
import type { QueueSnapshot } from "@/types";

/** Live queue snapshot: initial fetch, WebSocket updates, polling fallback. */
export function useQueue() {
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Read the socket's current state at mount — a component mounting after the
  // socket already opened would otherwise wait forever for a change event.
  const [connected, setConnected] = useState<boolean>(() =>
    queueSocket.isConnected(),
  );
  const accessToken = useAuthStore((state) => state.accessToken);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const fetchSnapshot = useCallback(async () => {
    if (!useAuthStore.getState().accessToken) return;
    try {
      const data = await api.get<QueueSnapshot>("/queue");
      if (mountedRef.current) {
        setSnapshot(data);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current && err instanceof Error) setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!accessToken) return;

    // Initial load — otherwise the first data arrives only at the first poll
    // tick (30s) or the next WS broadcast (next mutation). Deferred off the
    // effect body to keep the lint rule about sync setState happy.
    const kickoff = setTimeout(() => void fetchSnapshot(), 0);
    queueSocket.connect();
    const unsubscribe = queueSocket.subscribe((data) => {
      setSnapshot(data);
      setError(null);
    });
    const unsubscribeState = queueSocket.subscribeState(setConnected);
    // WebSocket delivers updates; poll as a fallback if the socket is down.
    pollRef.current = setInterval(() => fetchSnapshot(), 30000);

    return () => {
      mountedRef.current = false;
      clearTimeout(kickoff);
      unsubscribe();
      unsubscribeState();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [accessToken, fetchSnapshot]);

  const reload = useCallback(() => {
    setLoading(true);
    fetchSnapshot().finally(() => setLoading(false));
  }, [fetchSnapshot]);

  return { snapshot, loading, error, connected, reload };
}
