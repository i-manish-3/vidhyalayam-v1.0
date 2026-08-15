'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  PlusCircle,
  Bell,
  BellRing,
  BellOff,
  Archive,
  Search,
  Inbox,
  MailOpen,
  X,
  Info,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Megaphone,
  GraduationCap,
  Calculator,
  Clock,
  Flame,
  ArrowDown,
} from 'lucide-react'

interface Notification {
  id: string
  title: string
  message: string
  type: string
  priority?: string
  module?: string | null
  actionUrl?: string | null
  isRead: boolean
  createdAt: string
  archivedAt?: string | null
}

const TYPE_CONFIG: Record<string, { icon: typeof Bell; gradient: string; label: string; dot: string }> = {
  info: { icon: Info, gradient: 'from-teal-500 to-cyan-500', label: 'Info', dot: 'bg-teal-500' },
  fee: { icon: Calculator, gradient: 'from-indigo-500 to-violet-500', label: 'Fee', dot: 'bg-indigo-500' },
  attendance: { icon: Clock, gradient: 'from-sky-500 to-blue-500', label: 'Attendance', dot: 'bg-sky-500' },
  exam: { icon: GraduationCap, gradient: 'from-violet-500 to-fuchsia-500', label: 'Exam', dot: 'bg-violet-500' },
  announcement: { icon: Megaphone, gradient: 'from-blue-500 to-cyan-500', label: 'Announcement', dot: 'bg-blue-500' },
  warning: { icon: AlertTriangle, gradient: 'from-amber-500 to-orange-500', label: 'Warning', dot: 'bg-amber-500' },
  success: { icon: CheckCircle2, gradient: 'from-emerald-500 to-teal-500', label: 'Success', dot: 'bg-emerald-500' },
  alert: { icon: AlertTriangle, gradient: 'from-red-500 to-rose-500', label: 'Alert', dot: 'bg-red-500' },
  error: { icon: XCircle, gradient: 'from-red-600 to-rose-600', label: 'Error', dot: 'bg-red-600' },
  general: { icon: Bell, gradient: 'from-primary to-teal-600', label: 'General', dot: 'bg-primary' },
}

const PRIORITY_CONFIG: Record<string, { badge: string; icon: typeof Flame; label: string }> = {
  urgent: { badge: 'bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400', icon: Flame, label: 'Urgent' },
  high: { badge: 'bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400', icon: AlertTriangle, label: 'High' },
  normal: { badge: 'bg-primary/5 text-muted-foreground border-primary/10', icon: Bell, label: 'Normal' },
  low: { badge: 'bg-muted/30 text-muted-foreground border-border', icon: ArrowDown, label: 'Low' },
}

function formatDateTime(value?: string) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
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

