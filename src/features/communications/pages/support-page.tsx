'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader, DataTable, type Column, type ActionItem, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { LifeBuoy } from 'lucide-react'
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  isOpenStatus,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/support-tickets'

interface SupportTicket {
  [key: string]: unknown
  id: string
  subject: string
  schoolId: string
  school?: { id: string; name: string }
  category: string
  priority: string
  status: string
  description?: string
  resolution?: string
  createdAt: string
}

const STATUS_CLS: Record<TicketStatus, string> = {
  open: 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
  in_progress: 'border-teal-200 bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-200',
  resolved:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
  closed: 'border-border bg-muted/40 text-muted-foreground',
}

const PRIORITY_CLS: Record<TicketPriority, string> = {
  low: 'border-border bg-muted/40 text-muted-foreground',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  high: 'border-orange-200 bg-orange-50 text-orange-700',
  critical: 'border-red-200 bg-red-50 text-red-700',
}

function formatTicketDate(value: string) {
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function priorityBadge(priority: string) {
  const value = priority as TicketPriority

  return (
    <Badge variant="outline" className={PRIORITY_CLS[value] || PRIORITY_CLS.low}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </Badge>
  )
}

function statusBadge(status: string) {
  const value = status as TicketStatus

  return (
    <Badge variant="outline" className={STATUS_CLS[value] || STATUS_CLS.closed}>
      {STATUS_LABEL[value] || status}
    </Badge>
  )
}

export function SupportPage() {
  const { toast } = useToast()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [showResolve, setShowResolve] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [resolution, setResolution] = useState('')

  const stats = useMemo(
    () => ({
      total: tickets.length,
      open: tickets.filter((ticket) => isOpenStatus(ticket.status)).length,
      resolved: tickets.filter((ticket) => ticket.status === 'resolved' || ticket.status === 'closed')
        .length,
    }),
    [tickets],
  )

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ tickets: SupportTicket[] }>('/api/super-admin/support-tickets')
      setTickets(res.tickets || [])
    } catch {
      toast({
        title: "Couldn't Load Tickets",
        description: "We couldn't load the tickets. Please refresh the page.",
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleResolve = async () => {
    if (!selectedTicket) return
    try {
      await api.patch('/api/super-admin/support-tickets', {
        id: selectedTicket.id,
        status: 'resolved',
        resolution,
      })
      toast({ title: 'Success', description: 'Ticket resolved' })
      setShowResolve(false)
      setSelectedTicket(null)
      setResolution('')
      void fetchData()
    } catch (err) {
      toast({
        title: "Couldn't Resolve Ticket",
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const setStatus = async (ticket: SupportTicket, status: TicketStatus) => {
    try {
      await api.patch('/api/super-admin/support-tickets', { id: ticket.id, status })
      toast({ title: 'Updated', description: `Ticket marked ${STATUS_LABEL[status]}.` })
      void fetchData()
    } catch (err) {
      toast({
        title: "Couldn't update ticket",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const columns: Column<SupportTicket>[] = [
    {
      key: 'subject',
      label: 'Subject',
      render: (ticket: SupportTicket) => (
        <div className="min-w-[220px]">
          <p className="font-medium">{ticket.subject}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{formatTicketDate(ticket.createdAt)}</p>
        </div>
      ),
    },
    { key: 'school', label: 'School', render: (ticket: SupportTicket) => ticket.school?.name || '-' },
    {
      key: 'category',
      label: 'Category',
      render: (ticket: SupportTicket) => (
        <Badge variant="secondary">{CATEGORY_LABEL[ticket.category as TicketCategory] || ticket.category || '-'}</Badge>
      ),
    },
    { key: 'priority', label: 'Priority', render: (ticket: SupportTicket) => priorityBadge(ticket.priority) },
    { key: 'status', label: 'Status', render: (ticket: SupportTicket) => statusBadge(ticket.status) },
  ]

  const actions = (ticket: SupportTicket): ActionItem[] => {
    const items: ActionItem[] = []
    if (ticket.status === 'open') {
      items.push({ label: 'Mark In Progress', onClick: () => void setStatus(ticket, 'in_progress') })
    }
    if (isOpenStatus(ticket.status)) {
      items.push({
        label: 'Resolve',
        onClick: () => {
          setSelectedTicket(ticket)
          setShowResolve(true)
        },
      })
    }
    if (ticket.status === 'resolved') {
      items.push({ label: 'Close', onClick: () => void setStatus(ticket, 'closed') })
      items.push({ label: 'Reopen', onClick: () => void setStatus(ticket, 'open') })
    }
    return items
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      <PageHeader title="Support Tickets" description="Review and resolve support tickets from schools." />

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 shadow-sm">
        {[
          { label: 'Total Tickets', value: stats.total.toLocaleString('en-IN') },
          { label: 'Open', value: stats.open.toLocaleString('en-IN') },
          { label: 'Resolved', value: stats.resolved.toLocaleString('en-IN') },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 rounded-md bg-muted/35 px-2.5 py-1.5 text-xs">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-semibold tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>

      {tickets.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="No Support Tickets" description="Support tickets from schools will appear here." />
      ) : (
        <DataTable columns={columns} data={tickets} searchKey="subject" searchPlaceholder="Search tickets..." actions={actions} />
      )}

      <Dialog open={showResolve} onOpenChange={setShowResolve}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Ticket</DialogTitle>
            <DialogDescription>Add the resolution note before marking this ticket resolved.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-sm font-medium">{selectedTicket?.subject}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{selectedTicket?.school?.name || '-'}</p>
              {selectedTicket?.description && (
                <p className="mt-3 text-sm text-muted-foreground">{selectedTicket.description}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket-resolution">Resolution</Label>
              <Textarea
                id="ticket-resolution"
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                placeholder="Describe the resolution..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolve(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleResolve()} disabled={!resolution.trim()}>
              Resolve Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
