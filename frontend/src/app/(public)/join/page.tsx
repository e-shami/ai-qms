"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, MessageCircle, Printer, Search, Ticket } from "lucide-react";
import toast from "react-hot-toast";

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
import { IntakeFields, emptyIntake, intakePayload } from "@/components/tokens/intake-fields";
import { PublicPriority } from "@/components/tokens/public-priority";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/ui/status";
import {
  issuePublicToken,
  usePublicCounters,
  usePublicInstitutions,
} from "@/hooks/use-public";
import { joinDetailsSchema } from "@/lib/validators";
import type { PublicInstitution, PublicTicket } from "@/types";

const copySchema = joinDetailsSchema.extend({
  customerPhone: z.string().trim().max(32).refine(
    (value) => !value || /^\+[1-9][0-9]{6,14}$/.test(value.replace(/[\s().-]/g, "")),
    "Use full international format, e.g. +923111234567"
  ),
  whatsappCopy: z.boolean(),
}).refine((value) => !value.whatsappCopy || !!value.customerPhone, {
  path: ["customerPhone"], message: "Phone is required for a WhatsApp copy",
});
type JoinDetailsFormValues = z.infer<typeof copySchema>;
type CopyTicket = PublicTicket & { notification?: { status: string; action_url?: string | null } };

function formatWait(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

function whatsappLink(number: string | null, institution: string, counter: string): string | null {
  if (!number) return null;
  const normalized = number.replace(/[\s().-]/g, "");
  if (!/^\+[1-9][0-9]{6,14}$/.test(normalized)) return null;
  const intl = normalized.slice(1);
  const text = encodeURIComponent(
    `Hello ${institution}! I would like a token for ${counter}.`
  );
  return `https://wa.me/${intl}?text=${text}`;
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
  const [issued, setIssued] = useState<CopyTicket | null>(null);
  const [intake, setIntake] = useState(emptyIntake);
  const issuing = useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<JoinDetailsFormValues>({
    resolver: zodResolver(copySchema),
    defaultValues: { customerName: "", customerPhone: "", whatsappCopy: false },
  });

  const filtered = (institutions ?? []).filter((institution) =>
    institution.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const selectedCounter = counters?.find((counter) => counter.id === counterId) ?? null;

  async function onSubmit(values: JoinDetailsFormValues) {
    if (issuing.current) return;
    if (!selectedInstitution || !selectedCounter) {
      toast.error("Select a service first");
      return;
    }
    issuing.current = true;
    try {
      const payload = {
        ...intakePayload(intake, true, selectedInstitution.type?.trim().toLowerCase() === "hospital"),
        institution_id: selectedInstitution.id,
        counter_id: selectedCounter.id,
        customer_name: values.customerName || null,
        customer_phone: values.customerPhone || null,
        whatsapp_copy: values.whatsappCopy,
      };
      const ticket = await issuePublicToken(payload);
      toast.success(`Token ${ticket.token_number} issued`);
      setIssued(ticket);
      setIntake(emptyIntake);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not issue a token";
      toast.error(message);
    } finally {
      issuing.current = false;
    }
  }

  function startOver() {
    setIssued(null);
    setIntake(emptyIntake);
    setCounterId(null);
    setSelectedInstitution(null);
    reset({ customerName: "", customerPhone: "", whatsappCopy: false });
  }

  if (issued && selectedInstitution) {
    const actionUrl = issued.notification?.action_url;
    const waLink = issued.notification?.status === "action_required" && actionUrl &&
      /^https:\/\/wa\.me\/[1-9][0-9]{6,14}\?text=status$/.test(actionUrl) ? actionUrl : null;
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
            <PublicPriority ticket={issued} />
            {waLink && (
              <div className="space-y-2">
                <p role="status" className="text-sm">No copy has been sent. Open WhatsApp and send status from the number you entered to retrieve your active ticket. If several tickets appear, select this one.</p>
                <Button className="w-full" render={<a href={waLink} target="_blank" rel="noopener noreferrer" />}>
                  <MessageCircle />
                  Request my WhatsApp copy
                </Button>
              </div>
            )}
            {issued.notification?.status === "unavailable" && (
              <p role="status" className="text-sm">Your token is issued, but WhatsApp copies are unavailable. Keep this ticket; do not create another token for delivery.</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" render={<Link href={ticketUrl} />}>
                <Printer />
                View / print ticket
              </Button>
              <Button variant="ghost" className="flex-1" onClick={startOver}>
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
        <Button size="icon-sm" variant="outline" disabled={isSubmitting} onClick={startOver} aria-label="Back to institutions">
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
                  disabled={isSubmitting}
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

      {selectedCounter !== null && (
        <Card>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
            <CardDescription>
              A name helps staff address you. Providing a phone alone does not request messaging.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4">
              <fieldset disabled={isSubmitting}>
                <IntakeFields value={intake} onChange={setIntake} required hospital={selectedInstitution.type?.trim().toLowerCase() === "hospital"} institutionName={selectedInstitution.name} />
              </fieldset>
              <div className="space-y-2">
                <Label htmlFor="join-name">Name</Label>
                <Input
                  id="join-name"
                  placeholder="e.g. Sarah Ahmed"
                  aria-invalid={!!errors.customerName}
                  {...register("customerName")}
                />
                {errors.customerName && (
                  <p className="text-xs text-destructive">{errors.customerName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="join-phone">Phone (WhatsApp)</Label>
                <Input
                  id="join-phone"
                  type="tel"
                  placeholder="+923111234567"
                  aria-invalid={!!errors.customerPhone}
                  aria-describedby={errors.customerPhone ? "join-phone-error" : undefined}
                  {...register("customerPhone")}
                />
                {errors.customerPhone && (
                  <p id="join-phone-error" className="text-xs text-destructive">{errors.customerPhone.message}</p>
                )}
              </div>
              <div className="flex items-start gap-2">
                <input id="join-whatsapp-copy" type="checkbox" aria-describedby="join-copy-hint" className="mt-1" {...register("whatsappCopy")} />
                <Label htmlFor="join-whatsapp-copy">I want a WhatsApp copy of my token at this number.</Label>
              </div>
              <p id="join-copy-hint" className="text-xs text-muted-foreground">Optional. After issuance, open WhatsApp and send the prefilled status message from this number. This does not issue a second token or subscribe you to updates.</p>
              {waEarlyLink && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MessageCircle className="size-3.5" />
                  Prefer chat?{" "}
                  <a href={waEarlyLink} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                    Continue on WhatsApp
                  </a>
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Issuing…" : `Get token for ${selectedCounter?.name ?? ""}`}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </>
  );
}
