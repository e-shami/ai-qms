"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import toast from "react-hot-toast";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { useCounters } from "@/hooks/use-resources";
import { useQueue } from "@/hooks/use-queue";
import { api } from "@/lib/api-client";
import type { Counter } from "@/types";

/**
 * Lists active counters with live waiting counts. A counter claimed by
 * another on-duty colleague is shown as occupied; the server is the
 * final arbiter and answers 409 on races.
 */
export function CounterSwitcher({
  currentCounterId,
  onChanged,
}: {
  currentCounterId: number | null;
  onChanged: () => void;
}) {
  const { counters, loading, reload: reloadCounters } = useCounters();
  const { snapshot } = useQueue();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  function waitingFor(counter: Counter): number | null {
    return (
      snapshot?.counters.find((entry) => entry.counter.id === counter.id)
        ?.waiting_count ?? null
    );
  }

  async function claim(counter: Counter) {
    setBusyId(counter.id);
    setError(null);
    try {
      await api.post("/staff/counter", { counter_id: counter.id });
      toast.success(`Now serving at ${counter.name}`);
      setOpen(false);
      onChanged();
      reloadCounters();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not switch";
      setError(message);
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  }

  // Include current counter even if inactive so user can see assignment and switch away
  const activeCounters = counters
    ?.filter((counter) => counter.is_active || counter.id === currentCounterId)
    ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <ArrowLeftRight />
        Switch
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch counter</DialogTitle>
          <DialogDescription>
            Pick any free counter — you take the queue with you from this point.
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="destructive">{error}</Alert>}

        {loading && activeCounters.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
        ) : activeCounters.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No active counters available.
          </p>
        ) : (
          <ul className="space-y-2">
            {activeCounters.map((counter) => {
              const waiting = waitingFor(counter);
              const current = counter.id === currentCounterId;
              const isInactive = !counter.is_active;
              return (
                <li
                  key={counter.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {counter.name}
                      {counter.type && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {counter.type}
                        </span>
                      )}
                      {isInactive && (
                        <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {current
                        ? isInactive
                          ? "Your current counter (inactive — switch to an active counter)"
                          : "Your current counter"
                        : waiting != null
                        ? `${waiting} waiting`
                        : "—"}
                    </p>
                  </div>
                  {current ? (
                    <Badge variant={isInactive ? "destructive" : "secondary"}>
                      {isInactive ? "Current (inactive)" : "Current"}
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busyId !== null || isInactive}
                      onClick={() => claim(counter)}
                    >
                      {busyId === counter.id ? "Moving…" : "Move here"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <StatusDot tone="live" />
          Availability updates in real time.
        </p>
      </DialogContent>
    </Dialog>
  );
}
