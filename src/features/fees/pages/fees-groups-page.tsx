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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PlusCircle, Layers, Tag } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────

type FeeFrequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM'

interface FeeHead {
  id: string
  name: string
  frequency: FeeFrequency
  isActive: boolean
}

interface FeeGroupItem {
  id: string
  feeHeadId: string
  feeHead?: FeeHead
}

interface FeeGroup {
  id: string
  name: string
  description?: string
  items: FeeGroupItem[]
  isActive?: boolean
  createdAt?: string
}

// ── Frequency Badge ────────────────────────────────────────────────────

const FREQUENCY_BADGE_CLASSES: Record<FeeFrequency, string> = {
  MONTHLY: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  YEARLY: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
  ONE_TIME: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  QUARTERLY: 'bg-teal-100 text-teal-800 hover:bg-teal-100',
  HALF_YEARLY: 'bg-pink-100 text-pink-800 hover:bg-pink-100',
  CUSTOM: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
}

const FREQUENCY_LABELS: Record<FeeFrequency, string> = {
  ONE_TIME: 'One Time',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half Yearly',
  YEARLY: 'Yearly',
  CUSTOM: 'Custom',
}

// ── Component ──────────────────────────────────────────────────────────

export function FeesGroupsPage() {
  const { toast } = useToast()

  // Data
  const [feeGroups, setFeeGroups] = useState<FeeGroup[]>([])
  const [feeHeads, setFeeHeads] = useState<FeeHead[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog state
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
  })
  const [selectedFeeHeadIds, setSelectedFeeHeadIds] = useState<string[]>([])

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [groupsRes, headsRes] = await Promise.all([
        api.get<{ groups: FeeGroup[] }>('/api/school/fees/groups'),
        api.get<{ heads: FeeHead[] }>('/api/school/fees/heads'),
      ])
      setFeeGroups(groupsRes.groups || [])
      setFeeHeads((headsRes.heads || []).filter((h) => h.isActive))
    } catch {
      toast({ title: 'Couldn\'t Load Fee Groups', description: 'We couldn\'t load the fee groups. Please refresh the page.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Toggle fee head selection
  const toggleFeeHead = (headId: string) => {
    setSelectedFeeHeadIds((prev) =>
      prev.includes(headId) ? prev.filter((id) => id !== headId) : [...prev, headId]
    )
  }

  // Add fee group
  const handleAdd = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Missing Information', description: 'Please enter the name.', variant: 'destructive' })
      return
    }
    if (selectedFeeHeadIds.length === 0) {
      toast({ title: 'Missing Information', description: 'Please select at least one fee head.', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      await api.post('/api/school/fees/groups', {
        name: form.name,
        description: form.description,
        feeHeadIds: selectedFeeHeadIds,
      })
      toast({ title: 'Success', description: 'Fee group added successfully' })
      setShowAdd(false)
      setForm({ name: '', description: '' })
      setSelectedFeeHeadIds([])
      fetchData()
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

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return <LoadingState />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Groups"
        description={`${feeGroups.length} fee groups configured`}
        action={{
          label: 'Add Fee Group',
          icon: PlusCircle,
          onClick: () => setShowAdd(true),
        }}
      />

      {feeGroups.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No Fee Groups"
          description="Create fee groups to bundle multiple fee heads together (e.g., Academic Fees, Transport Fees)."
          action={{ label: 'Add Fee Group', onClick: () => setShowAdd(true) }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {feeGroups.map((group) => (
            <Card key={group.id} className="relative overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{group.name}</CardTitle>
                    {group.description && (
                      <p className="text-sm text-muted-foreground">{group.description}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {(group.items || []).length} head{(group.items || []).length !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {(group.items || []).length > 0 ? (
                  <div className="space-y-2">
                    {(group.items || []).map((item) => {
                      const feeHead = item.feeHead
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-md border px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Tag className="size-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">
                              {feeHead?.name || 'Unknown'}
                            </span>
                          </div>
                          {feeHead?.frequency && (
                            <Badge
                              className={FREQUENCY_BADGE_CLASSES[feeHead.frequency]}
                              variant="secondary"
                            >
                              {FREQUENCY_LABELS[feeHead.frequency]}
                            </Badge>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No fee heads in this group</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Fee Group Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Add New Fee Group</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g., Academic Fees, Transport Fees"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-desc">Description</Label>
              <Textarea
                id="group-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description for this fee group"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Select Fee Heads</Label>
              {feeHeads.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                  No active fee heads available. Create fee heads first.
                </p>
              ) : (
                <ScrollArea className="h-64 rounded-lg border">
                  <div className="p-3 space-y-3">
                    {feeHeads.map((head) => (
                      <div
                        key={head.id}
                        className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleFeeHead(head.id)}
                      >
                        <Checkbox
                          checked={selectedFeeHeadIds.includes(head.id)}
                          onCheckedChange={() => toggleFeeHead(head.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{head.name}</p>
                        </div>
                        <Badge
                          className={FREQUENCY_BADGE_CLASSES[head.frequency]}
                          variant="secondary"
                        >
                          {FREQUENCY_LABELS[head.frequency]}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
              {selectedFeeHeadIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedFeeHeadIds.length} fee head{selectedFeeHeadIds.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={saving || !form.name.trim() || selectedFeeHeadIds.length === 0}
            >
              {saving ? 'Adding...' : 'Add Fee Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
