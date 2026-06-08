'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PlusCircle, Pencil, Trash2, Layers } from 'lucide-react'

interface Category { id: string; name: string; description: string | null; _count?: { items: number } }

export function InventoryCatalogPage() {
  const { toast } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [catDialog, setCatDialog] = useState<{ id: string | null; name: string; description: string } | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true)
      const c = await api.get<{ categories: Category[] }>('/api/school/inventory/categories')
      setCategories(c.categories || [])
    } catch {
      toast({ title: "Couldn't load categories", variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchAll() }, [fetchAll])

  const saveCategory = async () => {
    if (!catDialog || !catDialog.name.trim()) return
    try {
      if (catDialog.id) await api.patch(`/api/school/inventory/categories/${catDialog.id}`, { name: catDialog.name.trim(), description: catDialog.description.trim() || null })
      else await api.post('/api/school/inventory/categories', { name: catDialog.name.trim(), description: catDialog.description.trim() || null })
      toast({ title: 'Category saved' })
      setCatDialog(null)
      fetchAll()
    } catch (err) { toast({ title: "Couldn't save", description: err instanceof Error ? err.message : '', variant: 'destructive' }) }
  }

  const deleteCategory = async (c: Category) => {
    if (!window.confirm(`Delete category "${c.name}"?`)) return
    try { await api.delete(`/api/school/inventory/categories/${c.id}`); toast({ title: 'Deleted' }); fetchAll() }
    catch (err) { toast({ title: "Couldn't delete", description: err instanceof Error ? err.message : '', variant: 'destructive' }) }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader title="Categories" description="Organise inventory into categories like Books, Shirt, Tie, Belt." />

      <Card className="max-w-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Layers className="size-4" /> Categories</CardTitle>
          <Button size="sm" onClick={() => setCatDialog({ id: null, name: '', description: '' })}><PlusCircle className="mr-1 size-4" />Add</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Items</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell><div className="font-medium">{c.name}</div>{c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}</TableCell>
                  <TableCell><Badge variant="secondary">{c._count?.items ?? 0}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => setCatDialog({ id: c.id, name: c.name, description: c.description || '' })}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => deleteCategory(c)}><Trash2 className="size-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {categories.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">No categories yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Category dialog */}
      <Dialog open={!!catDialog} onOpenChange={(o) => !o && setCatDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{catDialog?.id ? 'Edit Category' : 'Add Category'}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2"><Label>Name *</Label><Input value={catDialog?.name || ''} onChange={(e) => setCatDialog((d) => d && { ...d, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Description</Label><Input value={catDialog?.description || ''} onChange={(e) => setCatDialog((d) => d && { ...d, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(null)}>Cancel</Button>
            <Button onClick={saveCategory} disabled={!catDialog?.name.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
