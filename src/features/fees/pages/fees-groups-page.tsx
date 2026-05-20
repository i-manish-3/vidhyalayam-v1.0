'use client'

import { useState, useEffect, useCallback } from 'react'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowLeft, Edit2, Layers, MoreHorizontal, PlusCircle, Tag, Trash2 } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────

type FeeFrequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM' | 'INSTALLMENT' | 'ON_DEMAND'

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
  INSTALLMENT: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  ON_DEMAND: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
  CUSTOM: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
}

const FREQUENCY_LABELS: Record<FeeFrequency, string> = {
  ONE_TIME: 'One Time',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half Yearly',
  YEARLY: 'Yearly',
  INSTALLMENT: 'Installment Based',
  ON_DEMAND: 'On Demand',
  CUSTOM: 'Custom',
}

// ── Component ──────────────────────────────────────────────────────────

export function FeesGroupsPage() {
  const { toast } = useToast()
  const goBack = useAppStore((s) => s.goBack)

  // Data
  const [feeGroups, setFeeGroups] = useState<FeeGroup[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog state
  const [showAdd, setShowAdd] = useState(false)
  const [editingGroup, setEditingGroup] = useState<FeeGroup | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<FeeGroup | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
  })
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
  })

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const groupsRes = await api.get<{ groups: FeeGroup[] }>('/api/school/fees/groups')
      setFeeGroups(groupsRes.groups || [])
    } catch {
      toast({ title: 'Couldn\'t Load Fee Groups', description: 'We couldn\'t load the fee groups. Please refresh the page.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Add fee group
  const handleAdd = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Missing Information', description: 'Please enter the name.', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api.post('/api/school/fees/groups', {
        name: form.name,
        description: form.description,
      })
      toast({ title: 'Success', description: 'Fee group added successfully' })
      setShowAdd(false)
      setForm({ name: '', description: '' })
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

  const openEdit = (group: FeeGroup) => {
    setEditingGroup(group)
    setEditForm({
      name: group.name,
      description: group.description || '',
    })
  }

  const handleEdit = async () => {
    if (!editingGroup) return
    if (!editForm.name.trim()) {
      toast({ title: 'Missing Information', description: 'Please enter the group name.', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      await api.patch(`/api/school/fees/groups/${editingGroup.id}`, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
      })
      toast({ title: 'Success', description: 'Fee group updated successfully' })
      setEditingGroup(null)
      setEditForm({ name: '', description: '' })
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

  const handleDelete = async () => {
    if (!deletingGroup) return

    setDeleting(true)
    try {
      await api.delete(`/api/school/fees/groups/${deletingGroup.id}`)
      toast({ title: 'Success', description: 'Fee group deleted successfully' })
      setDeletingGroup(null)
      fetchData()
    } catch (err) {
      toast({
        title: 'Could Not Delete Fee Group',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return <LoadingState />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="outline" size="icon" onClick={() => goBack('dashboard')} className="mt-0.5 size-9 shrink-0">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fee Groups</h1>
            <p className="mt-1 text-sm text-muted-foreground">{feeGroups.length} fee groups configured</p>
          </div>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2 shrink-0">
          <PlusCircle className="size-4" />
          Add Fee Group
        </Button>
      </div>

      {feeGroups.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No Fee Groups"
          description="Create fee groups such as New Admission, Regular Student, or Staff Ward."
          action={{ label: 'Add Fee Group', onClick: () => setShowAdd(true) }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {feeGroups.map((group) => (
            <Card key={group.id} className="relative overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-lg">{group.name}</CardTitle>
                    {group.description && (
                      <p className="text-sm text-muted-foreground">{group.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">
                      {(group.items || []).length} head{(group.items || []).length !== 1 ? 's' : ''}
                    </Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(group)}>
                          <Edit2 className="mr-2 size-4" />
                          Edit Name
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeletingGroup(group)}
                        >
                          <Trash2 className="mr-2 size-4" />
                          Delete Group
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={saving || !form.name.trim()}
            >
              {saving ? 'Adding...' : 'Add Fee Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Edit Fee Group</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-group-name">Group Name</Label>
              <Input
                id="edit-group-name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g., Academic Fees, Transport Fees"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-group-desc">Description</Label>
              <Textarea
                id="edit-group-desc"
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description for this fee group"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGroup(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={saving || !editForm.name.trim()}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingGroup} onOpenChange={(open) => !open && setDeletingGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fee Group?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{deletingGroup?.name}" from the active fee group list. Groups already used in fee structures cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                handleDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete Group'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
