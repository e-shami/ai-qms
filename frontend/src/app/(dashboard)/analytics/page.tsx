"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Hourglass, TicketCheck, TrendingUp, UserX } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/ui/status";
import { api } from "@/lib/api-client";
import { downloadCsv, toCsv } from "@/lib/csv";
import type { AnalyticsSummary, TokenStatus } from "@/types";

const STATUS_LABELS: Record<TokenStatus | string, string> = {
  waiting: "Waiting",
  called: "Called",
  in_service: "In service",
  served: "Served",
  no_show: "No-show",
};

type Preset = "today" | "7d" | "30d";

/** Local midnight ISO boundary N days back (0 = today). */
function localDayIso(daysBack: number, endOfDay = false): string {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  date.setHours(0, 0, 0, 0);
  if (endOfDay) date.setTime(date.getTime() + 86400000);
  return date.toISOString();
}

function dayInputToIso(value: string, endOfDay = false): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay) date.setTime(date.getTime() + 86400000);
  return date.toISOString();
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
  const [preset, setPreset] = useState<Preset>("today");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");

  // Custom dates take over once either input is set.
  const customFrom = dayInputToIso(fromInput);
  const customTo = dayInputToIso(toInput, true);
  const range = useMemo(() => {
    if (customFrom || customTo) {
      return {
        from: customFrom ?? localDayIso(365),
        to: customTo ?? new Date().toISOString(),
      };
    }
    if (preset === "today") return { from: localDayIso(0), to: localDayIso(-1, true) };
    if (preset === "7d") return { from: localDayIso(6), to: localDayIso(-1, true) };
    return { from: localDayIso(29), to: localDayIso(-1, true) };
  }, [preset, customFrom, customTo]);

  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const summaryPath = `/analytics/summary?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(
    range.to
  )}&tz_offset_minutes=${tzOffsetMinutes}`;

  const [summaryData, setSummaryData] = useState<{ path: string; summary: AnalyticsSummary } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  // Derived loading: shown data isn't for the current range query.
  const summary = summaryData?.path === summaryPath ? summaryData.summary : null;
  const loading = summary === null && error === null;

  useEffect(() => {
    let cancelled = false;
    api
      .get<AnalyticsSummary>(summaryPath)
      .then((data) => {
        if (cancelled) return;
        setSummaryData({ path: summaryPath, summary: data });
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Request failed");
      });
    return () => {
      cancelled = true;
    };
  }, [summaryPath]);

  async function exportCsv() {
    try {
      const params = new URLSearchParams({
        issued_from: range.from,
        issued_to: range.to,
        limit: "500",
      });
      let offset = 0;
      let total = Infinity;
      const rows: Array<Array<unknown>> = [];
      while (offset < total && offset < 20000) {
        const page = await api.get<{ items: Array<{
          token_number: string;
          customer_name: string | null;
          customer_phone: string | null;
          status: TokenStatus;
          issued_at: string;
          called_at: string | null;
          completed_at: string | null;
          counter_id: number;
        }>; total: number }>(`/tokens?${params.toString()}&offset=${offset}`);
        total = page.total;
        for (const token of page.items) {
          rows.push([
            token.token_number,
            token.customer_name ?? "",
            token.customer_phone ?? "",
            STATUS_LABELS[token.status] ?? token.status,
            token.issued_at,
            token.called_at ?? "",
            token.completed_at ?? "",
            token.counter_id,
          ]);
        }
        offset += 500;
        if (page.items.length === 0) break;
      }
      downloadCsv(
        `aiqms-tokens-${new Date().toISOString().slice(0, 10)}.csv`,
        toCsv(
          ["token", "customer", "phone", "status", "issued_at", "called_at", "completed_at", "counter_id"],
          rows
        )
      );
    } catch {
      // export is best-effort; surface nothing beyond a silent no-op is bad,
      // so re-use the error banner via state
      setError("CSV export failed — check your connection and try again.");
    }
  }

  const kpis = [
    { label: "Tokens issued", value: summary?.issued, icon: TrendingUp },
    { label: "Served", value: summary?.served, icon: TicketCheck },
    { label: "Avg wait to call", value: formatMinutes(summary?.avg_wait_min ?? null), icon: Hourglass },
    {
      label: "Abandonment",
      value:
        summary?.abandonment_rate == null ? "—" : `${Math.round(summary.abandonment_rate * 100)}%`,
      icon: UserX,
    },
  ];

  const hourEntries = (summary?.hourly ?? []).filter((entry) => entry.count > 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            KPIs computed server-side for the selected period.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={loading}>
          <Download />
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {(["today", "7d", "30d"] as Preset[]).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={preset === key && !fromInput && !toInput ? "default" : "outline"}
            onClick={() => {
              setPreset(key);
              setFromInput("");
              setToInput("");
            }}
          >
            {key === "today" ? "Today" : key === "7d" ? "Last 7 days" : "Last 30 days"}
          </Button>
        ))}
        <div>
          <Label htmlFor="analytics-from" className="sr-only">
            From
          </Label>
          <Input
            id="analytics-from"
            type="date"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="analytics-to" className="sr-only">
            To
          </Label>
          <Input
            id="analytics-to"
            type="date"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
          />
        </div>
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
              {loading && !summary ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-semibold tabular-nums">{kpi.value ?? "—"}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Tokens by hour of day">
          {loading && !summary ? (
            <Skeleton className="h-24" />
          ) : hourEntries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No tokens in this period yet.
            </p>
          ) : (
            <>
              <HourBars counts={hourEntries} />
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="size-3.5" />
                Peak hour:{" "}
                {summary?.peak_hour != null
                  ? `${summary.peak_hour}:00 (${summary.hourly[summary.peak_hour].count} tokens)`
                  : "No activity."}
                {summary?.avg_total_min != null &&
                  ` · Avg issue→completion ${formatMinutes(summary.avg_total_min)}`}
              </p>
            </>
          )}
        </Panel>

        <Panel title="By counter">
          {!summary || loading ? (
            <div className="space-y-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : summary.per_counter.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No tokens in this period yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Counter</th>
                  <th className="pb-2 text-right font-medium">Issued</th>
                  <th className="pb-2 text-right font-medium">Served</th>
                  <th className="pb-2 text-right font-medium">No-shows</th>
                  <th className="pb-2 text-right font-medium">Waiting</th>
                  <th className="pb-2 text-right font-medium">Avg wait</th>
                </tr>
              </thead>
              <tbody>
                {summary.per_counter.map((counter) => (
                  <tr key={counter.counter_id} className="border-b last:border-0">
                    <td className="py-2">{counter.counter_name}</td>
                    <td className="py-2 text-right tabular-nums">{counter.issued}</td>
                    <td className="py-2 text-right tabular-nums">{counter.served}</td>
                    <td className="py-2 text-right tabular-nums">{counter.no_shows}</td>
                    <td className="py-2 text-right tabular-nums">{counter.waiting}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatMinutes(counter.avg_wait_min)}
                    </td>
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
