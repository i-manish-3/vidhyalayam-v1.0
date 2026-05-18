'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PlusCircle, Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Announcement {
  id: string
  title: string
  content: string
  audience: string
  priority: string
  createdAt: string
}

const audienceBadge = (audience: string) => {
  const colors: Record<string, string> = {
    all: 'bg-teal-100 text-teal-800 hover:bg-teal-100',
    teachers: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
    students: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
    parents: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  }
  const labels: Record<string, string> = { all: 'Everyone', teachers: 'Teachers', students: 'Students', parents: 'Parents' }
  return <Badge className={colors[audience] || colors.all}>{labels[audience] || audience}</Badge>
}

const priorityBadge = (priority: string) => {
  const colors: Record<string, string> = {
    normal: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
    high: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
    urgent: 'bg-red-100 text-red-800 hover:bg-red-100',
  }
  return <Badge className={colors[priority] || colors.normal}>{priority.charAt(0).toUpperCase() + priority.slice(1)}</Badge>
}

const priorityBorder: Record<string, string> = {
  normal: 'border-l-gray-400',
  high: 'border-l-amber-500',
  urgent: 'border-l-red-500',
}

export function AnnouncementsPage() {
  const { toast } = useToast()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', audience: 'all', priority: 'normal' })

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ announcements: Announcement[] }>('/api/school/announcements')
      setAnnouncements(res.announcements || [])
    } catch {
      toast({ title: "Couldn't Load Announcements", description: "We couldn't load the announcements. Please refresh the page.", variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAdd = async () => {
    try {
      await api.post('/api/school/announcements', form)
      toast({ title: 'Success', description: 'Announcement created' })
      setShowAdd(false)
      setForm({ title: '', content: '', audience: 'all', priority: 'normal' })
      fetchData()
    } catch (err) {
      toast({ title: "Couldn't Create Announcement", description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader title="Announcements" description={`${announcements.length} announcements`} action={{ label: 'Add Announcement', icon: PlusCircle, onClick: () => setShowAdd(true) }} />

      {announcements.length === 0 ? (
        <EmptyState icon={Megaphone} title="No Announcements" description="Create announcements to broadcast important updates." action={{ label: 'Add Announcement', onClick: () => setShowAdd(true) }} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {announcements.map(a => (
            <Card key={a.id} className={cn('border-l-4', priorityBorder[a.priority] || priorityBorder.normal)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base line-clamp-2">{a.title}</CardTitle>
                  {priorityBadge(a.priority)}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {audienceBadge(a.audience)}
                  <span className="text-xs text-muted-foreground">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}</span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-3">{a.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Announcement</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Announcement title" /></div>
            <div className="space-y-2"><Label>Content</Label><Textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="Write announcement content..." rows={4} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Audience</Label>
                <Select value={form.audience} onValueChange={v => setForm(f => ({ ...f, audience: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Everyone</SelectItem>
                    <SelectItem value="teachers">Teachers</SelectItem>
                    <SelectItem value="students">Students</SelectItem>
                    <SelectItem value="parents">Parents</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!form.title || !form.content}>Create Announcement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
