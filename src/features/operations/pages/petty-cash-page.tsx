'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, DataTable, type Column, type ActionItem, StatsCard, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PlusCircle, Wallet, TrendingUp, TrendingDown, Info } from 'lucide-react'

interface PettyCashEntry {
  id: string
  date: string
  description: string
  category: string
  type: 'CREDIT' | 'DEBIT'
  amount: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  createdBy?: string
}

const CATEGORIES = ['Stationery', 'Maintenance', 'Transport', 'Refreshments', 'Utilities', 'Miscellaneous']

export function PettyCashPage() {
  const { toast } = useToast()
  const [entries, setEntries] = useState<PettyCashEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ amount: '', type: 'DEBIT', category: '', description: '' })

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ entries: PettyCashEntry[] }>('/api/school/petty-cash')
      setEntries(res.entries || [])
    } catch {
      toast({ title: 'Couldn\'t Load Petty Cash', description: 'We couldn\'t load the petty cash entries. Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const totalCredits = entries.filter(e => e.type === 'CREDIT' && e.status === 'APPROVED').reduce((s, e) => s + e.amount, 0)
  const totalDebits = entries.filter(e => e.type === 'DEBIT' && e.status === 'APPROVED').reduce((s, e) => s + e.amount, 0)
  const balance = totalCredits - totalDebits

  const handleAdd = async () => {
    try {
      await api.post('/api/school/petty-cash', {
        amount: Number(form.amount), type: form.type, category: form.category, description: form.description,
      })
      toast({ title: 'Success', description: 'Entry added' })
      setShowAdd(false)
      setForm({ amount: '', type: 'DEBIT', category: '', description: '' })
      fetchData()
    } catch (err) {
      toast({ title: 'Something Went Wrong', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  const handleApprove = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await api.patch(`/api/school/petty-cash`, { id, status })
      toast({ title: 'Success', description: `Entry ${status.toLowerCase()}` })
      fetchData()
    } catch (err) {
      toast({ title: 'Something Went Wrong', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  const columns: Column<PettyCashEntry>[] = [
    { key: 'date', label: 'Date', render: (e: PettyCashEntry) => e.date ? new Date(e.date).toLocaleDateString() : '-' },
    { key: 'description', label: 'Description', render: (e: PettyCashEntry) => <span className="max-w-[200px] truncate block">{e.description || '-'}</span> },
    { key: 'category', label: 'Category', render: (e: PettyCashEntry) => <Badge variant="secondary">{e.category || '-'}</Badge> },
    { key: 'type', label: 'Type', render: (e: PettyCashEntry) => (
      <Badge className={e.type === 'CREDIT' ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100' : 'bg-red-100 text-red-800 hover:bg-red-100'}>
        {e.type === 'CREDIT' ? 'Credit' : 'Debit'}
      </Badge>
    )},
    { key: 'amount', label: 'Amount', render: (e: PettyCashEntry) => <span className="font-semibold">₹{e.amount?.toLocaleString() || 0}</span> },
    { key: 'status', label: 'Status', render: (e: PettyCashEntry) => {
      const colors: Record<string, string> = { PENDING: 'bg-amber-100 text-amber-800 hover:bg-amber-100', APPROVED: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100', REJECTED: 'bg-red-100 text-red-800 hover:bg-red-100' }
      return <Badge className={colors[e.status] || ''}>{e.status}</Badge>
    }},
    { key: 'createdBy', label: 'Created By', render: (e: PettyCashEntry) => e.createdBy || '-' },
  ]

  const actions = (e: PettyCashEntry): ActionItem[] => {
    const items: ActionItem[] = [{ label: 'View Details', onClick: () => {} }]
    if (e.status === 'PENDING') {
      items.push({ label: 'Approve', onClick: () => handleApprove(e.id, 'APPROVED') })
      items.push({ label: 'Reject', onClick: () => handleApprove(e.id, 'REJECTED'), variant: 'destructive' })
    }
    return items
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader title="Petty Cash" description="Track small expenses and credits" action={{ label: 'Add Entry', icon: PlusCircle, onClick: () => setShowAdd(true) }} />

      <div className="grid gap-6 sm:grid-cols-3">
        <StatsCard title="Current Balance" value={`₹${balance.toLocaleString()}`} icon={Wallet} />
        <StatsCard title="Total Credits" value={`₹${totalCredits.toLocaleString()}`} icon={TrendingUp} trend={{ value: 0, isPositive: true }} />
        <StatsCard title="Total Debits" value={`₹${totalDebits.toLocaleString()}`} icon={TrendingDown} trend={{ value: 0, isPositive: false }} />
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <Info className="size-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-800">
          <p className="font-medium">Business Rules</p>
          <ul className="mt-1 list-disc list-inside space-y-0.5 text-amber-700">
            <li>Entries created by Admin are auto-approved</li>
            <li>Entries created by Teachers require admin approval</li>
          </ul>
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={Wallet} title="No Petty Cash Entries" description="Start tracking petty cash transactions." action={{ label: 'Add Entry', onClick: () => setShowAdd(true) }} />
      ) : (
        <DataTable columns={columns} data={entries} searchKey="description" searchPlaceholder="Search entries..." actions={actions} />
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Petty Cash Entry</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Amount</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as 'CREDIT' | 'DEBIT' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="CREDIT">Credit</SelectItem><SelectItem value="DEBIT">Debit</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Enter description" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!form.amount || !form.category}>Add Entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
