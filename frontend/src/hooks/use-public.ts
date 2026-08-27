"use client";

import { useCallback, useEffect, useState } from "react";

import { API_BASE } from "@/lib/api-client";
import type { PublicCounter, PublicInstitution, PublicTicket } from "@/types";

const TICKET_POLL_MS = 15000;

export function usePublicInstitutions() {
  const [data, setData] = useState<PublicInstitution[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/public/institutions`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load institutions");
        return res.json() as Promise<PublicInstitution[]>;
      })
      .then((institutions) => {
        if (cancelled) return;
        setData(institutions);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Request failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { institutions: data, loading: data === null && error === null, error };
}

export function usePublicCounters(institutionId: number | null) {
  const [data, setData] = useState<{ institutionId: number; counters: PublicCounter[] } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  // Loading is derived: we're loading whenever shown data isn't for the
  // currently selected institution (or there's nothing to show yet).
  const current =
    data !== null && data.institutionId === institutionId ? data.counters : null;
  const loading = institutionId !== null && current === null && error === null;

  useEffect(() => {
    if (institutionId === null) return;
    let cancelled = false;
    fetch(`${API_BASE}/public/institutions/${institutionId}/counters`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load services");
        return res.json() as Promise<PublicCounter[]>;
      })
      .then((counters) => {
        if (cancelled) return;
        setData({ institutionId, counters });
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Request failed");
      });
    return () => {
      cancelled = true;
    };
  }, [institutionId]);

  return { counters: current, loading, error };
}

/** Polls a public ticket; no auth required. */
export function useTicket(institutionId: number | null, tokenNumber: string | null) {
  const [data, setData] = useState<{ key: string; ticket: PublicTicket } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = institutionId !== null && tokenNumber ? `${institutionId}:${tokenNumber}` : null;
  const ticket = data?.key === key && key !== null ? data.ticket : null;
  const missingInput = key === null;

  const fetchTicket = useCallback(async () => {
    if (!institutionId || !tokenNumber) return;
    try {
      const res = await fetch(
        `${API_BASE}/public/tokens/${encodeURIComponent(tokenNumber)}?institution_id=${institutionId}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Token not found");
      }
      const next = (await res.json()) as PublicTicket;
      setData({ key: `${institutionId}:${tokenNumber}`, ticket: next });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    }
  }, [institutionId, tokenNumber]);

  useEffect(() => {
    if (!institutionId || !tokenNumber) return;
    // Initial fetch deferred off the effect body (lint: no sync setState there).
    const kickoff = setTimeout(() => void fetchTicket(), 0);
    const timer = setInterval(() => fetchTicket(), TICKET_POLL_MS);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [fetchTicket, institutionId, tokenNumber]);

  return { ticket, loading: !missingInput && ticket === null && error === null, error, reload: fetchTicket };
}

export async function issuePublicToken(payload: {
  institution_id: number;
  counter_id: number;
  customer_name?: string | null;
  customer_phone?: string | null;
}): Promise<PublicTicket> {
  const res = await fetch(`${API_BASE}/public/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail ?? "Could not issue a token");
  return body as PublicTicket;
}
