'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, DataTable, type Column, type ActionItem, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PlusCircle, Package } from 'lucide-react'

interface InventoryItem {
  id: string
  name: string
  category: string
  quantity: number
  unit: string
  unitPrice: number
  totalPrice: number
  condition: string
  location: string
}

const CATEGORIES = ['Furniture', 'Electronics', 'Stationery', 'Sports', 'Lab Equipment', 'Cleaning', 'Other']
const CONDITIONS = ['New', 'Good', 'Fair', 'Poor', 'Damaged']

export function InventoryPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', category: '', quantity: '', unit: '', unitPrice: '', condition: 'New', location: '' })

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ items: InventoryItem[] }>('/api/school/inventory')
      setItems(res.items || [])
    } catch {
      toast({ title: 'Couldn\'t Load Inventory', description: 'We couldn\'t load the inventory. Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPrice = Number(form.quantity || 0) * Number(form.unitPrice || 0)

  const handleAdd = async () => {
    try {
      await api.post('/api/school/inventory', {
        name: form.name, category: form.category, quantity: Number(form.quantity),
        unit: form.unit, unitPrice: Number(form.unitPrice), totalPrice,
        condition: form.condition, location: form.location,
      })
      toast({ title: 'Success', description: 'Item added' })
      setShowAdd(false)
      setForm({ name: '', category: '', quantity: '', unit: '', unitPrice: '', condition: 'New', location: '' })
      fetchData()
    } catch (err) {
      toast({ title: 'Something Went Wrong', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  const conditionBadge = (cond: string) => {
    const colors: Record<string, string> = {
      New: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
      Good: 'bg-teal-100 text-teal-800 hover:bg-teal-100',
      Fair: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
      Poor: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
      Damaged: 'bg-red-100 text-red-800 hover:bg-red-100',
    }
    return <Badge className={colors[cond] || ''}>{cond}</Badge>
  }

  const columns: Column<InventoryItem>[] = [
    { key: 'name', label: 'Name', render: (i: InventoryItem) => <span className="font-medium">{i.name}</span> },
    { key: 'category', label: 'Category', render: (i: InventoryItem) => <Badge variant="secondary">{i.category}</Badge> },
    { key: 'quantity', label: 'Quantity', render: (i: InventoryItem) => `${i.quantity} ${i.unit || ''}` },
    { key: 'unitPrice', label: 'Unit Price', render: (i: InventoryItem) => `₹${i.unitPrice?.toLocaleString() || 0}` },
    { key: 'totalPrice', label: 'Total Price', render: (i: InventoryItem) => <span className="font-semibold">₹{i.totalPrice?.toLocaleString() || 0}</span> },
    { key: 'condition', label: 'Condition', render: (i: InventoryItem) => conditionBadge(i.condition || 'New') },
    { key: 'location', label: 'Location', render: (i: InventoryItem) => i.location || '-' },
  ]

  const actions = (_i: InventoryItem): ActionItem[] => [
    { label: 'View Details', onClick: () => {} },
    { label: 'Edit', onClick: () => {} },
  ]

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" description={`${items.length} items`} action={{ label: 'Add Item', icon: PlusCircle, onClick: () => setShowAdd(true) }} />

      {items.length === 0 ? (
        <EmptyState icon={Package} title="No Inventory Items" description="Add inventory items to track school assets." action={{ label: 'Add Item', onClick: () => setShowAdd(true) }} />
      ) : (
        <DataTable columns={columns} data={items} searchKey="name" searchPlaceholder="Search inventory..." actions={actions} />
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Inventory Item</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Item Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Quantity</Label><Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Unit</Label><Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="pcs, kg, etc." /></div>
              <div className="space-y-2"><Label>Unit Price</Label><Input type="number" value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Condition</Label>
                <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Location</Label><Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Room / Shelf" /></div>
            </div>
            {totalPrice > 0 && (
              <div className="rounded-lg border p-3 bg-muted/50">
                <div className="flex justify-between text-sm"><span>Total Price</span><span className="font-semibold">₹{totalPrice.toLocaleString()}</span></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!form.name || !form.category}>Add Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
