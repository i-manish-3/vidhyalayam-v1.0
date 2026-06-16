'use client'

import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react'
import { PageHeader, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  all: { label: 'Everyone', className: 'border-teal-200 bg-teal-50 text-teal-700' },
  teachers: { label: 'Teachers', className: 'border-violet-200 bg-violet-50 text-violet-700' },
  students: { label: 'Students', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  parents: { label: 'Parents', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  staff: { label: 'Staff', className: 'border-border bg-muted/40 text-muted-foreground' },
}

const priorityMeta: Record<string, { label: string; className: string; iconClass: string }> = {
  normal: {
    label: 'Normal',
    className: 'border-border bg-muted/40 text-muted-foreground',
    iconClass: 'bg-muted text-muted-foreground',
  },
  high: {
    label: 'High',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    iconClass: 'bg-amber-50 text-amber-700',
  },
  urgent: {
    label: 'Urgent',
    className: 'border-red-200 bg-red-50 text-red-700',
    iconClass: 'bg-red-50 text-red-700',
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

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const filteredAnnouncements = useMemo(() => {
    const query = search.trim().toLowerCase()
    return announcements.filter((item) => {
      const matchesQuery =
        !query || item.title.toLowerCase().includes(query) || item.content.toLowerCase().includes(query)
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
    <div className="space-y-4">
      <PageHeader
        title="Announcements"
        description="Broadcast school updates to staff, students, and parents."
        action={{ label: 'New Announcement', icon: PlusCircle, onClick: () => setShowAdd(true) }}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 shadow-sm">
        {[
          { label: 'Total', value: stats.total.toLocaleString('en-IN') },
          { label: 'High Priority', value: stats.important.toLocaleString('en-IN') },
          { label: 'Recipients', value: stats.recipients.toLocaleString('en-IN') },
          { label: 'Delivered', value: stats.delivered.toLocaleString('en-IN') },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 rounded-md bg-muted/35 px-2.5 py-1.5 text-xs">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-semibold tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>

      <Card className="gap-0 py-0 shadow-sm">
        <CardContent className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(240px,1fr)_180px_170px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search announcements..."
              className="h-9 pl-9"
            />
          </div>
          <Select value={audienceFilter} onValueChange={setAudienceFilter}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_audiences">All audiences</SelectItem>
              {AUDIENCE_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_priorities">All priorities</SelectItem>
              {PRIORITY_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="border-b bg-muted/30 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Megaphone className="size-4 text-primary" />
            Announcement Board
            <Badge variant="secondary" className="ml-auto text-xs">
              {filteredAnnouncements.length.toLocaleString('en-IN')} records
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {announcements.length === 0 ? (
            <InlineEmpty
              icon={Megaphone}
              title="No announcements yet"
              description="Create your first announcement to broadcast important school updates."
              actionLabel="New Announcement"
              onAction={() => setShowAdd(true)}
            />
          ) : filteredAnnouncements.length === 0 ? (
            <InlineEmpty icon={Search} title="No matching announcements" description="Try changing your search or filters." />
          ) : (
            <div className="divide-y">
              {filteredAnnouncements.map((announcement) => (
                <AnnouncementRow key={announcement.id} announcement={announcement} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="size-4 text-primary" />
              New Announcement
            </DialogTitle>
            <DialogDescription>Send a clear update to the selected audience.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="announcement-title">Title</Label>
              <Input
                id="announcement-title"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Example: Parent-teacher meeting on Friday"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="announcement-message">Message</Label>
              <Textarea
                id="announcement-message"
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
                <Select
                  value={form.audience}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, audience: value }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button className="gap-2" onClick={handleAdd} disabled={!form.title.trim() || !form.content.trim() || creating}>
              {creating ? (
                'Sending...'
              ) : (
                <>
                  <Send className="size-4" />
                  Send Announcement
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AnnouncementRow({ announcement }: { announcement: Announcement }) {
  const priority = priorityMeta[announcement.priority] || priorityMeta.normal
  const audience = audienceMeta[announcement.audience] || audienceMeta.all
  const deliveryTotal = Number(announcement.recipientCount || 0)
  const delivered = Number(announcement.deliveredCount || 0)
  const deliveryRate = deliveryTotal > 0 ? Math.round((delivered / deliveryTotal) * 100) : null

  return (
    <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', priority.iconClass)}>
        {announcement.priority === 'urgent' ? <AlertTriangle className="size-4" /> : <Megaphone className="size-4" />}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-start gap-2">
          <h3 className="min-w-[180px] flex-1 text-sm font-semibold leading-5">{announcement.title}</h3>
          <Badge variant="outline" className={priority.className}>
            {priority.label}
          </Badge>
          <Badge variant="outline" className={audience.className}>
            {audience.label}
          </Badge>
        </div>

        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{announcement.content}</p>

        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <MetaItem icon={Clock3} label="Created" value={formatDateTime(announcement.createdAt)} />
          <MetaItem
            icon={CalendarClock}
            label={announcement.sentAt ? 'Sent' : announcement.scheduledAt ? 'Scheduled' : 'Status'}
            value={
              announcement.sentAt
                ? formatDateTime(announcement.sentAt)
                : announcement.scheduledAt
                  ? formatDateTime(announcement.scheduledAt)
                  : statusLabel(announcement.status)
            }
          />
          <MetaItem
            icon={UserRoundCheck}
            label="Delivery"
            value={deliveryRate === null ? 'Pending' : `${delivered}/${deliveryTotal} (${deliveryRate}%)`}
          />
        </div>
      </div>
    </div>
  )
}

function InlineEmpty({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ElementType
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {actionLabel && onAction && (
        <Button size="sm" onClick={onAction}>
          <PlusCircle className="size-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

function MetaItem({ icon: Icon, label, value }: { icon: ElementType; label: string; value: string }) {
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
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
