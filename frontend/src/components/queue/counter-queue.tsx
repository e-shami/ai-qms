"use client";

import { useState } from "react";

import { TokenActions } from "@/components/tokens/token-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Panel, formatClock, TokenStatusBadge } from "@/components/ui/status";
import type { CounterQueueStatus } from "@/types";

export function CounterQueue({
  status,
  onChanged,
}: {
  status: CounterQueueStatus;
  onChanged?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <Panel
      title={`${status.counter.name}${status.counter.type ? ` — ${status.counter.type}` : ""}`}
      action={
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{status.waiting_count} waiting</Badge>
          <Badge variant="outline">{status.in_service_count} in service</Badge>
        </div>
      }
    >
      {error && <Alert variant="destructive">{error}</Alert>}
      {status.tokens.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No active tokens at this counter.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Issued</TableHead>
              <TableHead className="hidden md:table-cell">Called</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {status.tokens.map((token) => (
              <TableRow key={token.id}>
                <TableCell className="font-medium">{token.position}</TableCell>
                <TableCell className="font-semibold">{token.token_number}</TableCell>
                <TableCell>{token.customer_name ?? "Walk-in"}</TableCell>
                <TableCell>
                  <TokenStatusBadge status={token.status} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {formatClock(token.issued_at)}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {formatClock(token.called_at)}
                </TableCell>
                <TableCell className="text-right">
                  <TokenActions token={token} onDone={onChanged} onError={setError} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}