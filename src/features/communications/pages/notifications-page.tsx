'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { PlusCircle, Bell, BellOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  title: string
  message: string
  type: string
  isRead: boolean
  createdAt: string
}

const typeBadge = (type: string) => {
  const colors: Record<string, string> = {
    info: 'bg-teal-100 text-teal-800 hover:bg-teal-100',
    warning: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
    success: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
    error: 'bg-red-100 text-red-800 hover:bg-red-100',
    general: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
  }
  return <Badge className={colors[type] || colors.general}>{type}</Badge>
}

export function NotificationsPage() {
  const { toast } = useToast()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', message: '', type: 'general' })

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ notifications: Notification[] }>('/api/school/notifications')
      setNotifications(res.notifications || [])
    } catch {
      toast({ title: 'Couldn\'t Load Notifications', description: 'We couldn\'t load the notifications. Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

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

  const handleMarkRead = async (id: string) => {
    try {
      await api.patch(`/api/school/notifications`, { notificationId: id })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
    } catch {
      toast({ title: 'Update Failed', description: 'We couldn\'t update the notification. Please try again.', variant: 'destructive' })
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

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={`${unreadCount} unread`}
        action={{ label: 'Add Notification', icon: PlusCircle, onClick: () => setShowAdd(true) }}
      />

      {unreadCount > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} className="gap-2">
            <BellOff className="size-4" /> Mark All Read
          </Button>
        </div>
      )}

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No Notifications" description="Create notifications to keep everyone informed." action={{ label: 'Add Notification', onClick: () => setShowAdd(true) }} />
      ) : (
        <ScrollArea className="max-h-[600px]">
          <div className="space-y-3">
            {notifications.map(n => (
              <Card
                key={n.id}
                className={cn('cursor-pointer transition-colors hover:bg-muted/30', !n.isRead && 'border-l-4 border-l-primary bg-primary/5')}
                onClick={() => { if (!n.isRead) handleMarkRead(n.id) }}
              >
                <CardContent className="flex items-start gap-4 p-4">
                  <div className={cn('flex size-10 items-center justify-center rounded-full shrink-0', !n.isRead ? 'bg-primary/10' : 'bg-muted')}>
                    <Bell className={cn('size-5', !n.isRead ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('font-medium text-sm', !n.isRead && 'font-semibold')}>{n.title}</span>
                      {typeBadge(n.type)}
                      {!n.isRead && <span className="size-2 rounded-full bg-primary shrink-0" />}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{n.message}</p>
                    <p className="text-xs text-muted-foreground">{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</p>
                  </div>
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
