"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Clock3, TicketPlus } from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api-client";
import { issueTokenSchema, type IssueTokenFormValues } from "@/lib/validators";
import type { Counter, Token, WaitPrediction } from "@/types";

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

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<IssueTokenFormValues>({
    resolver: zodResolver(issueTokenSchema),
    defaultValues: { counterId: "", customerName: "", customerPhone: "" },
  });

  const counterId = watch("counterId");
  const prediction = predData?.counterId === counterId ? predData.pred : null;
  const activeCounters = counters.filter((counter) => counter.is_active);

  // ML wait estimate for the selected counter — soft-fails silently.
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
    onError?.(null);
    try {
      const token = await api.post<Token>("/tokens", {
        counter_id: Number(values.counterId),
        customer_name: values.customerName || null,
        customer_phone: values.customerPhone || null,
      });
      toast.success(`Token ${token.token_number} issued`);
      reset({ counterId: values.counterId, customerName: "", customerPhone: "" });
      onIssued?.(token);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to issue token";
      onError?.(message);
      toast.error(message);
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
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="issue-counter">Counter</Label>
            <Select
              value={counterId}
              onValueChange={(value) =>
                setValue("counterId", value ?? "", { shouldValidate: true })
              }
            >
              <SelectTrigger className="w-full" aria-invalid={!!errors.counterId}>
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
              placeholder="0311 1234567"
              {...register("customerPhone")}
            />
            {errors.customerPhone && (
              <p className="text-xs text-destructive">{errors.customerPhone.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting || activeCounters.length === 0}>
            {isSubmitting ? "Issuing…" : "Issue token"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
