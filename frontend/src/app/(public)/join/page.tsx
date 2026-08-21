"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, MessageCircle, Printer, Search, Ticket } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/ui/status";
import {
  issuePublicToken,
  usePublicCounters,
  usePublicInstitutions,
} from "@/hooks/use-public";
import type { PublicInstitution, PublicTicket } from "@/types";

function formatWait(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

function whatsappLink(number: string | null, institution: string, counter: string): string | null {
  if (!number) return null;
  const digits = number.replace(/[^\d]/g, "");
  if (!digits) return null;
  const text = encodeURIComponent(
    `Hello ${institution}! I would like a token for ${counter}.`
  );
  return `https://wa.me/${digits}?text=${text}`;
}

export default function JoinPage() {
  const { institutions, loading: institutionsLoading, error: institutionsError } =
    usePublicInstitutions();
  const [selectedInstitution, setSelectedInstitution] = useState<PublicInstitution | null>(null);
  const [search, setSearch] = useState("");
  const { counters, loading: countersLoading, error: countersError } = usePublicCounters(
    selectedInstitution?.id ?? null
  );
  const [counterId, setCounterId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issued, setIssued] = useState<PublicTicket | null>(null);

  const filtered = (institutions ?? []).filter((institution) =>
    institution.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const selectedCounter = counters?.find((counter) => counter.id === counterId) ?? null;

  async function submit() {
    if (!selectedInstitution || !counterId) return;
    setBusy(true);
    setIssueError(null);
    try {
      const ticket = await issuePublicToken({
        institution_id: selectedInstitution.id,
        counter_id: counterId,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
      });
      setIssued(ticket);
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : "Could not issue a token");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setIssued(null);
    setCounterId(null);
    setCustomerName("");
    setCustomerPhone("");
    setIssueError(null);
  }

  if (issued && selectedInstitution) {
    const waLink = whatsappLink(
      selectedInstitution.whatsapp_number ?? null,
      selectedInstitution.name,
      issued.counter_name
    );
    const ticketUrl = `/token/${encodeURIComponent(issued.token_number)}?institution=${selectedInstitution.id}`;
    return (
      <>
        <Card className="mx-auto w-full max-w-md text-center">
          <CardHeader className="items-center">
            <Ticket className="size-10 text-primary" />
            <CardTitle className="mt-2 text-2xl">Your token</CardTitle>
            <CardDescription>{selectedInstitution.name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-5xl font-semibold tracking-tight tabular-nums">
              {issued.token_number}
            </p>
            <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Position</p>
                <p className="font-semibold tabular-nums">{issued.position ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ahead of you</p>
                <p className="font-semibold tabular-nums">{issued.people_ahead ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Est. wait</p>
                <p className="font-semibold">{formatWait(issued.estimated_wait_min)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Counter: {issued.counter_name} · keep this page link or take a screenshot.
            </p>
            {waLink && (
              <Button className="w-full" render={<a href={waLink} target="_blank" rel="noopener noreferrer" />}>
                <MessageCircle />
                Get updates on WhatsApp
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" render={<Link href={ticketUrl} />}>
                <Printer />
                View / print ticket
              </Button>
              <Button variant="ghost" className="flex-1" onClick={reset}>
                New token
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  if (!selectedInstitution) {
    return (
      <>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Get a token</h1>
          <p className="text-sm text-muted-foreground">
            Choose your institution to see available services.
          </p>
        </div>
        {institutionsError && <Alert variant="destructive">{institutionsError}</Alert>}
        <Panel title="Institutions">
          <div className="relative mb-3">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="pl-8"
              aria-label="Search institutions"
            />
          </div>
          {institutionsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No institutions found{search ? " for that search." : " yet."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((institution) => (
                <li key={institution.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedInstitution(institution)}
                    className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted"
                  >
                    <span>
                      <span className="block font-medium">{institution.name}</span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {institution.type ?? "Service provider"}
                      </span>
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </>
    );
  }

  const waEarlyLink = whatsappLink(
    selectedInstitution.whatsapp_number ?? null,
    selectedInstitution.name,
    selectedCounter?.name ?? "your service"
  );

  return (
    <>
      <div className="flex items-center gap-3">
        <Button size="icon-sm" variant="outline" onClick={() => setSelectedInstitution(null)} aria-label="Back to institutions">
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{selectedInstitution.name}</h1>
          <p className="text-sm capitalize text-muted-foreground">
            {selectedInstitution.type ?? "Choose a service"}
          </p>
        </div>
      </div>

      {countersError && <Alert variant="destructive">{countersError}</Alert>}

      <Panel title="Choose a service">
        {countersLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : !counters || counters.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No active services at this institution right now.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {counters.map((counter) => (
              <li key={counter.id}>
                <button
                  type="button"
                  onClick={() => setCounterId(counter.id)}
                  aria-pressed={counterId === counter.id}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted ${
                    counterId === counter.id ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <span>
                    <span className="block font-medium">{counter.name}</span>
                    {counter.type && (
                      <span className="text-xs text-muted-foreground capitalize">
                        {counter.type}
                      </span>
                    )}
                  </span>
                  {counterId === counter.id && (
                    <span className="text-xs font-medium text-primary">Selected</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {counterId !== null && (
        <Card>
          <CardHeader>
            <CardTitle>Your details (optional)</CardTitle>
            <CardDescription>
              A name helps staff address you; a phone enables WhatsApp updates where supported.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="join-name">Name</Label>
              <Input
                id="join-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Sarah Ahmed"
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="join-phone">Phone (WhatsApp)</Label>
              <Input
                id="join-phone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+251911234567"
                maxLength={32}
              />
            </div>
            {issueError && <Alert variant="destructive">{issueError}</Alert>}
            {waEarlyLink && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MessageCircle className="size-3.5" />
                Prefer chat?{" "}
                <a href={waEarlyLink} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  Continue on WhatsApp
                </a>
              </p>
            )}
            <Button className="w-full" onClick={submit} disabled={busy}>
              {busy ? "Issuing…" : `Get token for ${selectedCounter?.name ?? ""}`}
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}
