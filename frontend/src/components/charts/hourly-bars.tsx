"use client";

import { useMemo } from "react";

import type { HourlyPair } from "@/types";

const HOURS = 24;

/** Paired hourly bars (issued vs completed) drawn as a plain SVG — no chart library. */
export function HourlyBars({ data }: { data: HourlyPair[] }) {
  const { max, byHour } = useMemo(() => {
    const map = new Map<number, HourlyPair>();
    let peak = 1;
    for (let hour = 0; hour < HOURS; hour++) map.set(hour, { hour, issued: 0, completed: 0 });
    for (const pair of data ?? []) {
      if (pair.hour >= 0 && pair.hour < HOURS) {
        map.set(pair.hour, pair);
        peak = Math.max(peak, pair.issued, pair.completed);
      }
    }
    return { max: peak, byHour: map };
  }, [data]);

  const width = 720;
  const height = 180;
  const padding = { top: 8, right: 4, bottom: 20, left: 4 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const groupWidth = innerWidth / HOURS;
  const barWidth = groupWidth * 0.32;
  const scale = (value: number) => Math.max(1, (value / max) * innerHeight);

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full"
        role="img"
        aria-label="Hourly token activity: issued versus completed"
      >
        {Array.from({ length: HOURS }, (_, hour) => {
          const entry = byHour.get(hour)!;
          const x = padding.left + hour * groupWidth;
          const issuedHeight = scale(entry.issued);
          const completedHeight = scale(entry.completed);
          return (
            <g key={hour}>
              <rect
                x={x + groupWidth * 0.08}
                y={padding.top + innerHeight - issuedHeight}
                width={barWidth}
                height={issuedHeight}
                rx={2}
                fill="var(--chart-1)"
              />
              <rect
                x={x + groupWidth * 0.46}
                y={padding.top + innerHeight - completedHeight}
                width={barWidth}
                height={completedHeight}
                rx={2}
                fill="var(--chart-4)"
              />
              {hour % 3 === 0 && (
                <text
                  x={x + groupWidth / 2}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {String(hour).padStart(2, "0")}
                </text>
              )}
            </g>
          );
        })}
        <line
          x1={padding.left}
          y1={padding.top + innerHeight}
          x2={width - padding.right}
          y2={padding.top + innerHeight}
          className="stroke-border"
          strokeWidth={1}
        />
      </svg>
      <figcaption className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-sm" style={{ background: "var(--chart-1)" }} />
          Issued
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-sm" style={{ background: "var(--chart-4)" }} />
          Completed
        </span>
      </figcaption>
    </figure>
  );
}
