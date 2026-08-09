'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, type Column, type ActionItem, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { AlertCircle, CheckCircle2, LifeBuoy, Search, Ticket, type LucideIcon } from 'lucide-react'
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

function TicketStatCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string
  value: string | number
  description: string
  icon: LucideIcon
  tone: 'sky' | 'amber' | 'emerald'
}) {
  const styles = {
    sky: {
      card: 'border-sky-500/20 bg-gradient-to-br from-sky-500/[0.15] via-card to-sky-500/[0.05]',
      icon: 'bg-gradient-to-br from-sky-500 to-sky-600 shadow-sky-500/20',
      accent: 'from-sky-500 via-sky-400',
      bubble: 'bg-sky-500/[0.10]',
    },
    amber: {
      card: 'border-amber-500/20 bg-gradient-to-br from-amber-500/[0.15] via-card to-amber-500/[0.05]',
      icon: 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/20',
      accent: 'from-amber-500 via-amber-400',
      bubble: 'bg-amber-500/[0.10]',
    },
    emerald: {
      card: 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.15] via-card to-emerald-500/[0.05]',
      icon: 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/20',
      accent: 'from-emerald-500 via-emerald-400',
      bubble: 'bg-emerald-500/[0.10]',
    },
  }[tone]

  return (
    <Card className={cn('group relative w-full overflow-hidden rounded-xl py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', styles.card)}>
      <div className={cn('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent', styles.accent)} />
      <div aria-hidden className={cn('absolute -bottom-7 -right-5 size-16 rounded-full transition-transform group-hover:scale-125', styles.bubble)} />
      <CardContent className="relative p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">{title}</p>
            <p className="text-lg font-bold leading-6 tracking-tight tabular-nums">{value}</p>
            <p className="truncate text-[10px] leading-3 text-muted-foreground">{description}</p>
          </div>
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm', styles.icon)}>
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function SupportPage() {
  const { toast } = useToast()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [showResolve, setShowResolve] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [resolution, setResolution] = useState('')
  const [search, setSearch] = useState('')

  const stats = useMemo(
    () => ({
      total: tickets.length,
      open: tickets.filter((ticket) => isOpenStatus(ticket.status)).length,
      resolved: tickets.filter((ticket) => ticket.status === 'resolved' || ticket.status === 'closed')
        .length,
    }),
    [tickets],
  )

  const filteredTickets = useMemo(() => {
    if (!search.trim()) return tickets
    const q = search.toLowerCase()
    return tickets.filter((ticket) =>
      ticket.subject.toLowerCase().includes(q) ||
      (ticket.school?.name || '').toLowerCase().includes(q) ||
      (CATEGORY_LABEL[ticket.category as TicketCategory] || ticket.category || '').toLowerCase().includes(q)
    )
  }, [tickets, search])

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
        <Badge variant="secondary" className="bg-primary/10 text-primary dark:text-primary">
          {CATEGORY_LABEL[ticket.category as TicketCategory] || ticket.category || '-'}
        </Badge>
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
      {/* Header */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <LifeBuoy className="size-5.5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Help & Support</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                {stats.total.toLocaleString('en-IN')} records
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">Review and resolve support tickets raised by schools</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <TicketStatCard
          title="Total Tickets"
          value={stats.total.toLocaleString('en-IN')}
          description="All time"
          icon={Ticket}
          tone="sky"
        />
        <TicketStatCard
          title="Open"
          value={stats.open.toLocaleString('en-IN')}
          description="Needs attention"
          icon={AlertCircle}
          tone="amber"
        />
        <TicketStatCard
          title="Resolved"
          value={stats.resolved.toLocaleString('en-IN')}
          description="Closed & resolved"
          icon={CheckCircle2}
          tone="emerald"
        />
      </div>

      {/* Tickets Table */}
      <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
        <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                <LifeBuoy className="size-4" />
              </span>
              Support Tickets
              {!loading && (
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {filteredTickets.length} record{filteredTickets.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search subject, school, category..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 w-full bg-background/90 pl-9 shadow-sm sm:w-56"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {tickets.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={LifeBuoy}
                title="No Support Tickets"
                description="Support tickets from schools will appear here."
              />
            </div>
          ) : (
            <DataTable columns={columns} data={filteredTickets} showSearch={false} actions={actions} />
          )}
        </CardContent>
      </Card>

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
