'use client'

import { useState, useEffect, useCallback } from 'react'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { AlignLeft, ArrowLeft, Edit2, Layers, ListChecks, PlusCircle, Tag, Trash2 } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────

interface FeeGroup {
  id: string
  name: string
  description?: string
  isActive?: boolean
  createdAt?: string
}

// ── Constants ──────────────────────────────────────────────────────────

const DEFAULT_FEE_GROUP_NAME = '_DEFAULT'

// ── Component ──────────────────────────────────────────────────────────

export function FeesGroupsPage() {
  const { toast } = useToast()
  const goBack = useAppStore((s) => s.goBack)
  const navigateTo = useAppStore((s) => s.navigateTo)

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
    if (deletingGroup.name === DEFAULT_FEE_GROUP_NAME) {
      toast({ title: 'Protected Fee Group', description: 'The _DEFAULT fee group is required and cannot be deleted.', variant: 'destructive' })
      setDeletingGroup(null)
      return
    }

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
            <h1 className="text-xl font-bold tracking-tight">Fee Groups</h1>
            <p className="mt-1 text-sm text-muted-foreground">{feeGroups.length} fee groups configured</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <PlusCircle className="size-4" />
            Add Fee Group
          </Button>
          <Button variant="outline" onClick={() => navigateTo('fees-structures')} className="gap-2">
            <Layers className="size-4" />
            Fees Structure
          </Button>
        </div>
      </div>

      {feeGroups.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No Fee Groups"
          description="Create fee groups such as New Admission, Regular Student, or Staff Ward."
          action={{ label: 'Add Fee Group', onClick: () => setShowAdd(true) }}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-11 px-4 text-xs font-semibold uppercase text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Tag className="size-3.5" />
                    Fee Group Name
                  </span>
                </TableHead>
                <TableHead className="h-11 px-4 text-xs font-semibold uppercase text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <AlignLeft className="size-3.5" />
                    Description
                  </span>
                </TableHead>
                <TableHead className="h-11 w-48 px-4 text-right text-xs font-semibold uppercase text-muted-foreground">
                  <span className="flex items-center justify-end gap-2">
                    <ListChecks className="size-3.5" />
                    Action
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feeGroups.map((group) => {
                const isDefaultGroup = group.name === DEFAULT_FEE_GROUP_NAME

                return (
                  <TableRow key={group.id} className="group">
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Layers className="size-4" />
                        </span>
                        <span className="font-medium text-foreground">{group.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md px-4 py-3 text-muted-foreground">
                      <span className="line-clamp-2 whitespace-normal">
                        {group.description?.trim() || '-'}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 px-3"
                          onClick={() => openEdit(group)}
                          aria-label={`Edit ${group.name}`}
                        >
                          <Edit2 className="size-4" />
                          Edit
                        </Button>
                        {!isDefaultGroup && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 border-destructive/30 px-3 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => setDeletingGroup(group)}
                            aria-label={`Delete ${group.name}`}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
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
                disabled={editingGroup?.name === DEFAULT_FEE_GROUP_NAME}
              />
              {editingGroup?.name === DEFAULT_FEE_GROUP_NAME && (
                <p className="text-xs text-muted-foreground">The _DEFAULT group name is protected.</p>
              )}
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
