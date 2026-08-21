"use client";

import { Radio } from "lucide-react";

import { CounterQueue } from "@/components/queue/counter-queue";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/ui/status";
import { useQueue } from "@/hooks/use-queue";

export function ConnectionIndicator({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={`size-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`}
        aria-hidden
      />
      {connected ? "Live" : "Fallback polling"}
    </span>
  );
}

export function LiveQueueView({ compact = false }: { compact?: boolean }) {
  const { snapshot, loading, error, connected, reload } = useQueue();

  if (loading && !snapshot) {
    return (
      <div className="space-y-4">
        {compact ? <Skeleton className="h-24" /> : <Skeleton className="h-32" />}
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (!snapshot || snapshot.counters.length === 0) {
    return (
      <Panel title="Live queue" action={<ConnectionIndicator connected={connected} />}>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Radio className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No active counters yet — create one to start issuing tokens.
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </Panel>
    );
  }

  const visible = compact ? snapshot.counters.slice(0, 3) : snapshot.counters;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Updated {new Date(snapshot.updated_at).toLocaleTimeString()}
        </span>
        <div className="flex items-center gap-3">
          <ConnectionIndicator connected={connected} />
          <Button size="sm" variant="outline" onClick={reload}>
            Refresh
          </Button>
        </div>
      </div>
      {visible.map((status) => (
        <CounterQueue key={status.counter.id} status={status} onChanged={reload} />
      ))}
    </div>
  );
}