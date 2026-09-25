"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Clock3, TicketPlus } from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api-client";
import { useInstitution } from "@/hooks/use-resources";
import { IntakeFields, emptyIntake, intakePayload } from "./intake-fields";
import { issueTokenSchema } from "@/lib/validators";
import type { Counter, Token, WaitPrediction } from "@/types";

const copySchema = issueTokenSchema.extend({
  customerPhone: z.string().trim().max(32).refine(
    (value) => !value || /^\+[1-9][0-9]{6,14}$/.test(value.replace(/[\s().-]/g, "")),
    "Use full international format, e.g. +923111234567"
  ),
  whatsappCopy: z.boolean(),
}).refine((value) => !value.whatsappCopy || !!value.customerPhone, {
  path: ["customerPhone"], message: "Phone is required for a WhatsApp copy",
});
type IssueTokenFormValues = z.infer<typeof copySchema>;

function formatWait(minutes: number): string {
  if (minutes < 60) return `~${Math.round(minutes)} min`;
  return `~${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

export function IssueTokenForm({
  counters,
  onIssued,
  onError,
}: {
  counters: Counter[];
  onIssued?: (token: Token) => void;
  onError?: (message: string | null) => void;
}) {
  const [predData, setPredData] = useState<{ counterId: string; pred: WaitPrediction } | null>(
    null
  );
  const [copyResult, setCopyResult] = useState<string | null>(null);
  const [intake, setIntake] = useState(emptyIntake);
  const issuing = useRef(false);
  const { institution, error: institutionError } = useInstitution();

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<IssueTokenFormValues>({
    resolver: zodResolver(copySchema),
    defaultValues: { counterId: "", customerName: "", customerPhone: "", whatsappCopy: false },
  });

  const counterId = useWatch({ control, name: "counterId" });
  const prediction = predData?.counterId === counterId ? predData.pred : null;
  const activeCounters = counters.filter((counter) => counter.is_active);

  // Live empirical/heuristic estimate; shadow ML is not shown to customers.
  useEffect(() => {
    if (!counterId || !/^\d+$/.test(counterId)) return;
    let cancelled = false;
    api
      .get<WaitPrediction>(`/predictions/wait?counter_id=${counterId}`)
      .then((pred) => {
        if (!cancelled) setPredData({ counterId, pred });
      })
      .catch(() => {
        // prediction is advisory; ignore failures
      });
    return () => {
      cancelled = true;
    };
  }, [counterId]);

  async function onSubmit(values: IssueTokenFormValues) {
    if (issuing.current) return;
    issuing.current = true;
    onError?.(null);
    try {
      if (!activeCounters.some((counter) => counter.id === Number(values.counterId))) {
        throw new Error("Select an active counter");
      }
      const token = await api.post<Token & { notification?: { status: string } }>("/tokens", {
        ...intakePayload(intake, false, institution?.type?.trim().toLowerCase() === "hospital"),
        counter_id: Number(values.counterId),
        customer_name: values.customerName || null,
        customer_phone: values.customerPhone || null,
        whatsapp_copy: values.whatsappCopy,
      });
      toast.success(`Token ${token.token_number} issued`);
      setCopyResult(!values.whatsappCopy ? null : token.notification?.status === "accepted"
        ? `Token ${token.token_number} issued. WhatsApp accepted the copy; delivery is not confirmed.`
        : `Token ${token.token_number} issued. WhatsApp copy ${!token.notification || token.notification.status === "unknown" ? "status is unknown" : "was not sent"}. Keep the ticket; do not issue another token to retry delivery.`);
      reset({ counterId: values.counterId, customerName: "", customerPhone: "", whatsappCopy: false });
      onIssued?.(token);
      setIntake(emptyIntake);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to issue token";
      onError?.(message);
      toast.error(message);
    } finally {
      issuing.current = false;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TicketPlus className="size-4" />
          Issue token
        </CardTitle>
        <CardDescription>
          Add a customer to the queue at a counter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="space-y-4">
          {institutionError && <p role="alert" className="text-sm text-destructive">{institutionError}</p>}
          <fieldset disabled={isSubmitting}>
            <IntakeFields value={intake} onChange={setIntake} required={false} hospital={institution?.type?.trim().toLowerCase() === "hospital"} institutionName={institution?.name ?? "This institution"} />
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="issue-counter">Counter</Label>
            <Select
              value={counterId}
              onValueChange={(value) =>
                setValue("counterId", value ?? "", { shouldValidate: true })
              }
            >
              <SelectTrigger id="issue-counter" className="w-full" aria-invalid={!!errors.counterId}>
                <SelectValue placeholder="Select a counter" />
              </SelectTrigger>
              <SelectContent>
                {activeCounters.map((counter) => (
                  <SelectItem
                    key={counter.id}
                    value={String(counter.id)}
                    label={counter.name}
                  >
                    {counter.name}
                    {counter.type ? ` · ${counter.type}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.counterId && (
              <p className="text-xs text-destructive">{errors.counterId.message}</p>
            )}
            {counterId && prediction && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock3 className="size-3.5" />
                Estimated wait:{" "}
                <span className="font-medium text-foreground">
                  {formatWait(prediction.estimated_wait_min)}
                </span>{" "}
                · {prediction.queue_ahead} in queue
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="issue-customer">Customer name (optional)</Label>
            <Input
              id="issue-customer"
              aria-invalid={!!errors.customerName}
              placeholder="Walk-in customer"
              {...register("customerName")}
            />
            {errors.customerName && (
              <p className="text-xs text-destructive">{errors.customerName.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="issue-phone">Customer phone (optional)</Label>
            <Input
              id="issue-phone"
              type="tel"
              aria-invalid={!!errors.customerPhone}
              aria-describedby={errors.customerPhone ? "issue-phone-error" : undefined}
              placeholder="+923111234567"
              {...register("customerPhone")}
            />
            {errors.customerPhone && (
              <p id="issue-phone-error" className="text-xs text-destructive">{errors.customerPhone.message}</p>
            )}
          </div>
          <div className="flex items-start gap-2">
            <input id="issue-whatsapp-copy" type="checkbox" aria-describedby="issue-copy-hint" className="mt-1" {...register("whatsappCopy")} />
            <Label htmlFor="issue-whatsapp-copy">
              I confirm the customer explicitly requested one WhatsApp token copy at this number.
            </Label>
          </div>
          <p id="issue-copy-hint" className="text-xs text-muted-foreground">Optional. Providing a phone alone does not request messaging. Delivery may fail.</p>
          {copyResult && <p role="status" className="text-sm">{copyResult}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting || activeCounters.length === 0}>
            {isSubmitting ? "Issuing…" : "Issue token"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
