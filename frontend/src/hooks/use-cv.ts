"use client";

import { useEffect, useState } from "react";
import { queueSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/auth";
import type { CVQueueUpdate, CVStatus } from "@/types";
import { api } from "@/lib/api-client";

/**
 * Hook to receive real-time CV queue updates via WebSocket.
 * Returns the latest CV update for a specific counter (or all counters).
 */
export function useCVUpdates(counterId?: number) {
  const [cvUpdate, setCVUpdate] = useState<CVQueueUpdate | null>(null);
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    if (!accessToken) return;

    queueSocket.connect();
    const unsubscribe = queueSocket.subscribeCVUpdate((data) => {
      if (!counterId || data.counter_id === counterId) {
        setCVUpdate(data);
      }
    });

    return () => unsubscribe();
  }, [accessToken, counterId]);

  return cvUpdate;
}

/**
 * Hook to fetch current CV status for a counter via REST API.
 * Useful for initial load before WebSocket updates arrive.
 */
export function useCVStatus(counterId: number) {
  const [status, setStatus] = useState<CVStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    if (!accessToken) return;

    let mounted = true;
    async function fetchStatus() {
      try {
        setLoading(true);
        const data = await api.get<CVStatus>(`/cv/counters/${counterId}/cv-status`);
        if (mounted) {
          setStatus(data);
          setError(null);
        }
      } catch (err) {
        if (mounted && err instanceof Error) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchStatus();
    return () => {
      mounted = false;
    };
  }, [accessToken, counterId]);

  return { status, loading, error };
}