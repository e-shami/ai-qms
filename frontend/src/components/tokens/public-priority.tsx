import type { PublicTicket } from "@/types";

export function PublicPriority({ ticket }: { ticket: Pick<PublicTicket, "priority_review" | "effective_priority"> }) {
  const review = {
    pending: "Accessibility request: pending staff verification. Normal queue order.",
    approved: "Accessibility request: approved.",
    rejected: "Accessibility request: rejected. Normal queue order.",
    normal: "Accessibility request: returned to normal queue order.",
    not_requested: "No accessibility priority requested.",
  }[ticket.priority_review] ?? "Accessibility review status unavailable.";
  return <p role="status" className="text-sm">
    {review} Effective priority: {ticket.effective_priority === "accessibility" ? "accessibility" : "normal"}. Not emergency triage.
  </p>;
}
