"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import type { TokenStatus } from "@/types";

export const TOKEN_STATUS_LABELS: Record<TokenStatus, string> = {
  waiting: "Waiting",
  called: "Called",
  in_service: "In service",
  served: "Served",
  no_show: "No-show",
  declined: "Declined",
};

export function TokenStatusBadge({ status }: { status: TokenStatus }) {
  const variant: Record<TokenStatus, "default" | "secondary" | "outline" | "destructive"> = {
    waiting: "secondary",
    called: "default",
    in_service: "outline",
    served: "default",
    no_show: "destructive",
    declined: "destructive",
  };
  return <Badge variant={variant[status]}>{TOKEN_STATUS_LABELS[status]}</Badge>;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatClock(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}