"use client";

import { useState } from "react";
import { TicketPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api-client";
import type { Counter, Token } from "@/types";

export function IssueTokenForm({
  counters,
  onIssued,
  onError,
  onLoadingChange,
}: {
  counters: Counter[];
  onIssued: (token: Token) => void;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
}) {
  const [counterId, setCounterId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!counterId) {
      onError("Select a counter first");
      return;
    }
    setBusy(true);
    onLoadingChange(true);
    try {
      const token = await api.post<Token>("/tokens", {
        counter_id: Number(counterId),
        customer_name: customerName.trim() || null,
      });
      setCustomerName("");
      onIssued(token);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to issue token");
    } finally {
      setBusy(false);
      onLoadingChange(false);
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
                {counters
                  .filter((counter) => counter.is_active)
                  .map((counter) => (
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="issue-customer">Customer name (optional)</Label>
            <Input
              id="issue-customer"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Walk-in customer"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy || counters.length === 0}>
            {busy ? "Issuing…" : "Issue token"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}