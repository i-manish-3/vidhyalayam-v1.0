'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { PlusCircle, Bell, BellOff, Archive, Search, Inbox, MailOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

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

const typeBadge = (type: string) => {
  const colors: Record<string, string> = {
    info: 'border-teal-200 bg-teal-50 text-teal-700',
    fee: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    attendance: 'border-sky-200 bg-sky-50 text-sky-700',
    exam: 'border-violet-200 bg-violet-50 text-violet-700',
    announcement: 'border-blue-200 bg-blue-50 text-blue-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    alert: 'border-red-200 bg-red-50 text-red-700',
    error: 'border-red-200 bg-red-50 text-red-700',
    general: 'border-border bg-muted/40 text-muted-foreground',
  }
  return <Badge variant="outline" className={cn('capitalize', colors[type] || colors.general)}>{type}</Badge>
}

const priorityBadge = (priority?: string) => {
  if (!priority || priority === 'normal') return null
  const colors: Record<string, string> = {
    urgent: 'border-red-200 bg-red-50 text-red-700',
    high: 'border-amber-200 bg-amber-50 text-amber-700',
    low: 'border-border bg-muted/40 text-muted-foreground',
  }
  return <Badge variant="outline" className={cn('capitalize', colors[priority] || colors.low)}>{priority}</Badge>
}

function formatDateTime(value?: string) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function NotificationsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', message: '', type: 'general' })

  // Filters.
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
      if (archiveFilter === 'archived') {
        params.archivedOnly = 'true'
      } else if (archiveFilter === 'all') {
        params.includeArchived = 'true'
      }
      const res = await api.get<{ notifications: Notification[] }>('/api/school/notifications', params)
      setNotifications(res.notifications || [])
    } catch {
      toast({ title: 'Couldn\'t Load Notifications', description: 'We couldn\'t load the notifications. Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast, search, typeFilter, priorityFilter, readFilter, archiveFilter])

  // Debounce search; immediate for select changes.
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description="Review alerts, reminders, and system messages."
        extraActions={
          unreadCount > 0 ? (
            <Button variant="outline" onClick={handleMarkAllRead} className="gap-2">
              <BellOff className="size-4" />
              Mark All Read
            </Button>
          ) : null
        }
        action={{ label: 'Add Notification', icon: PlusCircle, onClick: () => setShowAdd(true) }}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 shadow-sm">
        {[
          { label: 'Showing', value: notifications.length.toLocaleString('en-IN') },
          { label: 'Unread', value: unreadCount.toLocaleString('en-IN') },
          { label: 'Read', value: (notifications.length - unreadCount).toLocaleString('en-IN') },
          { label: 'Archived', value: notifications.filter(n => n.archivedAt).length.toLocaleString('en-IN') },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 rounded-md bg-muted/35 px-2.5 py-1.5 text-xs">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-semibold tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>

      <Card className="gap-0 py-0 shadow-sm">
        <CardContent className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(240px,1fr)_150px_150px_170px_170px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search notifications..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <Select value={readFilter} onValueChange={setReadFilter}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
          <Select value={archiveFilter} onValueChange={(value) => setArchiveFilter(value as 'active' | 'archived' | 'all')}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Archive" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="fee">Fee</SelectItem>
              <SelectItem value="attendance">Attendance</SelectItem>
              <SelectItem value="exam">Exam</SelectItem>
              <SelectItem value="announcement">Announcement</SelectItem>
              <SelectItem value="alert">Alert</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="border-b bg-muted/30 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Inbox className="size-4 text-primary" />
            Notification Inbox
            {!loading && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {notifications.length.toLocaleString('en-IN')} records
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState />
          ) : notifications.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Bell}
                title="No Notifications"
                description="Nothing matches your filters yet."
                action={{ label: 'Add Notification', onClick: () => setShowAdd(true) }}
              />
            </div>
          ) : (
            <ScrollArea className="max-h-[640px]">
              <div className="divide-y">
                {notifications.map(n => (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      'group flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/35',
                      !n.isRead && 'bg-primary/5'
                    )}
                    onClick={() => handleMarkRead(n)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        void handleMarkRead(n)
                      }
                    }}
                  >
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-md',
                        !n.isRead ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {n.isRead ? <MailOpen className="size-4" /> : <Bell className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={cn('truncate text-sm font-medium', !n.isRead && 'font-semibold')}>
                          {n.title}
                        </span>
                        {typeBadge(n.type)}
                        {priorityBadge(n.priority)}
                        {n.archivedAt && (
                          <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
                            Archived
                          </Badge>
                        )}
                        {!n.isRead && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                      </span>
                      <span className="line-clamp-2 block text-sm text-muted-foreground">{n.message}</span>
                      <span className="block text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span>
                    </span>
                    {n.archivedAt ? null : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100"
                        aria-label="Archive notification"
                        onClick={(e) => { e.stopPropagation(); void handleArchive(n.id) }}
                      >
                        <Archive className="size-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Notification</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="notification-title">Title</Label>
              <Input
                id="notification-title"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Enter notification title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notification-message">Message</Label>
              <Textarea
                id="notification-message"
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Write the message"
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!form.title.trim()} className="gap-2">
              <PlusCircle className="size-4" />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
