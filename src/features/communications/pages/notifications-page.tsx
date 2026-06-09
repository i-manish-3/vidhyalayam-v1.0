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
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PlusCircle, Bell, BellOff, Archive, Search } from 'lucide-react'
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
}

const typeBadge = (type: string) => {
  const colors: Record<string, string> = {
    info: 'bg-teal-100 text-teal-800 hover:bg-teal-100',
    fee: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-100',
    attendance: 'bg-sky-100 text-sky-800 hover:bg-sky-100',
    exam: 'bg-violet-100 text-violet-800 hover:bg-violet-100',
    announcement: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
    warning: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
    success: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
    alert: 'bg-red-100 text-red-800 hover:bg-red-100',
    error: 'bg-red-100 text-red-800 hover:bg-red-100',
    general: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
  }
  return <Badge className={colors[type] || colors.general}>{type}</Badge>
}

const priorityBadge = (priority?: string) => {
  if (!priority || priority === 'normal') return null
  const colors: Record<string, string> = {
    urgent: 'bg-red-500 text-white hover:bg-red-500',
    high: 'bg-amber-500 text-white hover:bg-amber-500',
    low: 'bg-muted text-muted-foreground hover:bg-muted',
  }
  return <Badge className={colors[priority] || colors.low}>{priority}</Badge>
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

  const fetchData = useCallback(async () => {
    try {
      const params: Record<string, string> = { limit: '50' }
      if (search.trim()) params.search = search.trim()
      if (typeFilter !== 'all') params.type = typeFilter
      if (priorityFilter !== 'all') params.priority = priorityFilter
      if (readFilter !== 'all') params.isRead = readFilter === 'read' ? 'true' : 'false'
      const res = await api.get<{ notifications: Notification[] }>('/api/school/notifications', params)
      setNotifications(res.notifications || [])
    } catch {
      toast({ title: 'Couldn\'t Load Notifications', description: 'We couldn\'t load the notifications. Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast, search, typeFilter, priorityFilter, readFilter])

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
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={`${unreadCount} unread`}
        action={{ label: 'Add Notification', icon: PlusCircle, onClick: () => setShowAdd(true) }}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search notifications…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={readFilter} onValueChange={setReadFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
            <SelectItem value="read">Read</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
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
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} className="gap-2">
            <BellOff className="size-4" /> Mark All Read
          </Button>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No Notifications" description="Nothing matches your filters yet." action={{ label: 'Add Notification', onClick: () => setShowAdd(true) }} />
      ) : (
        <ScrollArea className="max-h-[600px]">
          <div className="space-y-3">
            {notifications.map(n => (
              <Card
                key={n.id}
                className={cn('group cursor-pointer transition-colors hover:bg-muted/30', !n.isRead && 'border-l-4 border-l-primary bg-primary/5')}
                onClick={() => handleMarkRead(n)}
              >
                <CardContent className="flex items-start gap-4 p-4">
                  <div className={cn('flex size-10 items-center justify-center rounded-full shrink-0', !n.isRead ? 'bg-primary/10' : 'bg-muted')}>
                    <Bell className={cn('size-5', !n.isRead ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('font-medium text-sm', !n.isRead && 'font-semibold')}>{n.title}</span>
                      {typeBadge(n.type)}
                      {priorityBadge(n.priority)}
                      {!n.isRead && <span className="size-2 rounded-full bg-primary shrink-0" />}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{n.message}</p>
                    <p className="text-xs text-muted-foreground">{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Archive notification"
                    onClick={(e) => { e.stopPropagation(); handleArchive(n.id) }}
                  >
                    <Archive className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Notification</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Message</Label><Input value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Button onClick={handleAdd} disabled={!form.title}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
