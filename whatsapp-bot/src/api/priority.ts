import type { TokenPublic } from './types';

export function priorityStatus(ticket: Pick<TokenPublic, 'priority_review' | 'effective_priority'>): string {
  const review = {
    pending: 'Accessibility request: pending staff verification. Normal queue order.',
    approved: 'Accessibility request: approved.',
    rejected: 'Accessibility request: rejected. Normal queue order.',
    normal: 'Accessibility request: returned to normal queue order.',
    not_requested: 'No accessibility priority requested.',
  }[ticket.priority_review] ?? 'Accessibility review status unavailable.';
  return `${review} Effective priority: ${ticket.effective_priority === 'accessibility' ? 'accessibility' : 'normal'}. Not emergency triage.`;
}
