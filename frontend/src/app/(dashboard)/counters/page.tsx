"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Panel } from "@/components/ui/status";
import { useCounters } from "@/hooks/use-resources";
import { useQueue } from "@/hooks/use-queue";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";
import type { Counter } from "@/types";

function CounterFormDialog({
  counter,
  onSaved,
  onError,
}: {
  counter?: Counter;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(counter?.name ?? "");
  const [type, setType] = useState(counter?.type ?? "");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (counter) {
        await api.patch(`/counters/${counter.id}`, {
          name: name.trim() || undefined,
          type: type.trim() || undefined,
        });
      } else {
        await api.post("/counters", {
          name: name.trim(),
          type: type.trim() || null,
        });
      }
      setOpen(false);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          counter ? <Button size="xs" variant="outline" /> : <Button size="sm" />
        }
      >
        {counter ? "Edit" : (
          <>
            <Plus />
            New counter
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{counter ? `Edit ${counter.name}` : "New counter"}</DialogTitle>
          <DialogDescription>
            A counter is a service point within your institution.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="counter-name">Name</Label>
            <Input
              id="counter-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Teller 1, Pharmacy, Admissions"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="counter-type">Type (optional)</Label>
            <Input
              id="counter-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="e.g. cashier, pharmacy, registration"
            />
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CountersPage() {
  const { counters, loading, error, reload } = useCounters();
  const { snapshot } = useQueue();
  const role = useAuthStore((state) => state.user?.role);
  const isAdmin = role === "admin";
  const [actionError, setActionError] = useState<string | null>(null);

  async function deactivate(counter: Counter) {
    if (!confirm(`Deactivate ${counter.name}?`)) return;
    try {
      await api.delete(`/counters/${counter.id}`);
      setActionError(null);
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Deactivation failed");
    }
  }

  const activeCount = (counterId: number) => {
    const status = snapshot?.counters.find((c) => c.counter.id === counterId);
    return status
      ? status.waiting_count + status.called_count + status.in_service_count
      : 0;
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Counters</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Manage the service points where tokens are issued."
              : "Your institution's service points (read-only for staff)."}
          </p>
        </div>
        {isAdmin && (
          <CounterFormDialog onSaved={reload} onError={setActionError} />
        )}
      </div>

      <Panel title="All counters">
        {actionError && <Alert variant="destructive">{actionError}</Alert>}
        {error && <Alert variant="destructive">{error}</Alert>}
        {loading && !counters ? (
          <div className="space-y-3">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : !counters || counters.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No counters yet{isAdmin ? " — create your first one above." : "."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Active queue</TableHead>
                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {counters.map((counter) => (
                <TableRow key={counter.id}>
                  <TableCell className="font-medium">{counter.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {counter.type ?? "—"}
                  </TableCell>
                  <TableCell>
                    {counter.is_active ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {activeCount(counter.id)}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <CounterFormDialog
                          counter={counter}
                          onSaved={reload}
                          onError={setActionError}
                        />
                        {counter.is_active && (
                          <Button
                            size="xs"
                            variant="destructive"
                            onClick={() => deactivate(counter)}
                          >
                            Deactivate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}