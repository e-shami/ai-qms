import { cn } from "@/lib/utils";

const DOT_COLORS = {
  live: "bg-emerald-500",
  idle: "bg-emerald-500/70",
  busy: "bg-blue-500",
  break: "bg-amber-500",
  off: "bg-zinc-400 dark:bg-zinc-600",
  closed: "bg-zinc-400 dark:bg-zinc-600",
} as const;

export type StatusTone = keyof typeof DOT_COLORS;

export const STATUS_TONE_LABELS: Record<StatusTone, string> = {
  live: "Live",
  idle: "Idle",
  busy: "Busy",
  break: "Break",
  off: "Off duty",
  closed: "Closed",
};

export function StatusDot({
  tone,
  pulse = false,
  className,
}: {
  tone: StatusTone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex size-2.5 rounded-full",
        DOT_COLORS[tone],
        pulse && "animate-pulse",
        className
      )}
      aria-hidden
    />
  );
}

export function StatusLabel({
  tone,
  label,
  pulse = false,
}: {
  tone: StatusTone;
  label?: string;
  pulse?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <StatusDot tone={tone} pulse={pulse} />
      {label ?? STATUS_TONE_LABELS[tone]}
    </span>
  );
}
