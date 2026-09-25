"use client";

import { useCallback, useEffect, useState } from "react";

import { API_BASE, apiErrorMessage } from "@/lib/api-client";
import type { IntakePayload, ReferralSource, PublicCounter, PublicInstitution, PublicTicket } from "@/types";

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
  const [failure, setFailure] = useState<{ institutionId: number; message: string } | null>(null);
  const error = failure?.institutionId === institutionId ? failure.message : null;

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
        setFailure(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setFailure({ institutionId, message: err instanceof Error ? err.message : "Request failed" });
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

export async function issuePublicToken(payload: IntakePayload & {
  customer_cnic: string;
  referral_source: ReferralSource;
  institution_id: number;
  counter_id: number;
  customer_name?: string | null;
  customer_phone?: string | null;
  whatsapp_copy?: boolean;
}): Promise<PublicTicket> {
  const res = await fetch(`${API_BASE}/public/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res, "Could not issue a token"));
  return await res.json() as PublicTicket;
}
