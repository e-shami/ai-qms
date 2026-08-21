"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Users, XCircle } from "lucide-react";

import { LiveQueueView } from "@/components/queue/live-queue-view";
import { InstitutionCard } from "@/components/layout/institution-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueue } from "@/hooks/use-queue";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";
import type { AnalyticsSummary } from "@/types";

function localDayIso(daysBack: number, endOfDay = false): string {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  date.setHours(0, 0, 0, 0);
  if (endOfDay) date.setTime(date.getTime() + 86400000);
  return date.toISOString();
}

export default function OverviewPage() {
  const { snapshot, loading, connected } = useQueue();
  const user = useAuthStore((state) => state.user);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tzOffsetMinutes = -new Date().getTimezoneOffset();
    api
      .get<AnalyticsSummary>(
        `/analytics/summary?from=${encodeURIComponent(localDayIso(0))}&to=${encodeURIComponent(
          localDayIso(-1, true)
        )}&tz_offset_minutes=${tzOffsetMinutes}`
      )
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        // KPIs stay at zero on failure; live queue still works
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const waiting =
    snapshot?.counters.reduce((sum, c) => sum + c.waiting_count, 0) ?? summary?.waiting_now ?? 0;
  const inService =
    snapshot?.counters.reduce((sum, c) => sum + c.in_service_count, 0) ??
    summary?.in_service_now ??
    0;

  const kpis = [
    { label: "Waiting", value: waiting, icon: Clock3 },
    { label: "In service", value: inService, icon: Users },
    { label: "Served today", value: summary?.served ?? 0, icon: CheckCircle2 },
    { label: "No-shows today", value: summary?.no_shows ?? 0, icon: XCircle },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {user?.full_name ?? "there"} — here&apos;s your queue at a glance.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/live-queue" />}>
            Open live queue
          </Button>
          <Button render={<Link href="/tokens" />}>Issue a token</Button>
        </div>
      </div>

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
              {loading && !snapshot ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-semibold tabular-nums">{kpi.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LiveQueueView compact />
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Personal</CardTitle>
            <CardDescription>
              {connected ? "Real-time connection active." : "Waiting for live updates…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{user?.full_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Role</span>
              <span className="font-medium capitalize">{user?.role}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tokens today</span>
              <span className="font-medium tabular-nums">{summary?.issued ?? "…"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg wait today</span>
              <span className="font-medium">
                {summary?.avg_wait_min == null
                  ? "—"
                  : `${Math.round(summary.avg_wait_min)} min`}
              </span>
            </div>
          </CardContent>
        </Card>
        <InstitutionCard />
      </div>
    </>
  );
}
