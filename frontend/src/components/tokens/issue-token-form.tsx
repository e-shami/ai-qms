"use client";

import { useEffect, useState } from "react";
import { Clock3, TicketPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api-client";
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
  onError?: (message: string) => void;
}) {
  const [counterId, setCounterId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [predData, setPredData] = useState<{ counterId: string; pred: WaitPrediction } | null>(
    null
  );
  // Only show a prediction that belongs to the currently selected counter.
  const prediction = predData?.counterId === counterId ? predData.pred : null;

  // ML wait estimate for the selected counter — soft-fails silently.
  useEffect(() => {
    if (!counterId) return;
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

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!counterId) {
      onError?.("Select a counter first");
      return;
    }
    setBusy(true);
    try {
      const token = await api.post<Token>("/tokens", {
        counter_id: Number(counterId),
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
      });
      setCustomerName("");
      setCustomerPhone("");
      onIssued?.(token);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Failed to issue token");
    } finally {
      setBusy(false);
    }
  }

  const activeCounters = counters.filter((counter) => counter.is_active);

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
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="issue-counter">Counter</Label>
            <Select
              value={counterId}
              onValueChange={(value) => setCounterId(value ?? "")}
            >
              <SelectTrigger className="w-full">
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
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              maxLength={255}
              placeholder="Walk-in customer"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="issue-phone">Customer phone (optional)</Label>
            <Input
              id="issue-phone"
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              maxLength={32}
              placeholder="+251911234567"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy || activeCounters.length === 0}>
            {busy ? "Issuing…" : "Issue token"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
