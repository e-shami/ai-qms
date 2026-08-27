"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Ban,
  CheckCircle2,
  Clock3,
  PhoneCall,
  Play,
  Radio,
} from "lucide-react";
import toast from "react-hot-toast";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { CounterSwitcher } from "@/components/workspace/counter-switcher";
import { PresenceControl } from "@/components/workspace/presence-control";
import { useQueue } from "@/hooks/use-queue";
import { useWorkspace } from "@/hooks/use-workspace";
import { api } from "@/lib/api-client";
import { declineSchema, type DeclineFormValues } from "@/lib/validators";
import type { Token } from "@/types";

/**
 * Tracks "now" in state once per second while active so elapsed times
 * stay live. The initial sync is deferred off the effect body.
 */
function useTicker(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const kickoff = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [active]);
  return now;
}

export default function WorkspacePage() {
  const { workspace, loading, error, reload } = useWorkspace();
  const [declineTarget, setDeclineTarget] = useState<Token | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  // Queue hook keeps the WS subscription alive for the switcher's counts.
  useQueue();

  const queueTokens = workspace?.queue?.tokens ?? [];
  const serving =
    queueTokens.find((token) => token.status === "in_service") ??
    queueTokens.find((token) => token.status === "called") ??
    null;
  const upNext = queueTokens.filter((token) => token.status === "waiting");
  const heroActive = serving != null;
  const now = useTicker(heroActive);

  const waitedSeconds = serving
    ? Math.max(
        0,
        Math.floor(
          (now - new Date(serving.called_at ?? serving.issued_at).getTime()) /
            1000,
        ),
      )
    : null;

  async function runTokenAction(
    token: Token,
    action: string,
    successMessage: string,
    body?: unknown,
  ) {
    setBusyAction(`${token.id}:${action}`);
    try {
      await api.post(`/tokens/${token.id}/${action}`, body);
      toast.success(successMessage);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <PageHeader
        title="My queue"
        description={
          workspace?.counter
            ? `Serving at ${workspace.counter.name}${
                workspace.counter.type ? ` — ${workspace.counter.type}` : ""
              }${workspace.counter.is_active ? "" : " (inactive)"}.`
            : "Claim a counter to start working the queue."
        }
        action={
          <CounterSwitcher
            currentCounterId={workspace?.counter?.id ?? null}
            onChanged={reload}
          />
        }
      />

      {error && <Alert variant="destructive">{error}</Alert>}

      {/* Presence */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">
              {workspace?.name ?? "…"}
              {workspace?.title && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · {workspace.title}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              Your declared status
            </p>
          </div>
          {workspace && (
            <PresenceControl value={workspace.work_status} onChanged={reload} />
          )}
        </CardContent>
      </Card>

      {/* Unassigned counter prompt */}
      {workspace && !workspace.counter && !loading && (
        <Card className="border-primary/30">
          <CardContent className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <Radio className="size-5 text-primary" />
              <p className="text-sm">
                No counter claimed yet — pick one to see your live queue.
              </p>
            </div>
            <CounterSwitcher currentCounterId={null} onChanged={reload} />
          </CardContent>
        </Card>
      )}

      {/* Now serving */}
      {loading && !workspace ? (
        <Skeleton className="h-48" />
      ) : workspace?.queue && serving ? (
        <section
          aria-label="Now serving"
          className="rounded-xl border bg-card p-6 text-center shadow-sm sm:p-8"
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {serving.status === "called"
              ? "Called — waiting for customer"
              : "In service"}
          </p>
          <p className="mt-2 font-mono text-5xl font-semibold tabular-nums tracking-tight sm:text-7xl">
            {serving.token_number}
          </p>
          <div className="mt-3 space-y-0.5 text-sm text-muted-foreground">
            <p>{serving.customer_name ?? "Walk-in"}</p>
            {waitedSeconds != null && (
              <p className="tabular-nums">
                {serving.status === "called" ? "Waiting" : "Serving"} for{" "}
                {Math.floor(waitedSeconds / 60)}:
                {String(waitedSeconds % 60).padStart(2, "0")}
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {serving.status === "called" && (
              <Button
                onClick={() =>
                  runTokenAction(
                    serving,
                    "start",
                    `${serving.token_number} started`,
                  )
                }
                disabled={busyAction !== null}
              >
                <Play />
                Start service
              </Button>
            )}
            {serving.status === "in_service" && (
              <Button
                onClick={() =>
                  runTokenAction(
                    serving,
                    "complete",
                    `${serving.token_number} completed`,
                  )
                }
                disabled={busyAction !== null}
              >
                <CheckCircle2 />
                Complete
              </Button>
            )}
            <Button
              variant="outline"
              disabled={busyAction !== null}
              onClick={() => setDeclineTarget(serving)}
            >
              <Ban />
              Decline
            </Button>
            {serving.status === "called" && (
              <Button
                variant="ghost"
                disabled={busyAction !== null}
                onClick={() =>
                  runTokenAction(
                    serving,
                    "no-show",
                    `${serving.token_number} marked no-show`,
                  )
                }
              >
                No-show
              </Button>
            )}
          </div>
        </section>
      ) : workspace?.queue ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<Clock3 />}
              title="Nobody is being served right now."
              description="Call the next token from the list below when you're ready."
            />
          </CardContent>
        </Card>
      ) : null}

      {/* Up next */}
      <section aria-label="Up next" className="space-y-2">
        <h2 className="text-sm font-semibold tracking-tight">
          Up next{upNext.length > 0 && ` · ${upNext.length} waiting`}
        </h2>
        {upNext.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              The queue is empty. New tokens appear here automatically.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {upNext.slice(0, 10).map((token) => (
              <li key={token.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                    <span className="w-8 shrink-0 text-lg font-semibold tabular-nums text-muted-foreground">
                      {token.position}
                    </span>
                    <span className="font-mono text-base font-semibold tabular-nums">
                      {token.token_number}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {token.customer_name ?? "Walk-in"}
                    </span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {token.customer_phone ?? ""}
                    </span>
                    {token.eta_min != null && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        ~{Math.round(token.eta_min)} min wait
                      </span>
                    )}
                    <Button
                      size="xs"
                      disabled={
                        busyAction !== null || serving?.status === "in_service"
                      }
                      onClick={() =>
                        runTokenAction(
                          token,
                          "call",
                          `${token.token_number} called`,
                        )
                      }
                    >
                      <PhoneCall />
                      Call
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Today */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Served by me"
          value={workspace?.today.served_by_me}
          icon={CheckCircle2}
          loading={loading && !workspace}
        />
        <StatCard
          label="No-shows by me"
          value={workspace?.today.no_shows_by_me}
          icon={Ban}
          loading={loading && !workspace}
        />
        <StatCard
          label="Avg service time"
          value={
            workspace?.today.avg_service_min != null
              ? `${Math.round(workspace.today.avg_service_min)} min`
              : null
          }
          icon={Clock3}
          loading={loading && !workspace}
        />
      </div>

      {/* Decline dialog */}
      <DeclineDialog
        token={declineTarget}
        open={declineTarget !== null}
        busy={busyAction !== null}
        onOpenChange={(next) => {
          if (!next) setDeclineTarget(null);
        }}
        onConfirm={async (reason) => {
          if (!declineTarget) return;
          await runTokenAction(
            declineTarget,
            "decline",
            `${declineTarget.token_number} declined`,
            { reason },
          );
        }}
      />
    </>
  );
}

interface DeclineDialogProps {
  token: Token | null;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  /** Returns the composed success message shown after the API call lands. */
  onConfirm: (reason: string) => Promise<void>;
}

function DeclineDialog({
  token,
  open,
  busy,
  onOpenChange,
  onConfirm,
}: DeclineDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DeclineFormValues>({
    resolver: zodResolver(declineSchema),
    defaultValues: { reason: "" },
  });

  function handleOpenChange(next: boolean) {
    if (!next) reset({ reason: "" });
    onOpenChange(next);
  }

  async function onSubmit(values: DeclineFormValues) {
    await onConfirm(
      values.reason === ""
        ? `${token?.token_number ?? "Token"} declined`
        : `${token?.token_number ?? "Token"} declined — ${values.reason}`,
    );
    reset({ reason: "" });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline {token?.token_number}</DialogTitle>
          <DialogDescription>
            The customer is told their token was closed without service. A
            reason is required.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="decline-reason">Reason</Label>
            <Textarea
              id="decline-reason"
              placeholder="e.g. Missing documents — please visit counter 3 first"
              rows={3}
              aria-invalid={!!errors.reason}
              {...register("reason")}
            />
            {errors.reason && (
              <p className="text-xs text-destructive">
                {errors.reason.message}
              </p>
            )}
          </div>
          <DialogFooter showCloseButton>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy || isSubmitting}
            >
              {isSubmitting ? "Declining…" : "Decline token"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
