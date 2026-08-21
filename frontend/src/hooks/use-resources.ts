"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";
import type { Counter, Institution, Personnel, TokenPage } from "@/types";

// --- tiny shared cache -------------------------------------------------------
// Purpose: dedupe identical concurrent GETs (several components ask for the
// same resource on one screen) and enable instant paint on quick remounts.
// Short TTL keeps it a performance aid, never a staleness hazard — mutations
// always call reload(), which bypasses the cache entirely.
const CACHE_TTL_MS = 5000;
const CACHE_MAX_ENTRIES = 50;

type CacheEntry = { data: unknown; at: number };

const responseCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function cacheGet(path: string): CacheEntry | undefined {
  const hit = responseCache.get(path);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    responseCache.delete(path);
    return undefined;
  }
  return hit;
}

function cacheSet(path: string, data: unknown): void {
  if (!responseCache.has(path) && responseCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  responseCache.set(path, { data, at: Date.now() });
}

function fetchShared<T>(path: string): Promise<T> {
  const existing = inflight.get(path);
  if (existing) return existing as Promise<T>;
  const promise = api.get<T>(path).finally(() => inflight.delete(path));
  inflight.set(path, promise);
  return promise;
}

function useResource<T>(path: string, enabled: boolean) {
  // Instant paint: seed from cache synchronously so remounts don't flash skeletons.
  const [entry, setEntry] = useState<{ path: string; data: T } | null>(() => {
    if (!enabled) return null;
    const hit = cacheGet(path);
    return hit ? { path, data: hit.data as T } : null;
  });
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(
    (force: boolean) => {
      if (!enabled) return;
      if (!force) {
        const hit = cacheGet(path);
        if (hit) {
          setEntry({ path, data: hit.data as T });
          setError(null);
          return;
        }
      }
      const pending = force ? fetchShared<T>(path) : Promise.resolve(fetchShared<T>(path));
      void pending
        .then((data) => {
          if (mountedRef.current) {
            cacheSet(path, data);
            setEntry({ path, data });
            setError(null);
          }
        })
        .catch((err) => {
          if (mountedRef.current && err instanceof Error) setError(err.message);
        });
    },
    [enabled, path]
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;
    const kickoff = setTimeout(() => load(false), 0);
    return () => {
      mountedRef.current = false;
      clearTimeout(kickoff);
    };
  }, [enabled, load]);

  const reload = useCallback(() => {
    setError(null);
    load(true);
  }, [load]);

  // Data shown must belong to the current path (filters change paths).
  const data = entry?.path === path ? entry.data : ((cacheGet(path)?.data as T | undefined) ?? null);
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
