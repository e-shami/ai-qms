"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import { queueSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/auth";
import type { PresenceEntry, StaffWorkspace } from "@/types";

const POLL_MS = 15000;

/**
 * Staff workspace feed: one /staff/workspace payload (counter, queue,
 * today stats, presence) refreshed by WebSocket activity and a slow poll.
 */
export function useWorkspace() {
  const [workspace, setWorkspace] = useState<StaffWorkspace | null>(null);
  const [presence, setPresence] = useState<PresenceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authed = useAuthStore((state) => Boolean(state.accessToken));
  const accessToken = useAuthStore((state) => state.accessToken);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const prevTokenRef = useRef<string | null>(accessToken);

  const fetchWorkspace = useCallback(async () => {
    if (!useAuthStore.getState().accessToken) return;
    const tzOffsetMinutes = -new Date().getTimezoneOffset();
    const requestId = ++requestIdRef.current;
    try {
      const data = await api.get<StaffWorkspace>(
        `/staff/workspace?tz_offset_minutes=${tzOffsetMinutes}`
      );
      // Ignore stale responses: only update state if this is still the latest request
      if (mountedRef.current && requestId === requestIdRef.current) {
        setWorkspace(data);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current && requestId === requestIdRef.current && err instanceof Error) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
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
    if (!authed) return;

    const kickoff = setTimeout(() => void fetchWorkspace(), 0);
    const unsubscribeQueue = queueSocket.subscribe(() => void fetchWorkspace());
    const unsubscribePresence = queueSocket.subscribePresence((entries) =>
      setPresence(entries)
    );
    const poll = setInterval(() => void fetchWorkspace(), POLL_MS);

    return () => {
      mountedRef.current = false;
      clearTimeout(kickoff);
      unsubscribeQueue();
      unsubscribePresence();
      clearInterval(poll);
    };
  }, [authed, fetchWorkspace]);

  const reload = useCallback(() => {
    setLoading(true);
    const requestId = ++requestIdRef.current;
    return fetchWorkspace().finally(() => {
      // Only clear loading if this is still the latest request
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    });
  }, [fetchWorkspace]);

  return { workspace, presence, loading, error, reload };
}
