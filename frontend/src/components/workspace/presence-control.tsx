"use client";

import { Coffee, LogOut, Play } from "lucide-react";

import { StatusLabel } from "@/components/ui/status-dot";
import type { StatusTone } from "@/components/ui/status-dot";
import { api } from "@/lib/api-client";
import toast from "react-hot-toast";
import type { WorkStatus } from "@/types";

const OPTIONS: Array<{ value: WorkStatus; label: string; icon: typeof Play }> = [
  { value: "available", label: "Available", icon: Play },
  { value: "on_break", label: "On break", icon: Coffee },
  { value: "off_duty", label: "Off duty", icon: LogOut },
];

function toneFor(status: WorkStatus): StatusTone {
  if (status === "available") return "idle";
  if (status === "on_break") return "break";
  return "off";
}

/** Declared presence: available / on break / off duty. */
export function PresenceControl({
  value,
  onChanged,
}: {
  value: WorkStatus;
  onChanged: () => void;
}) {
  async function setWorkStatus(next: WorkStatus) {
    if (next === value) return;
    try {
      await api.patch("/staff/status", { work_status: next });
      const label = OPTIONS.find((option) => option.value === next)?.label;
      toast.success(`Status: ${label}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update status");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Presence status"
        className="inline-flex rounded-lg border bg-card p-0.5"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setWorkStatus(option.value)}
            aria-pressed={value === option.value}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              value === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <option.icon className="size-3.5" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        ))}
      </div>
      <StatusLabel tone={toneFor(value)} pulse={value === "available"} />
    </div>
  );
}
