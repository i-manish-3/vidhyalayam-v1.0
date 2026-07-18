'use client'

import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react'
import { LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  X,
  MessageSquareText,
  Target,
  Gauge,
  BarChart3,
  Globe,
  GraduationCap,
  UserCheck,
  Shield,
  Heart,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

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

const AUDIENCE_CONFIG: Record<string, { icon: typeof Globe; gradient: string; dot: string; label: string }> = {
  all: { icon: Globe, gradient: 'from-teal-500 to-emerald-500', dot: 'bg-teal-500', label: 'Everyone' },
  teachers: { icon: GraduationCap, gradient: 'from-violet-500 to-fuchsia-500', dot: 'bg-violet-500', label: 'Teachers' },
  students: { icon: UsersRound, gradient: 'from-sky-500 to-blue-500', dot: 'bg-sky-500', label: 'Students' },
  parents: { icon: Heart, gradient: 'from-amber-500 to-orange-500', dot: 'bg-amber-500', label: 'Parents' },
  staff: { icon: Shield, gradient: 'from-cyan-500 to-teal-500', dot: 'bg-cyan-500', label: 'Staff' },
}

const PRIORITY_CONFIG: Record<string, { icon: typeof Gauge; gradient: string; dot: string; label: string; badge: string }> = {
  normal: {
    icon: Gauge, gradient: 'from-primary to-teal-600', dot: 'bg-primary', label: 'Normal',
    badge: 'border-primary/20 bg-primary/5 text-primary dark:text-primary',
  },
  high: {
    icon: BarChart3, gradient: 'from-amber-500 to-orange-500', dot: 'bg-amber-500', label: 'High',
    badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400',
  },
  urgent: {
    icon: AlertTriangle, gradient: 'from-red-500 to-rose-500', dot: 'bg-red-500', label: 'Urgent',
    badge: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400',
  },
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function getTimeAgo(value: string): string {
  const now = Date.now()
  const then = new Date(value).getTime()
  const diffMs = now - then
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return formatDateTime(value)
}

function statusLabel(status?: string) {
  if (!status) return 'Sent'
  return status.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
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
      toast({ title: "Couldn't Load Announcements", description: "We couldn't load the announcements. Please refresh the page.", variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { void fetchData() }, [fetchData])

  const filteredAnnouncements = useMemo(() => {
    const query = search.trim().toLowerCase()
    return announcements.filter((item) => {
      const matchesQuery = !query || item.title.toLowerCase().includes(query) || item.content.toLowerCase().includes(query)
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

  const hasActiveFilters = search || audienceFilter !== 'all_audiences' || priorityFilter !== 'all_priorities'

  const clearFilters = () => {
    setSearch('')
    setAudienceFilter('all_audiences')
    setPriorityFilter('all_priorities')
  }

  const handleAdd = async () => {
    if (!form.title.trim() || !form.content.trim()) return
    setCreating(true)
    try {
      await api.post('/api/school/announcements', {
        ...form, title: form.title.trim(), content: form.content.trim(),
      })
      toast({ title: 'Announcement sent', description: 'Your update has been published.' })
      setShowAdd(false)
      setForm({ title: '', content: '', audience: 'all', priority: 'normal' })
      await fetchData()
    } catch (err) {
      toast({ title: "Couldn't Create Announcement", description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    } finally { setCreating(false) }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-5">
      {/* Gradient Header */}
      <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-5 text-white shadow-lg">
        <div aria-hidden className="absolute -right-10 -top-10 size-36 rounded-full border-[20px] border-cyan-200/15" />
        <div aria-hidden className="absolute -bottom-8 right-16 size-20 rounded-full bg-cyan-300/8" />
        <div aria-hidden className="absolute left-12 top-4 size-16 rounded-full bg-white/5 blur-md" />
        <div aria-hidden className="absolute bottom-0 left-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-white/20 bg-white/15 shadow-md backdrop-blur-sm">
              <Megaphone className="size-5 text-white" />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Announcements</h1>
              <p className="mt-0.5 text-xs text-white/75">Broadcast school updates to staff, students, and parents</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" style={{ backgroundColor: 'white', color: 'var(--primary)' }} onClick={() => setShowAdd(true)} className="h-8 gap-1.5 text-xs shadow-md">
            <PlusCircle className="size-3.5" /> New
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Total', value: stats.total.toLocaleString('en-IN'), icon: Megaphone, gradient: 'from-primary to-teal-600', text: 'text-foreground' },
          { label: 'High Priority', value: stats.important.toLocaleString('en-IN'), icon: AlertTriangle, gradient: 'from-red-500 to-rose-500', text: 'text-red-600 dark:text-red-400' },
          { label: 'Recipients', value: stats.recipients.toLocaleString('en-IN'), icon: UsersRound, gradient: 'from-sky-500 to-blue-500', text: 'text-sky-600 dark:text-sky-400' },
          { label: 'Delivered', value: stats.delivered.toLocaleString('en-IN'), icon: CheckCircle2, gradient: 'from-emerald-500 to-teal-500', text: 'text-emerald-600 dark:text-emerald-400' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2 rounded-xl border border-primary/5 bg-card p-3 shadow-sm">
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm', s.gradient)}>
              <s.icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
              <p className={cn('text-base font-bold leading-tight', s.text)}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="relative overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-primary/[0.03] via-card to-sky-500/[0.03] p-3 shadow-sm">
        <div aria-hidden className="absolute -right-6 -top-6 size-16 rounded-full border-[12px] border-sky-500/5" />
        <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex shrink-0 items-center gap-2 text-sm font-medium">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/[0.08] to-teal-600/[0.06] text-primary shadow-sm">
              <Search className="size-4" />
            </span>
            <span>Filters</span>
          </div>

          <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_1fr_1fr]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search announcements..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 border-primary/15 bg-background pl-9 pr-9 transition-all focus-visible:border-primary/30"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <Select value={audienceFilter} onValueChange={setAudienceFilter}>
              <SelectTrigger className="h-9 border-primary/15 bg-background"><SelectValue placeholder="Audience" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all_audiences">All audiences</SelectItem>
                {AUDIENCE_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    <span className="flex items-center gap-2">
                      <span className={cn('size-2 rounded-full', AUDIENCE_CONFIG[item.value]?.dot)} />
                      {item.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-9 border-primary/15 bg-background"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all_priorities">All priorities</SelectItem>
                {PRIORITY_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    <span className="flex items-center gap-2">
                      <span className={cn('size-2 rounded-full', PRIORITY_CONFIG[item.value]?.dot)} />
                      {item.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 lg:justify-end">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground/80">{filteredAnnouncements.length}</span> shown
            </p>
            {hasActiveFilters && (
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20" onClick={clearFilters}>
                <X className="size-3.5" /> Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Announcement Cards */}
      <div className="overflow-hidden rounded-xl border border-primary/10 bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-primary/10 bg-gradient-to-r from-primary/[0.04] via-teal-600/[0.03] to-cyan-600/[0.04] px-4 py-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-teal-600 text-white shadow-sm">
            <MessageSquareText className="size-3.5" />
          </span>
          <span className="text-xs font-bold text-foreground/80">Announcement Board</span>
          <Badge variant="secondary" className="ml-auto h-4 gap-1 border-primary/20 bg-primary/10 px-1.5 text-[9px] font-bold text-primary">
            {filteredAnnouncements.length}
          </Badge>
        </div>
        <div className="p-0">
          {announcements.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-lg bg-gradient-to-br from-primary/[0.1] to-teal-600/[0.08] text-primary">
                <Megaphone className="size-5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">No announcements yet</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Create your first announcement to broadcast important school updates.</p>
              </div>
              <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 text-xs shadow-lg shadow-primary/20">
                <PlusCircle className="size-3.5" /> New Announcement
              </Button>
            </div>
          ) : filteredAnnouncements.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-lg bg-gradient-to-br from-primary/[0.1] to-teal-600/[0.08] text-primary">
                <Search className="size-5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">No matching announcements</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">Try changing your search or filters.</p>
              </div>
              <Button variant="outline" size="sm" onClick={clearFilters} className="gap-1.5 text-xs">
                <X className="size-3.5" /> Clear Filters
              </Button>
            </div>
          ) : (
            <ScrollArea className="max-h-[540px]">
              <div>
                {filteredAnnouncements.map((announcement) => (
                  <AnnouncementRow key={announcement.id} announcement={announcement} />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="gap-0 overflow-hidden border-0 p-0 shadow-2xl shadow-primary/20 sm:max-w-lg">
          <div className="relative bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 text-white">
            <div aria-hidden className="absolute -right-6 -top-6 size-24 rounded-full border-[15px] border-cyan-200/15" />
            <div aria-hidden className="absolute -bottom-6 right-12 size-16 rounded-full bg-cyan-300/8" />
            <div aria-hidden className="absolute left-8 top-2 size-10 rounded-full bg-white/5 blur-md" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl border border-white/20 bg-white/15 shadow-md backdrop-blur-sm">
                <Send className="size-4.5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-base font-bold text-white">New Announcement</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/70">Send a clear update to the selected audience.</DialogDescription>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.06] p-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Title</Label>
                <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Example: Parent-teacher meeting on Friday" className="h-9 border-primary/15" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Message</Label>
                <Textarea value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} placeholder="Write the announcement clearly..." rows={4} className="border-primary/15 resize-none" />
                <p className="text-right text-[10px] text-muted-foreground">{form.content.trim().length} characters</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Audience</Label>
                  <Select value={form.audience} onValueChange={(v) => setForm((p) => ({ ...p, audience: v }))}>
                    <SelectTrigger className="h-9 border-primary/15">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIENCE_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          <span className="flex items-center gap-2">
                            <span className={cn('size-2 rounded-full', AUDIENCE_CONFIG[item.value]?.dot)} />
                            {item.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}>
                    <SelectTrigger className="h-9 border-primary/15">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          <span className="flex items-center gap-2">
                            <span className={cn('size-2 rounded-full', PRIORITY_CONFIG[item.value]?.dot)} />
                            {item.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-primary/10 bg-gradient-to-r from-primary/[0.02] via-background to-cyan-500/[0.02] px-4 py-3">
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)} className="h-8 gap-1.5 text-xs border-primary/15 shadow-sm">
              <X className="size-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={!form.title.trim() || !form.content.trim() || creating} className="h-8 gap-1.5 text-xs shadow-lg shadow-primary/20">
              {creating ? 'Sending...' : <><Send className="size-3.5" /> Send Announcement</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AnnouncementRow({ announcement }: { announcement: Announcement }) {
  const priority = PRIORITY_CONFIG[announcement.priority] || PRIORITY_CONFIG.normal
  const audience = AUDIENCE_CONFIG[announcement.audience] || AUDIENCE_CONFIG.all
  const AudienceIcon = audience.icon
  const deliveryTotal = Number(announcement.recipientCount || 0)
  const delivered = Number(announcement.deliveredCount || 0)
  const deliveryRate = deliveryTotal > 0 ? Math.round((delivered / deliveryTotal) * 100) : null

  return (
    <div className="group flex items-start gap-3 border-b border-primary/5 px-4 py-3 transition-all last:border-b-0 hover:bg-primary/[0.02]">
      <span className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-lg shadow-sm transition-all group-hover:scale-110',
        announcement.priority === 'urgent'
          ? 'bg-gradient-to-br from-red-500 to-rose-500 text-white'
          : announcement.priority === 'high'
            ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white'
            : 'bg-gradient-to-br from-primary to-teal-600 text-white'
      )}>
        {announcement.priority === 'urgent' ? <AlertTriangle className="size-4.5" /> : announcement.priority === 'high' ? <BarChart3 className="size-4.5" /> : <Megaphone className="size-4.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="flex-1 text-sm font-bold text-foreground min-w-[160px]">{announcement.title}</h3>
          <Badge className={cn('h-5 gap-1 border px-1.5 text-[10px] font-bold', priority.badge)}>
            {priority.label}
          </Badge>
          <span className="flex items-center gap-1 rounded-md border border-primary/5 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            <AudienceIcon className="size-3" /> {audience.label}
          </span>
        </div>

        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{announcement.content}</p>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock3 className="size-3" /> {getTimeAgo(announcement.createdAt)}
          </span>
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3" />
            {announcement.sentAt ? `Sent ${getTimeAgo(announcement.sentAt)}` : announcement.scheduledAt ? `Scheduled ${formatDateTime(announcement.scheduledAt)}` : statusLabel(announcement.status)}
          </span>
          <span className="flex items-center gap-1">
            <UserRoundCheck className="size-3" />
            {deliveryRate === null ? 'Pending' : `${delivered}/${deliveryTotal} (${deliveryRate}%)`}
          </span>
        </div>
      </div>
    </div>
  )
}
