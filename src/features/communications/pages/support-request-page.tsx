'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CheckCircle2, Clock3, LifeBuoy, Plus } from 'lucide-react'
import {
  TICKET_PRIORITIES,
  TICKET_CATEGORIES,
  STATUS_LABEL,
  CATEGORY_LABEL,
  type TicketStatus,
  type TicketPriority,
  type TicketCategory,
} from '@/lib/support-tickets'

interface Ticket {
  id: string
  subject: string
  description: string
  category: string
  priority: string
  status: string
  resolution: string | null
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

interface FormState {
  subject: string
  description: string
  category: TicketCategory
  priority: TicketPriority
}

const EMPTY_FORM: FormState = { subject: '', description: '', category: 'technical', priority: 'medium' }

function formatTicketDate(value: string) {
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function SupportRequestPage() {
  const { toast } = useToast()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  const stats = useMemo(
    () => ({
      total: tickets.length,
      open: tickets.filter((ticket) => ticket.status === 'open' || ticket.status === 'in_progress')
        .length,
      resolved: tickets.filter((ticket) => ticket.status === 'resolved' || ticket.status === 'closed')
        .length,
    }),
    [tickets],
  )

  const fetchTickets = useCallback(async () => {
    try {
      const res = await api.get<{ tickets: Ticket[] }>('/api/school/support')
      setTickets(res.tickets || [])
    } catch {
      toast({ title: "Couldn't load tickets", description: 'Please refresh and try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void fetchTickets()
  }, [fetchTickets])

  const submit = useCallback(async () => {
    if (!form.subject.trim()) {
      toast({ title: 'Subject required', description: 'Please enter a subject.', variant: 'destructive' })
      return
    }
    if (!form.description.trim()) {
      toast({ title: 'Description required', description: 'Please describe the issue.', variant: 'destructive' })
      return
    }
    try {
      setSubmitting(true)
      await api.post('/api/school/support', {
        subject: form.subject.trim(),
        description: form.description.trim(),
        category: form.category,
        priority: form.priority,
      })
      toast({ title: 'Ticket submitted', description: 'Our team will get back to you.' })
      setOpen(false)
      setForm(EMPTY_FORM)
      await fetchTickets()
    } catch (err) {
      toast({
        title: "Couldn't submit ticket",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }, [form, fetchTickets, toast])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Help & Support"
        description="Raise a ticket and track our responses."
        action={{ label: 'New ticket', icon: Plus, onClick: () => setOpen(true) }}
      />

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

      <Card className="gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="border-b bg-muted/30 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <LifeBuoy className="size-4 text-primary" />
            My Support Tickets
            {!loading && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {tickets.length.toLocaleString('en-IN')} records
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading...
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-md bg-primary/10 text-primary">
                <LifeBuoy className="size-5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">No tickets yet</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Facing an issue or have a question? Raise a ticket and our team will help.
                </p>
              </div>
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                New ticket
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {tickets.map((ticket) => {
                const status = ticket.status as TicketStatus
                const priority = ticket.priority as TicketPriority
                const StatusIcon = status === 'resolved' || status === 'closed' ? CheckCircle2 : Clock3

                return (
                  <div key={ticket.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <StatusIcon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{ticket.subject}</h3>
                        <Badge variant="outline" className={STATUS_CLS[status] || STATUS_CLS.closed}>
                          {STATUS_LABEL[status] || ticket.status}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="secondary">
                          {CATEGORY_LABEL[ticket.category as TicketCategory] || ticket.category}
                        </Badge>
                        <Badge variant="outline" className={PRIORITY_CLS[priority] || PRIORITY_CLS.low}>
                          {ticket.priority}
                        </Badge>
                        <span className="text-muted-foreground">{formatTicketDate(ticket.createdAt)}</span>
                      </div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{ticket.description}</p>
                      {ticket.resolution && (
                        <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3 text-sm dark:bg-emerald-500/10">
                          <p className="mb-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            Resolution
                          </p>
                          <p>{ticket.resolution}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Raise a support ticket</DialogTitle>
            <DialogDescription>Tell us what's going on and we'll get back to you.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="st-subject">Subject</Label>
              <Input
                id="st-subject"
                value={form.subject}
                maxLength={150}
                placeholder="Short summary of the issue"
                onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, category: value as TicketCategory }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {CATEGORY_LABEL[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, priority: value as TicketPriority }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority} className="capitalize">
                        {priority}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-desc">Description</Label>
              <Textarea
                id="st-desc"
                rows={5}
                value={form.description}
                placeholder="Describe the problem, what you expected, and any steps to reproduce it."
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button className="gap-2" onClick={() => void submit()} disabled={submitting}>
              {submitting ? (
                'Submitting...'
              ) : (
                <>
                  <Plus className="size-4" />
                  Submit ticket
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
