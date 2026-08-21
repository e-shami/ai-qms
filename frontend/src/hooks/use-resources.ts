"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";
import type { Counter, Institution, Personnel, TokenPage } from "@/types";

function useResource<T>(path: string, enabled: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api
      .get<T>(path)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Request failed");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, enabled]);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const result = await api.get<T>(path);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [path, enabled]);

  return { data, loading, error, reload, setData };
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
  const { data, ...rest } = useResource<Institution>("/institutions/me", authed);
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
  return { tokens: data?.items ?? null, total: data?.total ?? 0, ...rest };
}