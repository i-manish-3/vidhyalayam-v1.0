'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, DataTable, type Column, type ActionItem, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { LifeBuoy } from 'lucide-react'
import { STATUS_LABEL, isOpenStatus, type TicketStatus } from '@/lib/support-tickets'

interface SupportTicket {
  id: string
  subject: string
  schoolId: string
  school?: { id: string; name: string }
  category: string
  priority: string
  status: string
  description?: string
  resolution?: string
  createdAt: string
}

export function SupportPage() {
  const { toast } = useToast()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [showResolve, setShowResolve] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [resolution, setResolution] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ tickets: SupportTicket[] }>('/api/super-admin/support-tickets')
      setTickets(res.tickets || [])
    } catch {
      toast({ title: "Couldn't Load Tickets", description: "We couldn't load the tickets. Please refresh the page.", variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const handleResolve = async () => {
    if (!selectedTicket) return
    try {
      await api.patch(`/api/super-admin/support-tickets`, { id: selectedTicket.id, status: 'resolved', resolution })
      toast({ title: 'Success', description: 'Ticket resolved' })
      setShowResolve(false)
      setSelectedTicket(null)
      setResolution('')
      fetchData()
    } catch (err) {
      toast({ title: "Couldn't Resolve Ticket", description: err instanceof Error ? err.message : "Something went wrong. Please try again.", variant: 'destructive' })
    }
  }

  const setStatus = async (ticket: SupportTicket, status: TicketStatus) => {
    try {
      await api.patch(`/api/super-admin/support-tickets`, { id: ticket.id, status })
      toast({ title: 'Updated', description: `Ticket marked ${STATUS_LABEL[status]}.` })
      fetchData()
    } catch (err) {
      toast({ title: "Couldn't update ticket", description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' })
    }
  }

  const priorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      low: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
      medium: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
      high: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
      critical: 'bg-red-100 text-red-800 hover:bg-red-100',
    }
    return <Badge className={colors[priority] || colors.low}>{priority.charAt(0).toUpperCase() + priority.slice(1)}</Badge>
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
      in_progress: 'bg-teal-100 text-teal-800 hover:bg-teal-100',
      resolved: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
      closed: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
    }
    const label = STATUS_LABEL[status as TicketStatus] || status
    return <Badge className={colors[status] || 'bg-gray-100 text-gray-800 hover:bg-gray-100'}>{label}</Badge>
  }

  const columns: Column<SupportTicket>[] = [
    { key: 'subject', label: 'Subject', render: (t: SupportTicket) => <span className="font-medium">{t.subject}</span> },
    { key: 'school', label: 'School', render: (t: SupportTicket) => t.school?.name || '-' },
    { key: 'category', label: 'Category', render: (t: SupportTicket) => <Badge variant="secondary">{t.category || '-'}</Badge> },
    { key: 'priority', label: 'Priority', render: (t: SupportTicket) => priorityBadge(t.priority) },
    { key: 'status', label: 'Status', render: (t: SupportTicket) => statusBadge(t.status) },
  ]

  const actions = (t: SupportTicket): ActionItem[] => {
    const items: ActionItem[] = []
    if (t.status === 'open') {
      items.push({ label: 'Mark In Progress', onClick: () => void setStatus(t, 'in_progress') })
    }
    if (isOpenStatus(t.status)) {
      items.push({ label: 'Resolve', onClick: () => { setSelectedTicket(t); setShowResolve(true) } })
    }
    if (t.status === 'resolved') {
      items.push({ label: 'Close', onClick: () => void setStatus(t, 'closed') })
      items.push({ label: 'Reopen', onClick: () => void setStatus(t, 'open') })
    }
    return items
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader title="Support Tickets" description={`${tickets.length} tickets`} />

      {tickets.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="No Support Tickets" description="Support tickets from schools will appear here." />
      ) : (
        <DataTable columns={columns} data={tickets} searchKey="subject" searchPlaceholder="Search tickets..." actions={actions} />
      )}

      <Dialog open={showResolve} onOpenChange={setShowResolve}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Resolve Ticket</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">{selectedTicket?.subject}</p>
              <p className="text-xs text-muted-foreground">{selectedTicket?.school?.name}</p>
            </div>
            {selectedTicket?.description && (
              <div className="rounded-lg border p-3 bg-muted/50">
                <p className="text-sm">{selectedTicket.description}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Resolution</Label>
              <Textarea value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Describe the resolution..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolve(false)}>Cancel</Button>
            <Button onClick={handleResolve} disabled={!resolution.trim()}>Resolve Ticket</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
