"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Printer, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TokenStatusBadge, formatDateTime } from "@/components/ui/status";
import { useTicket } from "@/hooks/use-public";
import type { TokenStatus } from "@/types";

function formatWait(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

export default function TicketPage() {
  const params = useParams<{ number: string }>();
  const searchParams = useSearchParams();
  const institutionId = Number(searchParams.get("institution")) || null;
  const tokenNumber = params?.number ?? null;
  const { ticket, loading, error, reload } = useTicket(institutionId, tokenNumber);

  if (!institutionId || !tokenNumber) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ticket not found</CardTitle>
          <CardDescription>
            This link is missing the institution context. Open your token from the
            institution page or issue a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/join" />}>Get a token</Button>
        </CardContent>
      </Card>
    );
  }

  if (loading && !ticket) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="space-y-4 py-8">
          <Skeleton className="mx-auto h-12 w-40" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !ticket) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>{error ?? "Ticket not found"}</CardTitle>
          <CardDescription>
            Check the token number and institution, or get a new token.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline" onClick={reload}>
            <RefreshCw />
            Retry
          </Button>
          <Button render={<Link href="/join" />}>Get a token</Button>
        </CardContent>
      </Card>
    );
  }

  const active = ticket.position !== null;

  return (
    <>
      <div className="flex items-center justify-between print:hidden">
        <Link href="/join" className="text-sm text-muted-foreground hover:text-foreground">
          ← Get another token
        </Link>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={reload}>
            <RefreshCw />
            Refresh
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer />
            Print / save PDF
          </Button>
        </div>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="items-center border-b pb-6 text-center">
          <CardDescription>Queue ticket</CardDescription>
          <CardTitle className="text-4xl font-semibold tabular-nums">
            {ticket.token_number}
          </CardTitle>
          <CardDescription>{ticket.counter_name}</CardDescription>
          <div className="pt-1">
            <TokenStatusBadge status={ticket.status as TokenStatus} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Position</p>
              <p className="text-xl font-semibold tabular-nums">{active ? ticket.position : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ahead of you</p>
              <p className="text-xl font-semibold tabular-nums">
                {active ? (ticket.people_ahead ?? "—") : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Est. wait</p>
              <p className="text-xl font-semibold">
                {active ? formatWait(ticket.estimated_wait_min) : "—"}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Issued</dt>
            <dd className="text-right font-medium">{formatDateTime(ticket.issued_at)}</dd>
            <dt className="text-muted-foreground">Called</dt>
            <dd className="text-right font-medium">{formatDateTime(ticket.called_at)}</dd>
            <dt className="text-muted-foreground">Completed</dt>
            <dd className="text-right font-medium">{formatDateTime(ticket.completed_at)}</dd>
          </dl>
          <p className="text-xs text-muted-foreground">
            This page updates automatically about every 15 seconds.
            {active ? "" : " Your visit has ended — thank you."}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
