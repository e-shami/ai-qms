"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import { queueSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/auth";
import type { Counter, Institution, Personnel, TokenPage } from "@/types";

function useResource<T>(path: string, enabled: boolean) {
  const session = useAuthStore((state) => state.accessToken);
  const [entry, setEntry] = useState<{ path: string; session: string | null; data: T } | null>(null);
  const [failure, setFailure] = useState<{ path: string; session: string | null; message: string } | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const load = useCallback(
    () => {
      if (!enabled || !session || useAuthStore.getState().accessToken !== session) return;
      const requestId = ++requestIdRef.current;
      const pending = api.get<T>(path);
      return pending
        .then((data) => {
          if (mountedRef.current && requestId === requestIdRef.current && useAuthStore.getState().accessToken === session) {
            setEntry({ path, session, data });
            setFailure(null);
          }
        })
        .catch((err) => {
          if (
            mountedRef.current &&
            requestId === requestIdRef.current &&
            useAuthStore.getState().accessToken === session &&
            err instanceof Error
          ) {
            setFailure({ path, session, message: err.message });
          }
        });
    },
    [enabled, path, session],
  );

  useEffect(() => {
    mountedRef.current = true;
    requestIdRef.current += 1;
    const kickoff = setTimeout(load, 0);
    return () => {
      mountedRef.current = false;
      clearTimeout(kickoff);
    };
  }, [enabled, load]);

  const reload = useCallback(() => {
    setFailure(null);
    return load();
  }, [load]);

  // Data shown must belong to the current path (filters change paths).
  const data =
    enabled && entry?.path === path && entry.session === session
      ? entry.data
      : null;
  const error = enabled && failure?.path === path && failure.session === session ? failure.message : null;
  const loading = enabled && data === null && error === null;

  return { data, loading, error, reload };
}

function useAuthed(): boolean {
  return !!useAuthStore((state) => state.accessToken);
}

export function useCounters() {
  const authed = useAuthed();
  const { data, ...rest } = useResource<Counter[]>("/counters", authed);
  return { counters: data, ...rest };
}

export function usePersonnel() {
  const authed = useAuthed();
  const { data, ...rest } = useResource<Personnel[]>("/personnel", authed);
  return { personnel: data, ...rest };
}

export function useInstitution() {
  const authed = useAuthed();
  const { data, ...rest } = useResource<Institution>(
    "/institutions/me",
    authed,
  );
  return { institution: data, ...rest };
}

export function useTokens(options?: {
  counterId?: number;
  status?: string;
  issuedFrom?: string;
  issuedTo?: string;
  limit?: number;
  offset?: number;
}) {
  const authed = useAuthed();
  const params = new URLSearchParams();
  if (options?.counterId) params.set("counter_id", String(options.counterId));
  if (options?.status) params.set("status", options.status);
  if (options?.issuedFrom) params.set("issued_from", options.issuedFrom);
  if (options?.issuedTo) params.set("issued_to", options.issuedTo);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const qs = params.toString();
  const key = `/tokens${qs ? `?${qs}` : ""}`;
  const { data, ...rest } = useResource<TokenPage>(key, authed);
  const reload = rest.reload;
  useEffect(() => {
    if (!authed) return;
    queueSocket.connect();
    const unsubscribe = queueSocket.subscribe(() => reload());
    const unsubscribeState = queueSocket.subscribeState((connected) => { if (connected) reload(); });
    const poll = setInterval(reload, 15000);
    return () => { unsubscribe(); unsubscribeState(); clearInterval(poll); };
  }, [authed, reload]);
  return { tokens: data?.items ?? null, total: data?.total ?? 0, ...rest };
}
