'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingState } from '@/components/shared'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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
import { Edit2, Layers, PlusCircle, Trash2, X } from 'lucide-react'

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
  const router = useRouter()
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMISSIONS.FEES_CREATE)
  const canUpdate = hasPermission(PERMISSIONS.FEES_UPDATE)
  const canDelete = hasPermission(PERMISSIONS.FEES_DELETE)

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
    <div className="space-y-5">
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-10 -top-12 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <Layers className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Fee Groups</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85">{feeGroups.length} groups</span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">Organise fee heads into groups for fee structure assignment.</p>
          </div>
        </div>
        <div className="relative flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => router.push('/fees/structures')}
            className="gap-2 border border-white/60 shadow-md"
            style={{ backgroundColor: 'white', color: 'var(--primary)' }}
          >
            <Layers className="size-4" />
            Fees Structure
          </Button>
          {canCreate && (
            <Button
              variant="secondary"
              onClick={() => setShowAdd(true)}
              className="gap-2 border border-white/60 shadow-md"
              style={{ backgroundColor: 'white', color: 'var(--primary)' }}
            >
              <PlusCircle className="size-4" />
              Add Fee Group
            </Button>
          )}
        </div>
      </div>

      {feeGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-sky-200/60 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-12 text-center shadow-sm dark:border-sky-500/20 dark:from-sky-500/5 dark:via-card dark:to-cyan-500/5">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-cyan-100 shadow-sm dark:from-sky-900/50 dark:to-cyan-900/50">
            <Layers className="size-8 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-sky-900 dark:text-sky-200">No Fee Groups</h3>
            <p className="mt-1 text-sm text-sky-700/70 dark:text-sky-300/70">Create fee groups such as New Admission, Regular Student, or Staff Ward.</p>
          </div>
          {canCreate && (
            <Button
              onClick={() => setShowAdd(true)}
              className="gap-2 bg-gradient-to-r from-primary to-cyan-600 shadow-md shadow-primary/20"
            >
              <PlusCircle className="size-4" />
              Add Fee Group
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] shadow-sm dark:border-sky-500/20">
          <div className="flex items-center gap-2 border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] p-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
              <Layers className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">All Fee Groups</p>
              <p className="text-xs text-muted-foreground">{feeGroups.length} groups configured</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gradient-to-r from-cyan-500/[0.07] via-sky-500/[0.04] to-violet-500/[0.07]">
                <TableRow>
                  <TableHead className="h-11 px-4">Fee Group Name</TableHead>
                  <TableHead className="h-11 px-4">Description</TableHead>
                  <TableHead className="h-11 w-48 px-4 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeGroups.map((group) => {
                  const isDefaultGroup = group.name === DEFAULT_FEE_GROUP_NAME

                  return (
                    <TableRow key={group.id} className="transition-colors hover:bg-cyan-500/[0.045]">
                      <TableCell className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-md border shadow-sm',
                            isDefaultGroup ? 'border-amber-200/80 bg-gradient-to-br from-amber-100 to-amber-50 text-amber-600 shadow-amber-200/30 dark:border-amber-500/30 dark:from-amber-500/20 dark:to-amber-500/10 dark:text-amber-400' : 'border-sky-300/60 bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sky-500/20 dark:border-sky-500/40'
                          )}>
                            <Layers className="size-4" />
                          </span>
                          <span className="font-medium">{group.name}</span>
                          {isDefaultGroup && (
                            <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-400">Default</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md px-4 py-3 text-muted-foreground">
                        <span className="line-clamp-2 whitespace-normal">
                          {group.description?.trim() || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {canUpdate && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 border-sky-200/70 px-3 text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:text-sky-300 dark:hover:bg-sky-500/20"
                              onClick={() => openEdit(group)}
                              aria-label={`Edit ${group.name}`}
                            >
                              <Edit2 className="size-4" />
                              Edit
                            </Button>
                          )}
                          {canDelete && !isDefaultGroup && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 border-destructive/30 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
        </div>
      )}

      {/* Add Fee Group Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] border-sky-200/80 bg-gradient-to-br from-white via-sky-50/45 to-cyan-50/60 p-0 shadow-xl dark:border-sky-500/25 dark:from-card dark:via-sky-500/10 dark:to-cyan-500/10">
          <DialogHeader className="relative overflow-hidden rounded-t-lg border-b border-sky-500/15 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 p-5 text-white">
            <div aria-hidden className="absolute -right-10 -top-12 size-32 rounded-full border-[16px] border-white/15" />
            <div aria-hidden className="absolute bottom-0 right-32 h-px w-48 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
                <Layers className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-white">Add New Fee Group</DialogTitle>
                <DialogDescription className="text-white/80">Create a new fee group to organise fee heads.</DialogDescription>
              </div>
              <DialogClose className="absolute top-3 right-3 z-20 flex size-8 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white/90 shadow-sm backdrop-blur-sm transition-all hover:bg-white/30 hover:text-white">
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>
          </DialogHeader>
          <div className="grid gap-4 p-5">
            <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-cyan-500/10">
              <div className="mb-3 flex items-center gap-2 border-b border-sky-500/15 pb-2.5 text-sm font-semibold">
                <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm">
                  <Layers className="size-3.5" />
                </span>
                Group details
              </div>
              <div className="space-y-4">
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
            </div>
          </div>
          <DialogFooter className="border-t border-sky-500/15 bg-white/80 p-4 dark:bg-card/80">
            <div className="flex w-full items-center justify-between gap-3 max-sm:flex-col">
              <p className="hidden text-xs text-sky-700 sm:block dark:text-sky-300">
                <span className="inline-flex items-center gap-1">
                  <Layers className="size-3" />
                  Create a new fee group
                </span>
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setShowAdd(false)} className="bg-white dark:bg-card">
                  Cancel
                </Button>
                <Button
                  onClick={handleAdd}
                  disabled={saving || !form.name.trim() || !canCreate}
                  className="gap-1.5 bg-gradient-to-r from-primary to-cyan-600 shadow-sm shadow-primary/20"
                >
                  {saving ? 'Adding...' : 'Add Fee Group'}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] border-sky-200/80 bg-gradient-to-br from-white via-sky-50/45 to-cyan-50/60 p-0 shadow-xl dark:border-sky-500/25 dark:from-card dark:via-sky-500/10 dark:to-cyan-500/10">
          <DialogHeader className="relative overflow-hidden rounded-t-lg border-b border-sky-500/15 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 p-5 text-white">
            <div aria-hidden className="absolute -right-10 -top-12 size-32 rounded-full border-[16px] border-white/15" />
            <div aria-hidden className="absolute bottom-0 right-32 h-px w-48 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
                <Edit2 className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-white">Edit Fee Group</DialogTitle>
                <DialogDescription className="text-white/80">Update the fee group details.</DialogDescription>
              </div>
              <DialogClose className="absolute top-3 right-3 z-20 flex size-8 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white/90 shadow-sm backdrop-blur-sm transition-all hover:bg-white/30 hover:text-white">
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>
          </DialogHeader>
          <div className="grid gap-4 p-5">
            <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-cyan-500/10">
              <div className="mb-3 flex items-center gap-2 border-b border-sky-500/15 pb-2.5 text-sm font-semibold">
                <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm">
                  <Edit2 className="size-3.5" />
                </span>
                Group details
              </div>
              <div className="space-y-4">
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
            </div>
          </div>
          <DialogFooter className="border-t border-sky-500/15 bg-white/80 p-4 dark:bg-card/80">
            <div className="flex w-full items-center justify-between gap-3 max-sm:flex-col">
              <p className="hidden text-xs text-sky-700 sm:block dark:text-sky-300">
                <span className="inline-flex items-center gap-1">
                  <Edit2 className="size-3" />
                  Update fee group details
                </span>
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setEditingGroup(null)} disabled={saving} className="bg-white dark:bg-card">
                  Cancel
                </Button>
                <Button
                  onClick={handleEdit}
                  disabled={saving || !editForm.name.trim() || !canUpdate}
                  className="gap-1.5 bg-gradient-to-r from-primary to-cyan-600 shadow-sm shadow-primary/20"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingGroup} onOpenChange={(open) => !open && setDeletingGroup(null)}>
        <AlertDialogContent className="max-w-lg border-sky-200/80 bg-gradient-to-br from-white via-sky-50/45 to-cyan-50/60 p-0 shadow-xl dark:border-sky-500/25 dark:from-card dark:via-sky-500/10 dark:to-cyan-500/10">
          <div className="relative overflow-hidden rounded-t-lg border-b border-sky-500/15 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 p-5 text-white">
            <div aria-hidden className="absolute -right-10 -top-12 size-32 rounded-full border-[16px] border-white/15" />
            <div aria-hidden className="absolute bottom-0 right-32 h-px w-48 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
                <Trash2 className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <AlertDialogTitle className="text-white">Delete Fee Group?</AlertDialogTitle>
                <p className="text-sm text-white/80">This action cannot be undone.</p>
              </div>
              <AlertDialogCancel className="absolute top-3 right-3 z-20 flex size-8 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white/90 shadow-sm backdrop-blur-sm transition-all hover:bg-white/30 hover:text-white">
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </AlertDialogCancel>
            </div>
          </div>
          <div className="p-5">
            <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-cyan-500/10">
              <p className="text-sm text-sky-900 dark:text-sky-200">
                This will remove "<strong className="text-foreground">{deletingGroup?.name}</strong>" from the active fee group list. Groups already used in fee structures cannot be deleted.
              </p>
            </div>
          </div>
          <AlertDialogFooter className="border-t border-sky-500/15 bg-white/80 p-4 dark:bg-card/80">
            <div className="flex w-full items-center justify-between gap-3">
              <p className="text-xs text-sky-700 dark:text-sky-300">
                <span className="inline-flex items-center gap-1">
                  <Trash2 className="size-3" />
                  Remove this fee group
                </span>
              </p>
              <div className="flex items-center gap-2">
                <AlertDialogCancel disabled={deleting} className="border-sky-200/70 text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:text-sky-300 dark:hover:bg-sky-500/20">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault()
                    handleDelete()
                  }}
                  disabled={deleting || !canDelete}
                  className="gap-1.5 bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-md shadow-rose-300/30 hover:from-rose-500 hover:to-rose-400 disabled:from-gray-400 disabled:to-gray-400"
                >
                  {deleting ? 'Deleting...' : 'Delete Group'}
                </AlertDialogAction>
              </div>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
