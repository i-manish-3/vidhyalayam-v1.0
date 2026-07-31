'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
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
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  LifeBuoy,
  MessageSquare,
  Plus,
  Sparkles,
  Ticket,
} from 'lucide-react'
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

  const statCards = [
    {
      label: 'Total Tickets',
      value: stats.total.toLocaleString('en-IN'),
      icon: Ticket,
      gradient: 'from-sky-500/20 via-sky-400/10 to-transparent',
      border: 'border-sky-200/50 dark:border-sky-500/20',
      iconBg: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    },
    {
      label: 'Open',
      value: stats.open.toLocaleString('en-IN'),
      icon: AlertCircle,
      gradient: 'from-amber-500/20 via-amber-400/10 to-transparent',
      border: 'border-amber-200/50 dark:border-amber-500/20',
      iconBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Resolved',
      value: stats.resolved.toLocaleString('en-IN'),
      icon: CheckCircle2,
      gradient: 'from-emerald-500/20 via-emerald-400/10 to-transparent',
      border: 'border-emerald-200/50 dark:border-emerald-500/20',
      iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    },
  ]

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-lg shadow-indigo-500/20 dark:border-indigo-500/30 dark:from-indigo-600 dark:via-purple-600 dark:to-pink-600">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.3),transparent_60%)] dark:hidden" />
        <div className="absolute right-0 top-0 opacity-10">
          <Sparkles className="size-32 text-white" />
        </div>
        <div className="relative flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-white">
              <span className="flex size-9 items-center justify-center rounded-xl bg-white/20 text-white shadow-sm backdrop-blur-sm">
                <LifeBuoy className="size-5" />
              </span>
              Help & Support
            </h1>
            <p className="text-sm text-white/80">
              Raise a ticket and our team will get back to you.
            </p>
          </div>
          <Button
            className="gap-2 border-0 bg-white text-indigo-700 shadow-md shadow-black/10 hover:bg-white/90 hover:text-indigo-800"
            size="default"
            onClick={() => setOpen(true)}
          >
            <Plus className="size-4" />
            New Ticket
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className={cn(
              'relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 shadow-sm transition-shadow hover:shadow-md',
              stat.border,
              stat.gradient,
            )}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">{stat.value}</p>
              </div>
              <span className={cn('flex size-9 items-center justify-center rounded-lg', stat.iconBg)}>
                <stat.icon className="size-4" />
              </span>
            </div>
          </div>
        ))}
      </div>

      <Card className="gap-0 overflow-hidden rounded-xl border border-indigo-200/50 py-0 shadow-sm dark:border-indigo-500/20">
        <CardHeader className="border-b border-indigo-100 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-pink-500/5 px-5 py-3.5 dark:border-indigo-500/15">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm">
              <MessageSquare className="size-3.5" />
            </span>
            My Support Tickets
            {!loading && (
              <Badge variant="secondary" className="ml-auto bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                {tickets.length.toLocaleString('en-IN')} records
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-14 text-sm text-muted-foreground">
              <span className="size-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              Loading tickets...
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center gap-4 px-4 py-14 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-500 shadow-sm dark:from-indigo-500/20 dark:to-purple-500/20">
                <Ticket className="size-6" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">No tickets yet</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Facing an issue or have a question? Raise a ticket and our team will help.
                </p>
              </div>
              <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                New ticket
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-indigo-100 dark:divide-indigo-500/10">
              {tickets.map((ticket) => {
                const status = ticket.status as TicketStatus
                const priority = ticket.priority as TicketPriority
                const StatusIcon = status === 'resolved' || status === 'closed' ? CheckCircle2 : Clock3
                const statusAccent = status === 'open'
                  ? 'from-amber-500 to-orange-500'
                  : status === 'in_progress'
                    ? 'from-teal-500 to-cyan-500'
                    : status === 'resolved'
                      ? 'from-emerald-500 to-green-500'
                      : 'from-slate-400 to-slate-500'

                return (
                  <div
                    key={ticket.id}
                    className="group relative flex items-start gap-3.5 px-5 py-4 transition-colors hover:bg-indigo-500/[0.02]"
                  >
                    <div className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm',
                      statusAccent,
                    )}>
                      <StatusIcon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground/90">{ticket.subject}</h3>
                        <Badge variant="outline" className={cn('shrink-0 border-0', STATUS_CLS[status] || STATUS_CLS.closed)}>
                          {STATUS_LABEL[status] || ticket.status}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                          {CATEGORY_LABEL[ticket.category as TicketCategory] || ticket.category}
                        </Badge>
                        <Badge variant="outline" className={PRIORITY_CLS[priority] || PRIORITY_CLS.low}>
                          {ticket.priority}
                        </Badge>
                        <span className="text-muted-foreground">{formatTicketDate(ticket.createdAt)}</span>
                      </div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{ticket.description}</p>
                      {ticket.resolution && (
                        <div className="rounded-lg border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50/50 p-3 text-sm dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-green-500/5">
                          <p className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="size-3" />
                            Resolution
                          </p>
                          <p className="text-foreground/80">{ticket.resolution}</p>
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
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm">
                <Plus className="size-3.5" />
              </span>
              Raise a support ticket
            </DialogTitle>
            <DialogDescription>Tell us what&apos;s going on and we&apos;ll get back to you.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="st-subject" className="text-sm font-medium">Subject</Label>
              <Input
                id="st-subject"
                value={form.subject}
                maxLength={150}
                placeholder="Short summary of the issue"
                className="border-indigo-200/60 focus-visible:ring-indigo-500/30 dark:border-indigo-500/30"
                onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, category: value as TicketCategory }))}
                >
                  <SelectTrigger className="h-9 border-indigo-200/60 focus:ring-indigo-500/30 dark:border-indigo-500/30">
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
                <Label className="text-sm font-medium">Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, priority: value as TicketPriority }))}
                >
                  <SelectTrigger className="h-9 border-indigo-200/60 focus:ring-indigo-500/30 dark:border-indigo-500/30">
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
              <Label htmlFor="st-desc" className="text-sm font-medium">Description</Label>
              <Textarea
                id="st-desc"
                rows={5}
                value={form.description}
                placeholder="Describe the problem, what you expected, and any steps to reproduce it."
                className="border-indigo-200/60 focus-visible:ring-indigo-500/30 dark:border-indigo-500/30"
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-600 hover:to-purple-600"
              onClick={() => void submit()}
              disabled={submitting}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Submitting...
                </span>
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
