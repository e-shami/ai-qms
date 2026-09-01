"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusDot } from "@/components/ui/status-dot";
import { useCounters } from "@/hooks/use-resources";
import { useQueue } from "@/hooks/use-queue";
import { useCVUpdates } from "@/hooks/use-cv";
import { api } from "@/lib/api-client";
import { counterFormSchema, type CounterFormValues } from "@/lib/validators";
import type { Counter } from "@/types";

function CounterFormDialog({
  counter,
  open,
  onOpenChange,
  onSaved,
}: {
  counter?: Counter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(counter);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CounterFormValues>({
    resolver: zodResolver(counterFormSchema),
    defaultValues: {
      name: counter?.name ?? "",
      type: counter?.type ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      reset({ name: counter?.name ?? "", type: counter?.type ?? "" });
    }
  }, [counter, open, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function onSubmit(values: CounterFormValues) {
    setError(null);
    const payload = { name: values.name, type: values.type || null };
    try {
      if (editing && counter) {
        await api.patch(`/counters/${counter.id}`, payload);
        toast.success(`"${values.name}" updated`);
      } else {
        await api.post("/counters", payload);
        toast.success(`"${values.name}" created`);
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${counter?.name}` : "Add counter"}</DialogTitle>
          <DialogDescription>
            Counters issue tokens; the prefix comes from the counter name.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="space-y-2">
            <Label htmlFor="counter-name">Name</Label>
            <Input id="counter-name" aria-invalid={!!errors.name} {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="counter-type">Type (optional)</Label>
            <Input
              id="counter-type"
              placeholder="e.g. general, billing"
              aria-invalid={!!errors.type}
              {...register("type")}
            />
            {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CountersTab() {
  const { counters, loading, error, reload } = useCounters();
  const { snapshot } = useQueue();
  const cvUpdate = useCVUpdates();
  const [createOpen, setCreateOpen] = useState(false);
  const [editCounter, setEditCounter] = useState<Counter | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Counter | null>(null);

  const waitingFor = (id: number) =>
    snapshot?.counters.find((entry) => entry.counter.id === id)?.waiting_count;

  // Get CV queue length for a counter (from real-time WS or counter's stored value)
  const cvQueueLengthFor = (id: number) => {
    if (cvUpdate && cvUpdate.counter_id === id) {
      return cvUpdate.queue_length;
    }
    return counters.find((c) => c.id === id)?.cv_queue_length ?? null;
  };

  const cvServiceRateFor = (id: number) => {
    if (cvUpdate && cvUpdate.counter_id === id) {
      return cvUpdate.service_rate;
    }
    return counters.find((c) => c.id === id)?.cv_service_rate ?? null;
  };

  async function toggleActive(counter: Counter) {
    try {
      if (counter.is_active) {
        await api.delete(`/counters/${counter.id}`);
        toast.success(`"${counter.name}" deactivated`);
      } else {
        await api.post(`/counters/${counter.id}/activate`);
        toast.success(`"${counter.name}" activated`);
      }
      setDeactivateTarget(null);
      reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      // Server blocks deactivation while tokens are outstanding — surface it.
      toast.error(message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Deactivating a counter is blocked while it still has active tokens.
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          Add counter
        </Button>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading && !counters ? (
        <div className="space-y-2">
          <div className="h-9 animate-pulse rounded-md bg-muted" />
          <div className="h-9 animate-pulse rounded-md bg-muted" />
        </div>
      ) : !counters || counters.length === 0 ? (
        <EmptyState
          title="No counters yet"
          description="Counters are where tokens are issued and served."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden rounded-lg border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Waiting</TableHead>
                  <TableHead>CV Queue</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counters.map((counter) => {
                  const waiting = waitingFor(counter.id);
                  const cvQueue = cvQueueLengthFor(counter.id);
                  const cvRate = cvServiceRateFor(counter.id);
                  return (
                    <TableRow key={counter.id}>
                      <TableCell className="font-medium">{counter.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {counter.type ?? "—"}
                      </TableCell>
                      <TableCell>
                        {counter.is_active ? (
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <StatusDot tone="idle" />
                            Active
                          </span>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {counter.is_active ? (waiting ?? "—") : "—"}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {counter.is_active ? (
                          cvQueue !== null ? (
                            <span className="inline-flex items-center gap-1 text-sm text-primary">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                              </span>
                              {cvQueue}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )
                        ) : (
                          "—"
                        )}
                        {cvRate !== null && cvRate > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">({cvRate.toFixed(1)}/min)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => setEditCounter(counter)}
                          >
                            Edit
                          </Button>
                          {counter.is_active ? (
                            <Button
                              size="xs"
                              variant="destructive"
                              onClick={() => setDeactivateTarget(counter)}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button size="xs" onClick={() => toggleActive(counter)}>
                              Activate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {counters.map((counter) => {
              const waiting = waitingFor(counter.id);
              const cvQueue = cvQueueLengthFor(counter.id);
              const cvRate = cvServiceRateFor(counter.id);
              return (
                <li key={counter.id} className="rounded-lg border bg-card p-4">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{counter.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {counter.type ?? "No type"}
                      </p>
                    </div>
                    {counter.is_active ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <StatusDot tone="idle" />
                        {waiting != null ? `${waiting} waiting` : "Active"}
                      </span>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </div>
                  {counter.is_active && cvQueue !== null && (
                    <div className="mb-3 flex items-center gap-2 text-sm text-primary">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                      </span>
                      <span>CV: {cvQueue} people</span>
                      {cvRate !== null && cvRate > 0 && (
                        <span className="text-muted-foreground">({cvRate.toFixed(1)}/min)</span>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setEditCounter(counter)}
                    >
                      Edit
                    </Button>
                    {counter.is_active ? (
                      <Button
                        size="xs"
                        variant="destructive"
                        onClick={() => setDeactivateTarget(counter)}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button size="xs" onClick={() => toggleActive(counter)}>
                        Activate
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <CounterFormDialog
        open={createOpen || editCounter !== null}
        counter={editCounter ?? undefined}
        onOpenChange={(next) => {
          setCreateOpen(next);
          if (!next) setEditCounter(null);
        }}
        onSaved={reload}
      />

      <ConfirmDialog
        open={deactivateTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeactivateTarget(null);
        }}
        title={`Deactivate ${deactivateTarget?.name ?? ""}?`}
        description="It disappears from the public join flow and staff queues until reactivated."
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => deactivateTarget && toggleActive(deactivateTarget)}
      />
    </div>
  );
}
