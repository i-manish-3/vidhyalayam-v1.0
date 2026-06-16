'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
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
import { Layers, Pencil, PlusCircle, Trash2 } from 'lucide-react'

interface Category {
  id: string
  name: string
  description: string | null
  _count?: { items: number }
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
      <PageHeader
        title="Inventory Categories"
        description="Organise inventory into categories like books, uniforms, stationery, and accessories."
        action={{ label: 'Add Category', icon: PlusCircle, onClick: () => setCatDialog({ id: null, name: '', description: '' }) }}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 shadow-sm">
        {[
          { label: 'Categories', value: stats.categories.toLocaleString('en-IN') },
          { label: 'Linked Items', value: stats.linkedItems.toLocaleString('en-IN') },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 rounded-md bg-muted/35 px-2.5 py-1.5 text-xs">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-semibold tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>

      <Card className="gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="border-b bg-muted/30 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="size-4 text-primary" />
            Category List
            <Badge variant="secondary" className="ml-auto text-xs">
              {categories.length.toLocaleString('en-IN')} records
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Items</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell>
                    <div className="font-medium">{category.name}</div>
                    {category.description && <div className="text-xs text-muted-foreground">{category.description}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{category._count?.items ?? 0}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setCatDialog({ id: category.id, name: category.name, description: category.description || '' })}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(category)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {categories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                    No categories yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!catDialog} onOpenChange={(open) => !open && setCatDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{catDialog?.id ? 'Edit Category' : 'Add Category'}</DialogTitle>
            <DialogDescription>Keep category names short and easy to scan on item lists.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="category-name">Name *</Label>
              <Input
                id="category-name"
                value={catDialog?.name || ''}
                onChange={(e) => setCatDialog((current) => current && { ...current, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-description">Description</Label>
              <Input
                id="category-description"
                value={catDialog?.description || ''}
                onChange={(e) => setCatDialog((current) => current && { ...current, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveCategory()} disabled={!catDialog?.name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} will be removed from the category list. Existing item history is not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteCategory()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
