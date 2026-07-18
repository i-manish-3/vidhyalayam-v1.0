'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
  Layers,
  Pencil,
  PlusCircle,
  Trash2,
  FolderTree,
  Package,
  Tag,
  type LucideIcon,
} from 'lucide-react'

interface Category {
  id: string
  name: string
  description: string | null
  _count?: { items: number }
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string
  value: string | number
  description: string
  icon: LucideIcon
  tone: 'sky' | 'emerald' | 'violet'
}) {
  const styles = {
    sky: {
      card: 'border-sky-500/20 bg-gradient-to-br from-sky-500/[0.15] via-card to-sky-500/[0.05]',
      icon: 'bg-gradient-to-br from-sky-500 to-sky-600 shadow-sky-500/20',
      accent: 'from-sky-500 via-sky-400',
      bubble: 'bg-sky-500/[0.10]',
    },
    emerald: {
      card: 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.15] via-card to-emerald-500/[0.05]',
      icon: 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/20',
      accent: 'from-emerald-500 via-emerald-400',
      bubble: 'bg-emerald-500/[0.10]',
    },
    violet: {
      card: 'border-violet-500/20 bg-gradient-to-br from-violet-500/[0.14] via-card to-violet-500/[0.05]',
      icon: 'bg-gradient-to-br from-violet-500 to-violet-600 shadow-violet-500/20',
      accent: 'from-violet-500 via-violet-400',
      bubble: 'bg-violet-500/[0.10]',
    },
  }[tone]

  return (
    <Card className={cn('group relative w-full overflow-hidden rounded-xl py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', styles.card)}>
      <div className={cn('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent', styles.accent)} />
      <div aria-hidden className={cn('absolute -bottom-7 -right-5 size-16 rounded-full transition-transform group-hover:scale-125', styles.bubble)} />
      <CardContent className="relative p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">{title}</p>
            <p className="text-lg font-bold leading-6 tracking-tight tabular-nums">{value}</p>
            <p className="truncate text-[10px] leading-3 text-muted-foreground">{description}</p>
          </div>
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm', styles.icon)}>
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function InventoryCatalogPage() {
  const { toast } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [catDialog, setCatDialog] = useState<{ id: string | null; name: string; description: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get<{ categories: Category[] }>('/api/school/inventory/categories')
      setCategories(res.categories || [])
    } catch {
      toast({ title: "Couldn't load categories", variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  const stats = useMemo(() => {
    const linkedItems = categories.reduce((sum, category) => sum + (category._count?.items ?? 0), 0)
    return { categories: categories.length, linkedItems }
  }, [categories])

  const saveCategory = async () => {
    if (!catDialog || !catDialog.name.trim()) return
    try {
      const payload = {
        name: catDialog.name.trim(),
        description: catDialog.description.trim() || null,
      }
      if (catDialog.id) {
        await api.patch(`/api/school/inventory/categories/${catDialog.id}`, payload)
      } else {
        await api.post('/api/school/inventory/categories', payload)
      }
      toast({ title: 'Category saved' })
      setCatDialog(null)
      await fetchAll()
    } catch (err) {
      toast({
        title: "Couldn't save",
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      })
    }
  }

  const deleteCategory = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/api/school/inventory/categories/${deleteTarget.id}`)
      toast({ title: 'Category deleted' })
      setDeleteTarget(null)
      await fetchAll()
    } catch (err) {
      toast({
        title: "Couldn't delete",
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      })
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <Layers className="size-5.5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Inventory Categories</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                {stats.categories.toLocaleString('en-IN')} categories
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">
              Organise inventory into categories like books, uniforms, stationery, and accessories.
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => setCatDialog({ id: null, name: '', description: '' })}
          className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
          style={{ backgroundColor: 'white', color: 'var(--primary)' }}
        >
          <PlusCircle className="size-4" strokeWidth={2.2} />
          <span className="font-semibold">Add Category</span>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-2 sm:grid-cols-2">
        <StatCard
          title="Total Categories"
          value={stats.categories.toLocaleString('en-IN')}
          description="Inventory classifications"
          icon={FolderTree}
          tone="sky"
        />
        <StatCard
          title="Linked Items"
          value={stats.linkedItems.toLocaleString('en-IN')}
          description="Items assigned to categories"
          icon={Package}
          tone="emerald"
        />
      </div>

      <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
        <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                <Tag className="size-4" />
              </span>
              Category List
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {categories.length.toLocaleString('en-IN')} records
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="mx-4 mt-4 mb-4 overflow-x-auto rounded-xl border border-sky-500/15 shadow-sm">
            <Table>
              <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                <TableRow>
                  <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</TableHead>
                  <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</TableHead>
                  <TableHead className="w-24 py-2.5"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id} className="transition-colors hover:bg-sky-500/[0.04]">
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/20 to-violet-500/20 text-primary">
                          <Tag className="size-4" />
                        </span>
                        <div>
                          <div className="text-sm font-medium">{category.name}</div>
                          {category.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">{category.description}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-semibold tabular-nums">
                        <Package className="size-3 text-muted-foreground" />
                        {category._count?.items ?? 0}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30"
                          onClick={() => setCatDialog({ id: category.id, name: category.name, description: category.description || '' })}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                          onClick={() => setDeleteTarget(category)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {categories.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                        <Tag className="size-8 text-muted-foreground/30" />
                        <span className="font-medium">No categories yet</span>
                        <span className="text-xs">Create one to start organising your inventory.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={!!catDialog} onOpenChange={(open) => !open && setCatDialog(null)}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-md [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-emerald-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <Tag className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">
                  {catDialog?.id ? 'Edit Category' : 'Add Category'}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  Keep category names short and easy to scan on item lists.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.055] p-4 sm:p-5">
            <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="category-name" className="text-xs font-medium">Name *</Label>
                  <Input
                    id="category-name"
                    className="h-9"
                    value={catDialog?.name || ''}
                    onChange={(e) => setCatDialog((current) => current && { ...current, name: e.target.value })}
                    placeholder="e.g. Uniforms"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category-description" className="text-xs font-medium">Description</Label>
                  <Input
                    id="category-description"
                    className="h-9"
                    value={catDialog?.description || ''}
                    onChange={(e) => setCatDialog((current) => current && { ...current, description: e.target.value })}
                    placeholder="Optional description"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 flex-wrap gap-2 border-t border-primary/10 bg-gradient-to-br from-primary/[0.02] to-transparent px-5 py-3 sm:px-6">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setCatDialog(null)}>
              Cancel
            </Button>
            <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={() => void saveCategory()} disabled={!catDialog?.name.trim()}>
              <PlusCircle className="size-3.5" />
              {catDialog?.id ? 'Save Changes' : 'Add Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-md">
          <AlertDialogHeader className="relative overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-emerald-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <Trash2 className="size-5 text-white" />
              </span>
              <div>
                <AlertDialogTitle className="text-lg font-bold tracking-normal text-white">Delete category?</AlertDialogTitle>
                <AlertDialogDescription className="mt-0.5 text-xs text-white/75">
                  {deleteTarget?.name} will be removed from the category list. Existing item history is not deleted.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <div className="bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.055] px-5 py-4 sm:px-6">
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. Any items currently in this category will become uncategorised.
            </p>
          </div>
          <AlertDialogFooter className="shrink-0 flex-wrap gap-2 border-t border-primary/10 bg-gradient-to-br from-primary/[0.02] to-transparent px-5 py-3 sm:px-6">
            <AlertDialogCancel className="h-8 px-4 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteCategory()} className="h-8 gap-1.5 px-4 text-xs bg-rose-600 hover:bg-rose-700">
              <Trash2 className="size-3.5" />
              Delete Category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
