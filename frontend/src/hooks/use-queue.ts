"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import { queueSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/auth";
import type { QueueSnapshot } from "@/types";

/** Live queue snapshot: initial fetch, WebSocket updates, polling fallback. */
export function useQueue() {
  const [entry, setEntry] = useState<{ session: string; snapshot: QueueSnapshot } | null>(null);
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
  const requestIdRef = useRef(0);
  const prevTokenRef = useRef<string | null>(accessToken);

  const fetchSnapshot = useCallback(async () => {
    const session = useAuthStore.getState().accessToken;
    if (!session) return;
    const requestId = ++requestIdRef.current;
    try {
      const data = await api.get<QueueSnapshot>("/queue");
      if (mountedRef.current && requestId === requestIdRef.current && session === useAuthStore.getState().accessToken) {
        setEntry({ session, snapshot: data });
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current && requestId === requestIdRef.current && session === useAuthStore.getState().accessToken && err instanceof Error) setError(err.message);
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  // Reconnect WebSocket when access token changes (e.g., after refresh)
  useEffect(() => {
    if (prevTokenRef.current && accessToken && prevTokenRef.current !== accessToken) {
      queueSocket.forceReconnect();
    }
    prevTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    mountedRef.current = true;
    requestIdRef.current += 1;
    if (!accessToken) return;

    // Initial load — otherwise the first data arrives only at the first poll
    // tick (30s) or the next WS broadcast (next mutation). Deferred off the
    // effect body to keep the lint rule about sync setState happy.
    const kickoff = setTimeout(() => void fetchSnapshot(), 0);
    queueSocket.connect();
    const unsubscribe = queueSocket.subscribe((data) => {
      const user = useAuthStore.getState().user;
      if (useAuthStore.getState().accessToken !== accessToken || !user || data.institution_id !== user.institution_id) return;
      // A live frame supersedes any GET started before this queue mutation.
      requestIdRef.current += 1;
      setEntry((previous) => previous?.session === accessToken && previous.snapshot.updated_at > data.updated_at
        ? previous : { session: accessToken, snapshot: data });
      setError(null);
      setLoading(false);
    });
    const unsubscribeState = queueSocket.subscribeState((next) => {
      setConnected(next);
      if (next) void fetchSnapshot();
    });
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
    return fetchSnapshot();
  }, [fetchSnapshot]);

  const snapshot = accessToken && entry?.session === accessToken ? entry.snapshot : null;
  return { snapshot, loading, error, connected, reload };
}
