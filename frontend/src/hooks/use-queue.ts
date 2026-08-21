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
  const [connected, setConnected] = useState(false);
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

    queueSocket.connect();
    const unsubscribe = queueSocket.subscribe((data) => {
      setSnapshot(data);
      setConnected(true);
      setError(null);
    });
    // WebSocket delivers updates; poll as a fallback if the socket is down.
    pollRef.current = setInterval(() => fetchSnapshot(), 30000);

    return () => {
      mountedRef.current = false;
      unsubscribe();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [accessToken, fetchSnapshot]);

  const reload = useCallback(() => {
    setLoading(true);
    fetchSnapshot().finally(() => setLoading(false));
  }, [fetchSnapshot]);

  return { snapshot, loading, error, connected, reload };
}