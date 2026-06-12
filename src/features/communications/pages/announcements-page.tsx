'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Megaphone,
  PlusCircle,
  Search,
  Send,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Announcement {
  id: string
  title: string
  content: string
  audience: string
  priority: string
  status?: string
  recipientCount?: number
  deliveredCount?: number
  failedCount?: number
  sentAt?: string | null
  scheduledAt?: string | null
  createdAt: string
}

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'Everyone' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'students', label: 'Students' },
  { value: 'parents', label: 'Parents' },
  { value: 'staff', label: 'Staff' },
]

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

const audienceMeta: Record<string, { label: string; className: string }> = {
  all: { label: 'Everyone', className: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-50' },
  teachers: { label: 'Teachers', className: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-50' },
  students: { label: 'Students', className: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50' },
  parents: { label: 'Parents', className: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50' },
  staff: { label: 'Staff', className: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-50' },
}

const priorityMeta: Record<string, { label: string; className: string; ring: string; iconClass: string }> = {
  normal: {
    label: 'Normal',
    className: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
    ring: 'border-l-slate-300',
    iconClass: 'bg-slate-100 text-slate-600',
  },
  high: {
    label: 'High',
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
    ring: 'border-l-amber-500',
    iconClass: 'bg-amber-100 text-amber-700',
  },
  urgent: {
    label: 'Urgent',
    className: 'bg-red-100 text-red-800 hover:bg-red-100',
    ring: 'border-l-red-500',
    iconClass: 'bg-red-100 text-red-700',
  },
}

export function AnnouncementsPage() {
  const { toast } = useToast()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [audienceFilter, setAudienceFilter] = useState('all_audiences')
  const [priorityFilter, setPriorityFilter] = useState('all_priorities')
  const [form, setForm] = useState({ title: '', content: '', audience: 'all', priority: 'normal' })

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ announcements: Announcement[] }>('/api/school/announcements', { limit: '60' })
      setAnnouncements(res.announcements || [])
    } catch {
      toast({
        title: "Couldn't Load Announcements",
        description: "We couldn't load the announcements. Please refresh the page.",
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void fetchData() }, [fetchData])

  const filteredAnnouncements = useMemo(() => {
    const query = search.trim().toLowerCase()
    return announcements.filter((item) => {
      const matchesQuery = !query
        || item.title.toLowerCase().includes(query)
        || item.content.toLowerCase().includes(query)
      const matchesAudience = audienceFilter === 'all_audiences' || item.audience === audienceFilter
      const matchesPriority = priorityFilter === 'all_priorities' || item.priority === priorityFilter
      return matchesQuery && matchesAudience && matchesPriority
    })
  }, [announcements, audienceFilter, priorityFilter, search])

  const stats = useMemo(() => {
    const urgent = announcements.filter((item) => item.priority === 'urgent').length
    const high = announcements.filter((item) => item.priority === 'high').length
    const recipients = announcements.reduce((sum, item) => sum + Number(item.recipientCount || 0), 0)
    const delivered = announcements.reduce((sum, item) => sum + Number(item.deliveredCount || 0), 0)
    return { total: announcements.length, important: urgent + high, recipients, delivered }
  }, [announcements])

  const handleAdd = async () => {
    if (!form.title.trim() || !form.content.trim()) return
    setCreating(true)
    try {
      await api.post('/api/school/announcements', {
        ...form,
        title: form.title.trim(),
        content: form.content.trim(),
      })
      toast({ title: 'Announcement sent', description: 'Your update has been published.' })
      setShowAdd(false)
      setForm({ title: '', content: '', audience: 'all', priority: 'normal' })
      await fetchData()
    } catch (err) {
      toast({
        title: "Couldn't Create Announcement",
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Announcements"
        description="Broadcast school updates to staff, students, and parents."
        action={{ label: 'New Announcement', icon: PlusCircle, onClick: () => setShowAdd(true) }}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total announcements" value={stats.total} icon={Megaphone} tone="blue" />
        <MetricCard label="High priority" value={stats.important} icon={AlertTriangle} tone="amber" />
        <MetricCard label="Targeted recipients" value={stats.recipients} icon={UsersRound} tone="violet" />
        <MetricCard label="Delivered in-app" value={stats.delivered} icon={CheckCircle2} tone="emerald" />
      </div>

      <div className="rounded-md border bg-card p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search announcements..."
              className="pl-9"
            />
          </div>
          <Select value={audienceFilter} onValueChange={setAudienceFilter}>
            <SelectTrigger className="lg:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_audiences">All audiences</SelectItem>
              {AUDIENCE_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="lg:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_priorities">All priorities</SelectItem>
              {PRIORITY_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="Create your first announcement to broadcast important school updates."
          action={{ label: 'New Announcement', onClick: () => setShowAdd(true) }}
        />
      ) : filteredAnnouncements.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching announcements"
          description="Try changing your search or filters."
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filteredAnnouncements.map((announcement) => (
            <AnnouncementCard key={announcement.id} announcement={announcement} />
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="size-4 text-primary" />
              New Announcement
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Example: Parent-teacher meeting on Friday"
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={form.content}
                onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
                placeholder="Write the announcement clearly..."
                rows={6}
              />
              <div className="text-right text-[11px] text-muted-foreground">
                {form.content.trim().length} characters
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Audience</Label>
                <Select value={form.audience} onValueChange={(value) => setForm((prev) => ({ ...prev, audience: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(value) => setForm((prev) => ({ ...prev, priority: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!form.title.trim() || !form.content.trim() || creating}>
              {creating ? 'Sending...' : 'Send Announcement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AnnouncementCard({ announcement }: { announcement: Announcement }) {
  const priority = priorityMeta[announcement.priority] || priorityMeta.normal
  const audience = audienceMeta[announcement.audience] || audienceMeta.all
  const deliveryTotal = Number(announcement.recipientCount || 0)
  const delivered = Number(announcement.deliveredCount || 0)
  const deliveryRate = deliveryTotal > 0 ? Math.round((delivered / deliveryTotal) * 100) : null

  return (
    <Card className={cn('border-l-4 transition hover:border-primary/40 hover:shadow-sm', priority.ring)}>
      <CardContent className="p-4">
        <div className="flex gap-3">
          <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-md', priority.iconClass)}>
            {announcement.priority === 'urgent' ? <AlertTriangle className="size-5" /> : <Megaphone className="size-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 text-sm font-semibold leading-5 text-foreground">
                {announcement.title}
              </h3>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <Badge className={priority.className}>{priority.label}</Badge>
                <Badge variant="outline" className={audience.className}>{audience.label}</Badge>
              </div>
            </div>

            <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
              {announcement.content}
            </p>

            <Separator className="my-3" />

            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <MetaItem icon={Clock3} label="Created" value={formatDateTime(announcement.createdAt)} />
              <MetaItem
                icon={CalendarClock}
                label={announcement.sentAt ? 'Sent' : announcement.scheduledAt ? 'Scheduled' : 'Status'}
                value={announcement.sentAt ? formatDateTime(announcement.sentAt) : announcement.scheduledAt ? formatDateTime(announcement.scheduledAt) : statusLabel(announcement.status)}
              />
              <MetaItem
                icon={UserRoundCheck}
                label="Delivery"
                value={deliveryRate === null ? 'Pending' : `${delivered}/${deliveryTotal} (${deliveryRate}%)`}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: React.ElementType
  tone: 'blue' | 'amber' | 'violet' | 'emerald'
}) {
  const toneClass = {
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  }[tone]

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString('en-IN')}</p>
        </div>
        <div className={cn('flex size-10 items-center justify-center rounded-md', toneClass)}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function MetaItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="size-3.5 shrink-0" />
      <span className="shrink-0 font-medium">{label}:</span>
      <span className="min-w-0 truncate">{value}</span>
    </div>
  )
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(status?: string) {
  if (!status) return 'Sent'
  return status.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}
