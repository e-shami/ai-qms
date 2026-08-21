"use client";

import { useCallback, useState } from "react";

import { IssueTokenForm } from "@/components/tokens/issue-token-form";
import { TokenActions } from "@/components/tokens/token-actions";
import { Alert } from "@/components/ui/alert";
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

export default function TokensPage() {
  const { counters } = useCounters();
  const [counterFilter, setCounterFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<TokenStatus | "all">("all");
  const { tokens, loading, error, reload } = useTokens(
    counterFilter === "all" ? undefined : Number(counterFilter),
    statusFilter === "all" ? undefined : statusFilter
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);

  const reloadSoon = useCallback(() => {
    setTimeout(() => reload(), 400);
  }, [reload]);

  const counterName = (counterId: number) =>
    counters?.find((c) => c.id === counterId)?.name ?? `Counter #${counterId}`;

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
            onIssued={reloadSoon}
            onError={setFormError}
            onLoadingChange={setIssuing}
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
              <div className="flex gap-2">
                <Select
                  value={counterFilter}
                  onValueChange={(value) => {
                    setCounterFilter(value ?? "all");
                    setFormError(null);
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
                    setFormError(null);
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
              </div>
            }
          >
            {error && <Alert variant="destructive">{error}</Alert>}
            {loading && !tokens ? (
              <div className="space-y-3">
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
                <Skeleton className="h-8" />
              </div>
            ) : !tokens || tokens.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No tokens match — issue your first token on the left.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Token</TableHead>
                    <TableHead>Customer</TableHead>
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
                        <TokenActions token={token} onDone={reloadSoon} onError={setFormError} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {issuing && (
              <p className="mt-2 text-xs text-muted-foreground">
                Token issued — history reloading…
              </p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}