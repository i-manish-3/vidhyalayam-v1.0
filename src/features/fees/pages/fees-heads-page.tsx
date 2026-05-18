'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, DataTable, type Column, type ActionItem, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PlusCircle, DollarSign } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────

type FeeFrequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM'

interface FeeHead {
  id: string
  name: string
  frequency: FeeFrequency
  isActive: boolean
  description?: string
  createdAt?: string
}

// ── Constants ──────────────────────────────────────────────────────────

const FREQUENCY_OPTIONS: { value: FeeFrequency; label: string }[] = [
  { value: 'ONE_TIME', label: 'One Time' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half Yearly' },
  { value: 'YEARLY', label: 'Yearly' },
  { value: 'CUSTOM', label: 'Custom' },
]

const FREQUENCY_BADGE_CLASSES: Record<FeeFrequency, string> = {
  MONTHLY: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  YEARLY: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
  ONE_TIME: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  QUARTERLY: 'bg-teal-100 text-teal-800 hover:bg-teal-100',
  HALF_YEARLY: 'bg-pink-100 text-pink-800 hover:bg-pink-100',
  CUSTOM: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
}

function getFrequencyLabel(freq: FeeFrequency): string {
  return FREQUENCY_OPTIONS.find((f) => f.value === freq)?.label || freq
}

// ── Component ──────────────────────────────────────────────────────────

export function FeesHeadsPage() {
  const { toast } = useToast()

  // Data
  const [feeHeads, setFeeHeads] = useState<FeeHead[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog state
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    frequency: 'MONTHLY' as FeeFrequency,
    description: '',
    isActive: true,
  })

  // Fetch fee heads
  const fetchFeeHeads = useCallback(async () => {
    try {
      const data = await api.get<{ heads: FeeHead[] }>('/api/school/fees/heads')
      setFeeHeads(data.heads || [])
    } catch {
      toast({ title: 'Couldn\'t Load Fee Heads', description: 'We couldn\'t load the fee heads. Please refresh the page.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchFeeHeads()
  }, [fetchFeeHeads])

  // Add fee head
  const handleAdd = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Missing Information', description: 'Please enter the name.', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      await api.post('/api/school/fees/heads', form)
      toast({ title: 'Success', description: 'Fee head added successfully' })
      setShowAdd(false)
      setForm({ name: '', frequency: 'MONTHLY', description: '', isActive: true })
      fetchFeeHeads()
    } catch (err) {
      toast({
        title: 'Something Went Wrong',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  // Toggle active status
  const handleToggleActive = async (head: FeeHead) => {
    try {
      await api.patch(`/api/school/fees/heads/${head.id}`, { isActive: !head.isActive })
      toast({ title: 'Success', description: `Fee head ${head.isActive ? 'deactivated' : 'activated'}` })
      fetchFeeHeads()
    } catch (err) {
      toast({
        title: 'Something Went Wrong',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    }
  }

  // Table columns
  const columns: Column<FeeHead>[] = [
    {
      key: 'name',
      label: 'Name',
      render: (h: FeeHead) => (
        <span className="font-medium">{h.name}</span>
      ),
    },
    {
      key: 'frequency',
      label: 'Frequency',
      render: (h: FeeHead) => (
        <Badge className={FREQUENCY_BADGE_CLASSES[h.frequency]} variant="secondary">
          {getFrequencyLabel(h.frequency)}
        </Badge>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (h: FeeHead) => (
        <Badge variant={h.isActive ? 'default' : 'destructive'}>
          {h.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      className: 'hidden md:table-cell',
      render: (h: FeeHead) => (
        <span className="text-muted-foreground text-sm">{h.description || '—'}</span>
      ),
    },
  ]

  const actions = (head: FeeHead): ActionItem[] => [
    {
      label: head.isActive ? 'Deactivate' : 'Activate',
      onClick: () => handleToggleActive(head),
    },
  ]

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return <LoadingState />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Heads"
        description={`${feeHeads.length} fee heads configured`}
        action={{
          label: 'Add Fee Head',
          icon: PlusCircle,
          onClick: () => setShowAdd(true),
        }}
      />

      {feeHeads.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title="No Fee Heads"
          description="Create fee heads to define the types of fees your school collects (e.g., Tuition, Transport, Lab Fee)."
          action={{ label: 'Add Fee Head', onClick: () => setShowAdd(true) }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={feeHeads as unknown as Record<string, unknown>[]}
          searchKey="name"
          searchPlaceholder="Search fee heads..."
          actions={(item) => actions(item as unknown as FeeHead)}
          isLoading={loading}
        />
      )}

      {/* Add Fee Head Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Fee Head</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fee-head-name">Name</Label>
              <Input
                id="fee-head-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g., Tuition Fee, Transport Fee"
              />
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select
                value={form.frequency}
                onValueChange={(v) => setForm((f) => ({ ...f, frequency: v as FeeFrequency }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fee-head-desc">Description</Label>
              <Input
                id="fee-head-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="fee-head-active" className="cursor-pointer">Active</Label>
                <p className="text-xs text-muted-foreground">Enable this fee head for use in fee groups</p>
              </div>
              <Switch
                id="fee-head-active"
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={saving || !form.name.trim()}>
              {saving ? 'Adding...' : 'Add Fee Head'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
