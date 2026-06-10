'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
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
import { LifeBuoy, Plus } from 'lucide-react'
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
  open: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
  in_progress: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200',
  resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200',
  closed: 'bg-muted text-muted-foreground',
}

interface FormState {
  subject: string
  description: string
  category: TicketCategory
  priority: TicketPriority
}

const EMPTY_FORM: FormState = { subject: '', description: '', category: 'technical', priority: 'medium' }

export function SupportRequestPage() {
  const { toast } = useToast()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

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
    <div className="space-y-6">
      <PageHeader
        title="Help & Support"
        description="Raise a ticket and track our responses."
        action={{ label: 'New ticket', icon: Plus, onClick: () => setOpen(true) }}
      />

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <LifeBuoy className="size-7 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">No tickets yet</h3>
              <p className="max-w-sm text-sm text-muted-foreground">
                Facing an issue or have a question? Raise a ticket and our team will help.
              </p>
            </div>
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-1 size-4" /> New ticket
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-2 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{t.subject}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[t.status as TicketStatus] || 'bg-muted text-muted-foreground'}`}
                  >
                    {STATUS_LABEL[t.status as TicketStatus] || t.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary">{CATEGORY_LABEL[t.category as TicketCategory] || t.category}</Badge>
                  <Badge variant="outline" className="capitalize">
                    {t.priority}
                  </Badge>
                  <span className="text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{t.description}</p>
                {t.resolution && (
                  <div className="rounded-md border bg-emerald-50 p-3 text-sm dark:bg-emerald-500/10">
                    <p className="mb-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Resolution</p>
                    <p>{t.resolution}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
                onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v as TicketCategory }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v as TicketPriority }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">
                        {p}
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
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit ticket'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
