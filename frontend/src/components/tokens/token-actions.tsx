"use client";

import { useState } from "react";
import toast from "react-hot-toast";

import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import type { Token } from "@/types";

type Action = "call" | "start" | "complete" | "no-show";

const ACTION_LABELS: Record<Action, string> = {
  call: "called",
  start: "started",
  complete: "completed",
  "no-show": "marked as no-show",
};

export function TokenActions({
  token,
  onDone,
  onError,
}: {
  token: Token;
  onDone?: () => void;
  onError?: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState<Action | null>(null);

  async function run(action: Action) {
    setBusy(action);
    onError?.(null);
    try {
      await api.post(`/tokens/${token.id}/${action}`);
      toast.success(`${token.token_number} ${ACTION_LABELS[action]}`);
      onDone?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      onError?.(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  if (token.status === "waiting") {
    return (
      <div className="flex flex-wrap gap-1.5">
        <Button size="xs" onClick={() => run("call")} disabled={busy !== null}>
          Call
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={() => run("no-show")}
          disabled={busy !== null}
        >
          No-show
        </Button>
      </div>
    );
  }

  if (token.status === "called") {
    return (
      <div className="flex flex-wrap gap-1.5">
        <Button size="xs" onClick={() => run("start")} disabled={busy !== null}>
          Start service
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={() => run("no-show")}
          disabled={busy !== null}
        >
          No-show
        </Button>
      </div>
    );
  }

  if (token.status === "in_service") {
    return (
      <Button size="xs" onClick={() => run("complete")} disabled={busy !== null}>
        Complete
      </Button>
    );
  }

  return null;
}
