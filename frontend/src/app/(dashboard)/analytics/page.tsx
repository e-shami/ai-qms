"use client";

import { useMemo } from "react";
import { BarChart3, Hourglass, TicketCheck, TrendingUp, UserX } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/ui/status";
import { useCounters, useTokens } from "@/hooks/use-resources";

function isToday(value: string | null | undefined): boolean {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function minutesBetween(start: string, end: string): number {
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

function avgMinutes(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function formatMinutes(value: number | null): string {
  if (value === null) return "—";
  if (value < 60) return `${Math.round(value)} min`;
  return `${Math.floor(value / 60)}h ${Math.round(value % 60)}m`;
}

function HourBars({ counts }: { counts: Array<{ hour: number; count: number }> }) {
  const max = Math.max(1, ...counts.map((entry) => entry.count));
  return (
    <div className="flex items-end gap-1">
      {counts.map((entry) => (
        <div
          key={entry.hour}
          className="group flex flex-1 flex-col items-center gap-1"
          title={`${entry.hour}:00 — ${entry.count} token${entry.count === 1 ? "" : "s"}`}
        >
          <div
            className="w-full rounded-t-sm bg-primary/70 transition-colors group-hover:bg-primary"
            style={{ height: `${Math.max(4, (entry.count / max) * 96)}px` }}
          />
          <span className="text-[10px] text-muted-foreground">{entry.hour}:00</span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const { tokens, loading, error } = useTokens();
  const { counters } = useCounters();

  const stats = useMemo(() => {
    const all = tokens ?? [];
    const today = all.filter((token) => isToday(token.issued_at));
    const served = today.filter((token) => token.status === "served");
    const noShows = today.filter((token) => token.status === "no_show");
    const resolved = served.length + noShows.length;

    const waitTimes = served
      .filter((token) => token.called_at)
      .map((token) => minutesBetween(token.issued_at, token.called_at as string));
    const totalTimes = served
      .filter((token) => token.completed_at)
      .map((token) => minutesBetween(token.issued_at, token.completed_at as string));

    const byHour = new Array(24).fill(0) as number[];
    for (const token of today) {
      const hour = new Date(token.issued_at).getHours();
      byHour[hour] += 1;
    }
    const hourEntries = byHour
      .map((count, hour) => ({ hour, count }))
      .filter((entry) => entry.count > 0);
    const peakHour = hourEntries.reduce<{ hour: number; count: number } | null>(
      (best, entry) => (best === null || entry.count > best.count ? entry : best),
      null
    );

    const perCounter = new Map<number, { issued: number; served: number; waiting: number }>();
    for (const token of today) {
      const entry = perCounter.get(token.counter_id) ?? { issued: 0, served: 0, waiting: 0 };
      entry.issued += 1;
      if (token.status === "served") entry.served += 1;
      if (token.status === "waiting") entry.waiting += 1;
      perCounter.set(token.counter_id, entry);
    }

    return {
      all: all.length,
      today: today.length,
      served: served.length,
      noShows: noShows.length,
      abandonmentRate: resolved > 0 ? noShows.length / resolved : null,
      avgWait: avgMinutes(waitTimes),
      avgTotal: avgMinutes(totalTimes),
      hourEntries,
      peakHour,
      perCounter,
    };
  }, [tokens]);

  const kpis = [
    {
      label: "Tokens today",
      value: loading ? null : stats.today,
      icon: BarChart3,
    },
    {
      label: "Served today",
      value: loading ? null : stats.served,
      icon: TicketCheck,
    },
    {
      label: "Avg wait to call",
      value: loading ? null : formatMinutes(stats.avgWait),
      icon: Hourglass,
    },
    {
      label: "Abandonment rate",
      value: loading
        ? null
        : stats.abandonmentRate === null
          ? "—"
          : `${Math.round(stats.abandonmentRate * 100)}%`,
      icon: UserX,
    },
  ];

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          KPIs computed from today&apos;s token activity and history (newest-first list).
        </p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.label}
              </CardTitle>
              <kpi.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {kpi.value === null ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-semibold tabular-nums">{kpi.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Tokens issued today, by hour">
          {stats.hourEntries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No tokens issued today yet.
            </p>
          ) : (
            <>
              <HourBars counts={stats.hourEntries} />
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="size-3.5" />
                {stats.peakHour
                  ? `Peak hour: ${stats.peakHour.hour}:00 (${stats.peakHour.count} tokens)`
                  : "No activity yet."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Avg time issued → completed: {formatMinutes(stats.avgTotal)} ·{" "}
                {stats.today} tokens today, {stats.all} all time
              </p>
            </>
          )}
        </Panel>

        <Panel title="Today by counter">
          {stats.perCounter.size === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No tokens issued today yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Counter</th>
                  <th className="pb-2 text-right font-medium">Issued</th>
                  <th className="pb-2 text-right font-medium">Served</th>
                  <th className="pb-2 text-right font-medium">Waiting</th>
                </tr>
              </thead>
              <tbody>
                {[...stats.perCounter.entries()].map(([counterId, entry]) => (
                  <tr key={counterId} className="border-b last:border-0">
                    <td className="py-2">
                      {counters?.find((c) => c.id === counterId)?.name ??
                        `Counter #${counterId}`}
                    </td>
                    <td className="py-2 text-right tabular-nums">{entry.issued}</td>
                    <td className="py-2 text-right tabular-nums">{entry.served}</td>
                    <td className="py-2 text-right tabular-nums">{entry.waiting}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}