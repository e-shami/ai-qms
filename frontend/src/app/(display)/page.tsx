"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useQueue } from "@/hooks/use-queue";
import { useAuthStore } from "@/store/auth";
import type { CounterQueueStatus } from "@/types";

function nowServing(status: CounterQueueStatus): string {
  const current =
    status.tokens.find((token) => token.status === "in_service") ??
    status.tokens.find((token) => token.status === "called");
  return current?.token_number ?? "—";
}

function nextTokens(status: CounterQueueStatus, count: number): string[] {
  return status.tokens
    .filter((token) => token.status === "waiting")
    .slice(0, count)
    .map((token) => token.token_number);
}

export default function DisplayPage() {
  const { snapshot, connected } = useQueue();
  const user = useAuthStore((state) => state.user);
  const [clock, setClock] = useState("");

  // Wall clock for the lobby; interval-only state avoids SSR mismatch.
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  const counters = snapshot?.counters ?? [];

  return (
    <div className="min-h-svh bg-background p-6 sm:p-10">
      <header className="mb-8 flex items-end justify-between border-b pb-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Now serving</h1>
          <p className="text-sm text-muted-foreground">
            {connected ? "Live updates" : "Reconnecting…"}
          </p>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-2xl font-medium tabular-nums text-muted-foreground sm:text-3xl">
            {clock}
          </span>
          <Link
            href="/overview"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground print:hidden"
            aria-label="Exit display"
            title="Exit display"
          >
            <X className="size-5" />
          </Link>
        </div>
      </header>

      {counters.length === 0 ? (
        <p className="py-20 text-center text-lg text-muted-foreground">
          No active counters right now.
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {counters.map((status) => (
            <section
              key={status.counter.id}
              className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h2 className="truncate text-xl font-semibold">{status.counter.name}</h2>
                <Badge variant={nowServing(status) === "—" ? "secondary" : "default"}>
                  {status.waiting_count} waiting
                </Badge>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Now serving
                </p>
                <p
                  className={`font-semibold tabular-nums ${
                    nowServing(status) === "—"
                      ? "text-4xl text-muted-foreground/50"
                      : "text-6xl"
                  }`}
                >
                  {nowServing(status)}
                </p>
              </div>
              <div>
                <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Up next</p>
                <div className="flex flex-wrap gap-2">
                  {nextTokens(status, 4).length === 0 ? (
                    <span className="text-sm text-muted-foreground">No one waiting</span>
                  ) : (
                    nextTokens(status, 4).map((number) => (
                      <span
                        key={number}
                        className="rounded-md border px-2.5 py-1 text-lg font-medium tabular-nums"
                      >
                        {number}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
      <footer className="mt-10 text-center text-xs text-muted-foreground/60">
        AI-QMS{user ? ` · ${user.institution_id}` : ""}
      </footer>
    </div>
  );
}
