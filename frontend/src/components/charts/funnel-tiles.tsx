"use client";

import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FunnelStep {
  label: string;
  value: number;
  tone?: "default" | "live" | "done";
}

/** Live token pipeline: issued → waiting → in service → done. */
export function FunnelTiles({ steps }: { steps: FunnelStep[] }) {
  return (
    <ol className="grid grid-cols-2 gap-3 sm:flex sm:items-stretch">
      {steps.map((step, index) => (
        <li key={step.label} className="contents sm:contents">
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col justify-between gap-2 rounded-lg border bg-card p-4",
              step.tone === "live" && "border-primary/30"
            )}
          >
            <span className="truncate text-xs font-medium text-muted-foreground">
              {step.label}
            </span>
            <span className="text-2xl font-semibold tabular-nums">{step.value}</span>
          </div>
          {index < steps.length - 1 && (
            <span
              aria-hidden
              className="hidden items-center text-muted-foreground/60 sm:flex"
            >
              <ArrowRight className="size-4" />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
