"use client";

import { Activity, CheckCircle2, Clock3, ScanLine, XCircle } from "lucide-react";

import { FunnelTiles } from "@/components/charts/funnel-tiles";
import { HourlyBars } from "@/components/charts/hourly-bars";
import { PageHeader, EmptyState } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { StatusLabel } from "@/components/ui/status-dot";
import type { StatusTone } from "@/components/ui/status-dot";
import { useAdminOverview } from "@/hooks/use-overview";
import { useQueue } from "@/hooks/use-queue";
import { useInstitution } from "@/hooks/use-resources";
import { PriorityReview } from "@/components/tokens/priority-review";
import type { CounterBoardEntry, PresenceEntry } from "@/types";

function presenceTone(entry: PresenceEntry): StatusTone {
  if (entry.serving_token_number) return "busy";
  if (entry.work_status === "available") return "idle";
  if (entry.work_status === "on_break") return "break";
  return "off";
}

function presenceLabel(entry: PresenceEntry): string {
  if (entry.serving_token_number) return `Serving ${entry.serving_token_number}`;
  if (entry.work_status === "available") return "Available";
  if (entry.work_status === "on_break") return "On break";
  return "Off duty";
}

function CounterBoardCard({ entry }: { entry: CounterBoardEntry }) {
  const tone: StatusTone =
    !entry.is_active ? "closed" : entry.status === "serving" ? "busy" : "idle";
  const label = !entry.is_active
    ? "Closed"
    : entry.status === "serving"
      ? "Serving"
      : "Idle";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="min-w-0 truncate text-sm font-medium">
          {entry.counter_name}
          {entry.counter_type && (
            <span className="font-normal text-muted-foreground">
              {" "}
              · {entry.counter_type}
            </span>
          )}
        </CardTitle>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <StatusDot tone={tone} pulse={tone === "busy"} />
          {label}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {entry.current_token_number ? (
          <>
            <p className="text-3xl font-semibold tabular-nums">
              {entry.current_token_number}
            </p>
            <p className="text-xs text-muted-foreground">
              {entry.served_by_name ? `Handled by ${entry.served_by_name}` : "Awaiting service"}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No token being served.</p>
        )}
        <Badge variant={entry.waiting_count > 0 ? "secondary" : "outline"}>
          {entry.waiting_count} waiting
        </Badge>
        {entry.cv_queue_length !== undefined && entry.cv_queue_length !== null && (
          <Badge variant="secondary" className="text-primary border-primary bg-primary/10">
            <span className="relative flex h-1.5 w-1.5 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
            </span>
            CV: {entry.cv_queue_length}
            {entry.cv_service_rate && entry.cv_service_rate > 0 && (
              <span className="ml-1 text-xs">({entry.cv_service_rate.toFixed(1)}/min)</span>
            )}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const { overview, loading, error, reload } = useAdminOverview();
  const { snapshot, reload: reloadQueue, error: queueError } = useQueue();
  const { institution } = useInstitution();
  const hospital = institution?.type?.trim().toLowerCase() === "hospital";

  const funnel = [
    { label: "Issued today", value: overview?.today.issued ?? 0 },
    { label: "Waiting", value: overview?.live.waiting ?? 0, tone: "live" as const },
    { label: "In service", value: overview?.live.in_service ?? 0, tone: "live" as const },
    { label: "Completed today", value: (overview?.today.served ?? 0) + (overview?.today.no_shows ?? 0) + (overview?.today.declined ?? 0), tone: "done" as const },
  ];

  const onDuty = overview?.staff.filter(
    (entry) => entry.work_status !== "off_duty"
  ).length;
  const onBreak = overview?.staff.filter(
    (entry) => entry.work_status === "on_break"
  ).length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live view of counters, staff presence, and today's queue."
      />
      <section aria-label="Waiting queue order" className="grid gap-4 md:grid-cols-2">
        {queueError && <p role="alert" className="text-sm text-destructive">{queueError}</p>}
        {snapshot?.counters.map((queue) => <Card key={queue.counter.id}>
          <CardHeader><CardTitle>{queue.counter.name}: waiting order</CardTitle>
            <CardDescription>{hospital ? "Approved accessibility first, then normal; FIFO within each band. Active service is never interrupted." : "First in, first out. Active service is never interrupted."}</CardDescription></CardHeader>
          <CardContent><ol className="space-y-3">
            {queue.tokens.filter((token) => token.status === "waiting").map((token) => <li key={token.id}>
              <p className="font-mono font-semibold">{token.position}. {token.token_number}</p><PriorityReview token={token} hospital={hospital} onDone={reloadQueue} />
            </li>)}
          </ol>{queue.waiting_count === 0 && <p className="text-sm text-muted-foreground">Nobody waiting.</p>}</CardContent>
        </Card>)}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Waiting now" value={overview?.live.waiting} icon={Clock3} loading={loading && !overview} />
        <StatCard label="In service" value={overview?.live.in_service} icon={Activity} loading={loading && !overview} />
        <StatCard
          label="Served today"
          value={overview?.today.served}
          icon={CheckCircle2}
          hint={
            overview?.today.avg_wait_min != null
              ? `Avg wait ${Math.round(overview.today.avg_wait_min)} min`
              : undefined
          }
          loading={loading && !overview}
        />
        <StatCard label="No-shows today" value={overview?.today.no_shows} icon={XCircle} loading={loading && !overview} />
      </div>

      <FunnelTiles steps={funnel} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Today by hour</CardTitle>
            <CardDescription>Issued versus completed tokens.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && !overview ? (
              <Skeleton className="h-44 w-full" />
            ) : (
              <HourlyBars data={overview?.hourly ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Staff on the floor</CardTitle>
            <CardDescription>
              {overview ? `${onDuty ?? 0} on duty · ${onBreak ?? 0} on break` : "…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && !overview ? (
              <>
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </>
            ) : !overview || overview.staff.length === 0 ? (
              <EmptyState
                title="No staff yet"
                description="Add staff from Management to see presence here."
              />
            ) : (
              overview.staff.map((entry) => (
                <div
                  key={entry.personnel_id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{entry.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[entry.title, entry.counter_id != null ? `Counter #${entry.counter_id}` : null]
                        .filter(Boolean)
                        .join(" · ") || "Unassigned"}
                  </p>
                  </div>
                  <StatusLabel tone={presenceTone(entry)} label={presenceLabel(entry)} pulse={entry.serving_token_number != null} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-label="Counters">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Counters</h2>
          <button
            type="button"
            onClick={() => void reload()}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Refresh
          </button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading && !overview ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : !overview || overview.counters.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-8">
              <ScanLine className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No counters yet — create your first one under Management.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {overview.counters.map((entry) => (
              <CounterBoardCard key={entry.counter_id} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
