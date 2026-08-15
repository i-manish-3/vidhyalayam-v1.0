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
  Ticket,
  type LucideIcon,
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

function StatCard({
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
      title: 'Total Tickets',
      value: stats.total.toLocaleString('en-IN'),
      description: 'All time',
      icon: Ticket,
      tone: 'sky' as const,
    },
    {
      title: 'Open',
      value: stats.open.toLocaleString('en-IN'),
      description: 'Needs attention',
      icon: AlertCircle,
      tone: 'amber' as const,
    },
    {
      title: 'Resolved',
      value: stats.resolved.toLocaleString('en-IN'),
      description: 'Resolved & closed',
      icon: CheckCircle2,
      tone: 'emerald' as const,
    },
  ]

  return (
    <div className="space-y-5">
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
            <p className="mt-0.5 text-xs text-white/80">Raise a ticket and our team will get back to you</p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => setOpen(true)}
          className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-transform hover:-translate-y-0.5 hover:shadow-lg"
          style={{ backgroundColor: 'white', color: 'var(--primary)' }}
        >
          <Plus className="size-4" /> New Ticket
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      <Card className="gap-0 overflow-hidden rounded-xl border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm dark:border-sky-500/20">
        <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-5 py-3.5 dark:border-sky-500/15">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
              <MessageSquare className="size-3.5" />
            </span>
            My Support Tickets
            {!loading && (
              <Badge variant="secondary" className="ml-auto bg-primary/10 text-primary dark:text-primary">
                {tickets.length.toLocaleString('en-IN')} records
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-14 text-sm text-muted-foreground">
              <span className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading tickets...
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center gap-4 px-4 py-14 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-cyan-500/20 text-primary shadow-sm">
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
            <div className="divide-y divide-sky-500/10 dark:divide-sky-500/10">
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
                    className="group relative flex items-start gap-3.5 px-5 py-4 transition-colors hover:bg-sky-500/[0.02]"
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
                        <Badge variant="secondary" className="bg-primary/10 text-primary dark:text-primary">
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
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-emerald-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <LifeBuoy className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">Raise a support ticket</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  Tell us what&apos;s going on and we&apos;ll get back to you.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.055] p-4 sm:p-5">
            <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10 sm:p-5">
              <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
              <div className="relative mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm"><MessageSquare className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">Ticket details</h3><p className="text-[10px] text-muted-foreground">A short summary of the issue</p></div>
              </div>
              <div className="relative space-y-1.5">
                <Label htmlFor="st-subject" className="text-xs font-medium">Subject</Label>
                <Input
                  id="st-subject"
                  value={form.subject}
                  maxLength={150}
                  placeholder="Short summary of the issue"
                  className="h-9 border-sky-200/60 bg-white shadow-sm focus-visible:ring-primary/30 dark:border-sky-500/30 dark:bg-input/30"
                  onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                />
              </div>
            </section>

            <section className="relative overflow-hidden rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 p-4 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10">
              <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-violet-200/35 blur-xl dark:bg-violet-500/15" />
              <div className="relative mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm"><Ticket className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">Classification</h3><p className="text-[10px] text-muted-foreground">Helps us route the ticket to the right team</p></div>
              </div>
              <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Category</Label>
                  <Select
                    value={form.category}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, category: value as TicketCategory }))}
                  >
                    <SelectTrigger className="h-9 border-sky-200/60 bg-white shadow-sm focus:ring-primary/30 dark:border-sky-500/30 dark:bg-input/30">
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
                  <Label className="text-xs font-medium">Priority</Label>
                  <Select
                    value={form.priority}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, priority: value as TicketPriority }))}
                  >
                    <SelectTrigger className="h-9 border-sky-200/60 bg-white shadow-sm focus:ring-primary/30 dark:border-sky-500/30 dark:bg-input/30">
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
            </section>

            <section className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm"><AlertCircle className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">Description</h3><p className="text-[10px] text-muted-foreground">Include steps to reproduce, if possible</p></div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st-desc" className="text-xs font-medium">Details</Label>
                <Textarea
                  id="st-desc"
                  rows={5}
                  value={form.description}
                  placeholder="Describe the problem, what you expected, and any steps to reproduce it."
                  className="border-sky-200/60 bg-white shadow-sm focus-visible:ring-primary/30 dark:border-sky-500/30 dark:bg-input/30"
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </section>
          </div>

          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 px-4 text-xs"
              onClick={() => void submit()}
              disabled={submitting}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Submitting...
                </span>
              ) : (
                <>
                  <Plus className="size-3.5" />
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
