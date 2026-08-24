"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import { queueSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/auth";
import type { AdminOverview } from "@/types";

const POLL_MS = 10000;

/**
 * Admin dashboard feed: /overview/admin polled at a slow cadence and kept
 * fresh between polls by WebSocket queue/presence events.
 */
export function useAdminOverview() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authed = useAuthStore((state) => Boolean(state.accessToken));
  const mountedRef = useRef(true);

  const fetchOverview = useCallback(async () => {
    if (!useAuthStore.getState().accessToken) return;
    const tzOffsetMinutes = -new Date().getTimezoneOffset();
    try {
      const data = await api.get<AdminOverview>(
        `/overview/admin?tz_offset_minutes=${tzOffsetMinutes}`
      );
      if (mountedRef.current) {
        setOverview(data);
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
    if (!authed) return;

    const kickoff = setTimeout(() => void fetchOverview(), 0);
    const unsubscribeQueue = queueSocket.subscribe(() => void fetchOverview());
    const unsubscribePresence = queueSocket.subscribePresence(() => void fetchOverview());
    const poll = setInterval(() => void fetchOverview(), POLL_MS);

    return () => {
      mountedRef.current = false;
      clearTimeout(kickoff);
      unsubscribeQueue();
      unsubscribePresence();
      clearInterval(poll);
    };
  }, [authed, fetchOverview]);

  const reload = useCallback(() => {
    setLoading(true);
    return fetchOverview().finally(() => setLoading(false));
  }, [fetchOverview]);

  return { overview, loading, error, reload };
}
