/**
 * Shared support-ticket vocabulary. Pure constants — safe to import from both
 * client pages and server routes. Stored values are lowercase (matches the
 * Prisma defaults + seed).
 */

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'

export const TICKET_STATUSES: readonly TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed']
export const TICKET_PRIORITIES: readonly TicketPriority[] = ['low', 'medium', 'high', 'critical']

export const TICKET_CATEGORIES = ['technical', 'billing', 'account', 'feature_request', 'other'] as const
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  technical: 'Technical',
  billing: 'Billing',
  account: 'Account',
  feature_request: 'Feature request',
  other: 'Other',
}

/** A ticket is still actionable (resolvable) when not yet resolved/closed. */
export function isOpenStatus(status: string): boolean {
  return status === 'open' || status === 'in_progress'
}
