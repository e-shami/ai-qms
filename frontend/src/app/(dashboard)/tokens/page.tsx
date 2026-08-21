"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { IssueTokenForm } from "@/components/tokens/issue-token-form";
import { TokenActions } from "@/components/tokens/token-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  formatDateTime,
  Panel,
  TokenStatusBadge,
  TOKEN_STATUS_LABELS,
} from "@/components/ui/status";
import { useCounters, useTokens } from "@/hooks/use-resources";
import type { TokenStatus } from "@/types";

const STATUS_FILTERS: Array<{ value: TokenStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  ...Object.entries(TOKEN_STATUS_LABELS).map(([value, label]) => ({
    value: value as TokenStatus,
    label,
  })),
];

const PAGE_SIZE = 50;

/** Local-day ISO boundary for a yyyy-mm-dd input (timezone-correct). */
function dayBoundary(value: string, endOfDay: boolean = false): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  const target = endOfDay ? new Date(date.getTime() + 86400000) : date;
  return target.toISOString();
}

export default function TokensPage() {
  const { counters } = useCounters();
  const [counterFilter, setCounterFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<TokenStatus | "all">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);
  const { tokens, total, loading, error, reload } = useTokens({
    counterId: counterFilter === "all" ? undefined : Number(counterFilter),
    status: statusFilter === "all" ? undefined : statusFilter,
    issuedFrom: dayBoundary(fromDate),
    issuedTo: dayBoundary(toDate, true),
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const [formError, setFormError] = useState<string | null>(null);

  const counterName = (counterId: number) =>
    counters?.find((c) => c.id === counterId)?.name ?? `Counter #${counterId}`;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetPage() {
    setPage(0);
  }

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tokens</h1>
        <p className="text-sm text-muted-foreground">
          Issue tokens and review token history for your institution.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <IssueTokenForm
            counters={counters ?? []}
            onIssued={() => reload()}
            onError={setFormError}
          />
          {formError && (
            <div className="mt-3">
              <Alert variant="destructive">{formError}</Alert>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <Panel
            title="Token history"
            action={
              <span className="text-xs text-muted-foreground tabular-nums">
                {total} token{total === 1 ? "" : "s"}
              </span>
            }
          >
            <div className="mb-3 flex flex-wrap items-end gap-2">
              <Select
                value={counterFilter}
                onValueChange={(value) => {
                  setCounterFilter(value ?? "all");
                  resetPage();
                }}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="All counters" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" label="All counters">
                    All counters
                  </SelectItem>
                  {(counters ?? []).map((counter) => (
                    <SelectItem
                      key={counter.id}
                      value={String(counter.id)}
                      label={counter.name}
                    >
                      {counter.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as TokenStatus | "all");
                  resetPage();
                }}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((filter) => (
                    <SelectItem
                      key={filter.value}
                      value={filter.value}
                      label={filter.label}
                    >
                      {filter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div>
                <Label htmlFor="tokens-from" className="sr-only">
                  From
                </Label>
                <Input
                  id="tokens-from"
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    resetPage();
                  }}
                />
              </div>
              <div>
                <Label htmlFor="tokens-to" className="sr-only">
                  To
                </Label>
                <Input
                  id="tokens-to"
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    resetPage();
                  }}
                />
              </div>
            </div>

            {error && <Alert variant="destructive">{error}</Alert>}
            {loading && !tokens ? (
              <div className="space-y-3">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : !tokens || tokens.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No tokens match these filters.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="hidden lg:table-cell">Phone</TableHead>
                      <TableHead>Counter</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Issued</TableHead>
                      <TableHead className="hidden md:table-cell">Called</TableHead>
                      <TableHead className="hidden md:table-cell">Completed</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokens.map((token) => (
                      <TableRow key={token.id}>
                        <TableCell className="font-semibold">{token.token_number}</TableCell>
                        <TableCell>{token.customer_name ?? "Walk-in"}</TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {token.customer_phone ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {counterName(token.counter_id)}
                        </TableCell>
                        <TableCell>
                          <TokenStatusBadge status={token.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDateTime(token.issued_at)}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {formatDateTime(token.called_at)}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {formatDateTime(token.completed_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <TokenActions token={token} onDone={reload} onError={setFormError} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {totalPages > 1 && (
                  <div className="mt-3 flex items-center justify-between">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page === 0 || loading}
                      onClick={() => setPage((current) => Math.max(0, current - 1))}
                    >
                      <ChevronLeft />
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages - 1 || loading}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Next
                      <ChevronRight />
                    </Button>
                  </div>
                )}
              </>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
