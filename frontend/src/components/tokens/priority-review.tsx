"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api-client";
import type { Token } from "@/types";

export function PriorityReview({ token, hospital, disabled = false, onDone }: {
  token: Token; hospital: boolean; disabled?: boolean; onDone: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const canReview = hospital && token.status === "waiting" && token.requested_priority === "accessibility";
  async function review(decision: "approve" | "reject" | "normal") {
    if (pending.current || disabled || !canReview) return;
    pending.current = true;
    setBusy(true);
    try {
      await api.post(`/tokens/${token.id}/priority`, { decision });
      toast.success("Priority review saved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Review failed"); }
    finally {
      // A conflict (or a failed broadcast after commit) also needs fresh server state.
      try { await onDone(); }
      finally {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  if (!hospital) return null;
  return <div className="space-y-1 text-xs">
    <p>Queue position: {token.position ?? "-"}</p>
    <div className="flex flex-wrap gap-1">
      <Badge variant="outline">Effective: {token.effective_priority}</Badge>
      {token.requested_priority === "accessibility" && <Badge variant="secondary">{token.priority_review === "pending" ? "Pending verification" : token.priority_review === "normal" ? "Returned to normal" : token.priority_review}</Badge>}
    </div>
    {token.requested_priority === "accessibility" && <p>Requested: accessibility{token.priority_reason ? ` (${token.priority_reason})` : ""}</p>}
    {token.priority_review === "pending" && <p>Pending requests keep normal queue order.</p>}
    {canReview && <div className="space-y-1">
      <p>Verify accessibility eligibility before approval. Not clinical triage or emergency ranking.</p>
      <div className="flex flex-wrap gap-1">
      <Button type="button" size="xs" variant="outline" disabled={busy || disabled || token.priority_review === "approved"} onClick={() => review("approve")}>Approve accessibility</Button>
      <Button type="button" size="xs" variant="outline" disabled={busy || disabled || token.priority_review === "rejected"} onClick={() => review("reject")}>Reject request</Button>
      <Button type="button" size="xs" variant="ghost" disabled={busy || disabled || token.priority_review === "normal"} onClick={() => review("normal")}>Return to normal</Button>
      </div>
    </div>}
  </div>;
}