export function NotificationsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', message: '', type: 'general' })

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [readFilter, setReadFilter] = useState('all')
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active')

  const fetchData = useCallback(async () => {
    try {
      const params: Record<string, string> = { limit: '50' }
      if (search.trim()) params.search = search.trim()
      if (typeFilter !== 'all') params.type = typeFilter
      if (priorityFilter !== 'all') params.priority = priorityFilter
      if (readFilter !== 'all') params.isRead = readFilter === 'read' ? 'true' : 'false'
      if (archiveFilter === 'archived') params.archivedOnly = 'true'
      else if (archiveFilter === 'all') params.includeArchived = 'true'
      const res = await api.get<{ notifications: Notification[] }>('/api/school/notifications', params)
      setNotifications(res.notifications || [])
    } catch {
      toast({ title: 'Couldn\'t Load Notifications', description: 'We couldn\'t load the notifications. Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast, search, typeFilter, priorityFilter, readFilter, archiveFilter])

  useEffect(() => {
    const t = setTimeout(() => { fetchData() }, search ? 350 : 0)
    return () => clearTimeout(t)
  }, [fetchData, search])

  const handleAdd = async () => {
    try {
      await api.post('/api/school/notifications', form)
      toast({ title: 'Success', description: 'Notification created' })
      setShowAdd(false)
      setForm({ title: '', message: '', type: 'general' })
      fetchData()
    } catch (err) {
      toast({ title: 'Something Went Wrong', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  const handleMarkRead = async (n: Notification) => {
    try {
      if (!n.isRead) {
        await api.patch(`/api/school/notifications`, { notificationId: n.id })
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x))
      }
      if (n.actionUrl) router.push(n.actionUrl)
    } catch {
      toast({ title: 'Update Failed', description: 'We couldn\'t update the notification. Please try again.', variant: 'destructive' })
    }
  }

  const handleArchive = async (id: string) => {
    try {
      await api.delete(`/api/school/notifications/${id}`)
      setNotifications(prev => prev.filter(x => x.id !== id))
    } catch {
      toast({ title: 'Update Failed', description: 'We couldn\'t archive the notification. Please try again.', variant: 'destructive' })
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await api.patch(`/api/school/notifications`, { markAllRead: true })
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
      toast({ title: 'Success', description: 'All marked as read' })
    } catch {
      toast({ title: 'Update Failed', description: 'We couldn\'t mark notifications as read. Please try again.', variant: 'destructive' })
    }
  }

  const unreadCount = notifications.filter(n => !n.isRead).length
  const archivedCount = notifications.filter(n => n.archivedAt).length
  const readCount = notifications.length - unreadCount - archivedCount
  const hasActiveFilters = search || typeFilter !== 'all' || priorityFilter !== 'all' || readFilter !== 'all' || archiveFilter !== 'active'

  const clearFilters = () => {
    setSearch('')
    setTypeFilter('all')
    setPriorityFilter('all')
    setReadFilter('all')
    setArchiveFilter('active')
  }

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
              <Bell className="size-5 text-white" />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Notifications</h1>
              <p className="mt-0.5 text-xs text-white/75">Alerts, reminders, and system messages</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button variant="secondary" size="sm" style={{ backgroundColor: 'white', color: 'var(--primary)' }} onClick={handleMarkAllRead} className="h-8 gap-1.5 text-xs shadow-md">
                <BellOff className="size-3.5" /> Mark Read
              </Button>
            )}
            <Button variant="secondary" size="sm" style={{ backgroundColor: 'white', color: 'var(--primary)' }} onClick={() => setShowAdd(true)} className="h-8 gap-1.5 text-xs shadow-md">
              <PlusCircle className="size-3.5" /> Add
            </Button>
          </div>
        </div>
      </div>

      {/* Slim Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Total', value: notifications.length, icon: Inbox, gradient: 'from-primary to-teal-600', text: 'text-foreground' },
          { label: 'Read', value: readCount, icon: MailOpen, gradient: 'from-sky-500 to-blue-500', text: 'text-sky-600 dark:text-sky-400' },
          { label: 'Unread', value: unreadCount, icon: Bell, gradient: 'from-amber-500 to-orange-500', text: 'text-amber-600 dark:text-amber-400' },
          { label: 'Archived', value: archivedCount, icon: Archive, gradient: 'from-violet-500 to-fuchsia-500', text: 'text-violet-600 dark:text-violet-400' },
        ].map(s => (
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

          <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_1fr_1fr_1fr_1fr]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search notifications..."
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
            <Select value={readFilter} onValueChange={setReadFilter}>
              <SelectTrigger className="h-9 border-primary/15 bg-background"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="unread"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-amber-500" />Unread</span></SelectItem>
                <SelectItem value="read"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-sky-500" />Read</span></SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 border-primary/15 bg-background"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(TYPE_CONFIG).map(([k, c]) => (
                  <SelectItem key={k} value={k}><span className="flex items-center gap-2"><span className={cn('size-2 rounded-full', c.dot)} />{c.label}</span></SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-9 border-primary/15 bg-background"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="urgent"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-red-500" />Urgent</span></SelectItem>
                <SelectItem value="high"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-amber-500" />High</span></SelectItem>
                <SelectItem value="normal"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary" />Normal</span></SelectItem>
                <SelectItem value="low"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-muted-foreground" />Low</span></SelectItem>
              </SelectContent>
            </Select>
            <Select value={archiveFilter} onValueChange={(v) => setArchiveFilter(v as 'active' | 'archived' | 'all')}>
              <SelectTrigger className="h-9 border-primary/15 bg-background"><SelectValue placeholder="Archive" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500" />Active</span></SelectItem>
                <SelectItem value="archived"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-violet-500" />Archived</span></SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 lg:justify-end">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground/80">{notifications.length}</span> shown
            </p>
            {hasActiveFilters && (
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20" onClick={clearFilters}>
                <X className="size-3.5" /> Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Inbox */}
      <div className="overflow-hidden rounded-xl border border-primary/10 bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-primary/10 bg-gradient-to-r from-primary/[0.04] via-teal-600/[0.03] to-cyan-600/[0.04] px-4 py-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-teal-600 text-white shadow-sm">
            <Inbox className="size-3.5" />
          </span>
          <span className="text-xs font-bold text-foreground/80">Inbox</span>
          <Badge variant="secondary" className="h-4 gap-1 border-primary/20 bg-primary/10 px-1.5 text-[9px] font-bold text-primary ml-auto">
            {notifications.length}
          </Badge>
        </div>

        <div className="p-0">
          {loading ? (
            <LoadingState />
          ) : notifications.length === 0 ? (
            <div className="px-4 py-10">
              <EmptyState icon={Bell} title="No Notifications" description="Nothing matches your filters yet."
                action={hasActiveFilters ? { label: 'Clear Filters', onClick: clearFilters } : { label: 'Add Notification', onClick: () => setShowAdd(true) }} />
            </div>
          ) : (
            <ScrollArea className="max-h-[540px]">
              <div>
                {notifications.map(n => {
                  const typeCfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.general
                  const TypeIcon = typeCfg.icon
                  const priorityCfg = n.priority && n.priority !== 'normal' ? PRIORITY_CONFIG[n.priority] : null
                  const PrioIcon = priorityCfg?.icon
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        'group flex cursor-pointer items-start gap-3 border-b border-primary/5 px-4 py-2.5 text-left transition-all last:border-b-0 hover:bg-primary/[0.02]',
                        !n.isRead && 'bg-gradient-to-r from-primary/[0.02] via-transparent to-transparent'
                      )}
                      onClick={() => handleMarkRead(n)}
                    >
                      <span className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-lg shadow-sm transition-all',
                        !n.isRead ? cn('bg-gradient-to-br text-white', typeCfg.gradient) : 'bg-muted/50 text-muted-foreground'
                      )}>
                        <TypeIcon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn('truncate text-sm', !n.isRead ? 'font-bold text-foreground' : 'font-medium text-foreground/70')}>
                            {n.title}
                          </span>
                          {!n.isRead && <span className="size-2 shrink-0 rounded-full bg-primary shadow-sm" />}
                        </div>
                        <p className={cn('line-clamp-1 text-xs leading-relaxed', !n.isRead ? 'text-foreground/70' : 'text-muted-foreground')}>
                          {n.message}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="size-2.5" />
                            {getTimeAgo(n.createdAt)}
                          </span>
                          {/* Type dot */}
                          <span className={cn('size-1.5 rounded-full', typeCfg.dot)} />
                          <span className="text-[10px] font-medium text-muted-foreground">{typeCfg.label}</span>
                          {priorityCfg && (
                            <Badge className={cn('h-4 gap-0.5 border px-1.5 text-[8px] font-bold', priorityCfg.badge)}>
                              {PrioIcon && <PrioIcon className="size-2.5" />}
                              {priorityCfg.label}
                            </Badge>
                          )}
                          {n.archivedAt && (
                            <Badge className="h-4 gap-0.5 border-violet-500/20 bg-violet-500/5 px-1.5 text-[8px] text-violet-600 dark:text-violet-300">
                              <Archive className="size-2" />Archived
                            </Badge>
                          )}
                        </div>
                      </div>
                      {!n.archivedAt && (
                        <Button
                          variant="ghost" size="icon"
                          className="size-7 shrink-0 self-start text-muted-foreground/50 opacity-100 transition-all hover:scale-105 hover:bg-violet-500/10 hover:text-violet-600 lg:opacity-0 lg:group-hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); void handleArchive(n.id) }}
                        >
                          <Archive className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-emerald-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <PlusCircle className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">Add Notification</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">Create a new notification.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.055] p-4 sm:p-5">
            {/* Notification details */}
            <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10 sm:p-5">
              <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
              <div className="relative mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm"><Bell className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">Notification details</h3><p className="text-[10px] text-muted-foreground">Title and message recipients will see</p></div>
              </div>
              <div className="relative space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Title</Label>
                  <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Enter title" className="h-9 bg-white shadow-sm dark:bg-input/30" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Message</Label>
                  <Textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Write the message" rows={3} className="resize-none bg-white shadow-sm dark:bg-input/30" />
                </div>
              </div>
            </section>

            {/* Type */}
            <section className="relative overflow-hidden rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 p-4 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10 sm:p-5">
              <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-violet-200/35 blur-xl dark:bg-violet-500/15" />
              <div className="relative mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm"><BellRing className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">Type</h3><p className="text-[10px] text-muted-foreground">Categorizes the notification in the inbox</p></div>
              </div>
              <div className="relative space-y-2">
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="h-9 bg-white shadow-sm dark:bg-input/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_CONFIG).map(([k, c]) => (
                      <SelectItem key={k} value={k}><span className="flex items-center gap-2"><span className={cn('size-2 rounded-full', c.dot)} />{c.label}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.type && TYPE_CONFIG[form.type] && (
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={cn('size-1.5 rounded-full', TYPE_CONFIG[form.type].dot)} />
                    Showing as a <span className="font-medium text-foreground">{TYPE_CONFIG[form.type].label}</span> notification
                  </p>
                )}
              </div>
            </section>
          </div>

          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={handleAdd} disabled={!form.title.trim()}>
              <PlusCircle className="size-3.5" />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
