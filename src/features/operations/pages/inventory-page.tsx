'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { PlusCircle, Package, MoreVertical, Pencil, Trash2, PackagePlus, AlertTriangle, ShoppingCart, Search, ChevronDown, ChevronRight, X, Boxes, Tags, MapPin } from 'lucide-react'

interface Variant {
  id: string
  label: string | null
  sku: string | null
  quantity: number
  reorderLevel: number
  unitPrice: number | null
  sellingPrice: number | null
}
interface ApiItem {
  id: string
  name: string
  sku: string | null
  category: string | null
  categoryId: string | null
  unit: string | null
  variantLabel: string | null
  isSellable: boolean
  condition: string | null
  location: string | null
  categoryRef?: { id: string; name: string } | null
  variants: Variant[]
  totalStock: number
  isLowStock: boolean
}
interface CategoryOption { id: string; name: string }

interface FormVariant { id?: string; label: string; sku: string; quantity: string; reorderLevel: string; unitPrice: string; sellingPrice: string }

const CONDITIONS = ['New', 'Good', 'Fair', 'Poor', 'Damaged']
const emptyVariant = (): FormVariant => ({ label: '', sku: '', quantity: '', reorderLevel: '', unitPrice: '', sellingPrice: '' })
const emptyForm = () => ({
  name: '', sku: '', categoryId: '', unit: 'pcs', isSellable: false, condition: 'New', location: '',
  hasVariants: false, variantLabel: '', variants: [emptyVariant()] as FormVariant[],
})

function isLowVariant(v: Variant): boolean {
  return v.reorderLevel > 0 && v.quantity <= v.reorderLevel
}

export function InventoryPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [items, setItems] = useState<ApiItem[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [stockItem, setStockItem] = useState<ApiItem | null>(null)
  const [stockForm, setStockForm] = useState({ variantId: '', type: 'IN', quantity: '', unitCost: '', reason: '' })
  const [deleteItem, setDeleteItem] = useState<ApiItem | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const params: Record<string, string> = {}
      if (search) params.search = search
      if (lowStockOnly) params.lowStock = '1'
      const [itemsRes, catRes] = await Promise.all([
        api.get<{ items: ApiItem[] }>('/api/school/inventory', params),
        api.get<{ categories: CategoryOption[] }>('/api/school/inventory/categories'),
      ])
      setItems(itemsRes.items || [])
      setCategories(catRes.categories || [])
    } catch {
      toast({ title: "Couldn't load inventory", description: 'Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [search, lowStockOnly, toast])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleExpand = (id: string) => setExpanded((s) => {
    const next = new Set(s)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const openAdd = () => { setEditingId(null); setForm(emptyForm()); setShowForm(true) }
  const openEdit = (i: ApiItem) => {
    setEditingId(i.id)
    const hasVariants = i.variantLabel != null || i.variants.length > 1
    setForm({
      name: i.name, sku: i.sku || '', categoryId: i.categoryId || '', unit: i.unit || 'pcs',
      isSellable: i.isSellable, condition: i.condition || 'New', location: i.location || '',
      hasVariants, variantLabel: i.variantLabel || '',
      variants: (i.variants.length ? i.variants : [{ id: undefined, label: null, sku: null, quantity: 0, reorderLevel: 0, unitPrice: null, sellingPrice: null } as unknown as Variant]).map((v) => ({
        id: v.id, label: v.label || '', sku: v.sku || '',
        quantity: String(v.quantity), reorderLevel: String(v.reorderLevel),
        unitPrice: v.unitPrice != null ? String(v.unitPrice) : '', sellingPrice: v.sellingPrice != null ? String(v.sellingPrice) : '',
      })),
    })
    setShowForm(true)
  }

  const setVariant = (idx: number, patch: Partial<FormVariant>) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v, i) => i === idx ? { ...v, ...patch } : v) }))
  const addVariantRow = () => setForm((f) => ({ ...f, variants: [...f.variants, emptyVariant()] }))
  const removeVariantRow = (idx: number) => setForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== idx) }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: 'Item name required', variant: 'destructive' }); return }
    if (form.hasVariants && !form.variantLabel.trim()) { toast({ title: 'Name the variant type (e.g. Size or Class)', variant: 'destructive' }); return }
    if (form.hasVariants && form.variants.some((v) => !v.label.trim())) { toast({ title: `Each ${form.variantLabel.trim() || 'variant'} needs a label`, variant: 'destructive' }); return }

    const num = (s: string) => s === '' ? null : Number(s)
    const variantsPayload = form.variants.map((v) => ({
      id: v.id,
      label: form.hasVariants ? v.label.trim() : null,
      sku: v.sku.trim() || null,
      quantity: Number(v.quantity) || 0,
      reorderLevel: Number(v.reorderLevel) || 0,
      unitPrice: num(v.unitPrice),
      sellingPrice: num(v.sellingPrice),
    }))
    const payload = {
      name: form.name.trim(), sku: form.sku.trim() || null,
      categoryId: form.categoryId || null, unit: form.unit.trim() || null,
      isSellable: form.isSellable, condition: form.condition, location: form.location.trim() || null,
      variantLabel: form.hasVariants ? form.variantLabel.trim() : null,
      variants: variantsPayload,
    }
    try {
      setSaving(true)
      if (editingId) {
        await api.patch(`/api/school/inventory/${editingId}`, payload)
        toast({ title: 'Item updated' })
      } else {
        await api.post('/api/school/inventory', payload)
        toast({ title: 'Item added' })
      }
      setShowForm(false)
      fetchData()
    } catch (err) {
      toast({ title: "Couldn't save item", description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally { setSaving(false) }
  }

  const openStock = (i: ApiItem) => {
    setStockItem(i)
    setStockForm({ variantId: i.variants[0]?.id || '', type: 'IN', quantity: '', unitCost: '', reason: '' })
  }
  const handleStock = async () => {
    if (!stockItem || !stockForm.variantId) return
    try {
      await api.post(`/api/school/inventory/${stockItem.id}/stock`, {
        variantId: stockForm.variantId,
        type: stockForm.type, quantity: Number(stockForm.quantity),
        unitCost: stockForm.unitCost === '' ? undefined : Number(stockForm.unitCost),
        reason: stockForm.reason.trim() || undefined,
      })
      toast({ title: 'Stock updated' })
      setStockItem(null)
      fetchData()
    } catch (err) {
      toast({ title: "Couldn't update stock", description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    }
  }

  const handleDelete = async () => {
    if (!deleteItem) return
    try {
      await api.delete(`/api/school/inventory/${deleteItem.id}`)
      toast({ title: 'Item deleted' })
      setDeleteItem(null)
      fetchData()
    } catch (err) {
      toast({ title: "Couldn't delete", description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description={`${items.length} item(s)`}
        action={{ label: 'Add Item', icon: PlusCircle, onClick: openAdd }}
        secondaryAction={{ label: 'Sell to Student', icon: ShoppingCart, onClick: () => router.push('/inventory/sell') }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={lowStockOnly} onCheckedChange={(c) => setLowStockOnly(!!c)} /> Low stock only
        </label>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Package} title="No items" description="Add inventory items to track stock and sell to students." action={{ label: 'Add Item', onClick: openAdd }} />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Variants</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => {
                const multi = i.variantLabel != null || i.variants.length > 1
                const isOpen = expanded.has(i.id)
                return (
                  <Fragment key={i.id}>
                    <TableRow className={i.isLowStock ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}>
                      <TableCell className="py-2">
                        {multi && (
                          <Button variant="ghost" size="icon" className="size-6" onClick={() => toggleExpand(i.id)}>
                            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{i.name}</div>
                        <div className="text-xs text-muted-foreground">{i.sku || ''} {i.isSellable && <Badge variant="secondary" className="ml-1">Sellable</Badge>}</div>
                      </TableCell>
                      <TableCell>{i.categoryRef?.name || i.category || '—'}</TableCell>
                      <TableCell>
                        <span className="tabular-nums">{i.totalStock} {i.unit || ''}</span>
                        {i.isLowStock && <Badge variant="outline" className="ml-2 border-amber-400 text-amber-700"><AlertTriangle className="mr-1 size-3" />Low</Badge>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {multi ? `${i.variants.length} ${(i.variantLabel || 'variant').toLowerCase()}${i.variants.length === 1 ? '' : 's'}` : '—'}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openStock(i)}><PackagePlus className="mr-2 size-4" />Adjust Stock</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(i)}><Pencil className="mr-2 size-4" />Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeleteItem(i)} className="text-destructive"><Trash2 className="mr-2 size-4" />Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    {multi && isOpen && i.variants.map((v) => (
                      <TableRow key={v.id} className="bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell colSpan={2} className="py-1.5 pl-8 text-sm">
                          <span className="font-medium">{i.variantLabel}: {v.label}</span>
                          {v.sku && <span className="ml-2 text-xs text-muted-foreground">{v.sku}</span>}
                        </TableCell>
                        <TableCell className="py-1.5">
                          <span className="tabular-nums">{v.quantity}</span>
                          {isLowVariant(v) && <Badge variant="outline" className="ml-2 border-amber-400 text-amber-700">Low</Badge>}
                        </TableCell>
                        <TableCell colSpan={2} className="py-1.5 text-xs text-muted-foreground">
                          Cost {v.unitPrice != null ? `₹${v.unitPrice}` : '—'} · Sell {v.sellingPrice != null ? `₹${v.sellingPrice}` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="flex max-h-[92svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b bg-muted/30 px-5 py-4 pr-12 text-left sm:px-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
                <PackagePlus className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle>{editingId ? 'Edit Inventory Item' : 'Add Inventory Item'}</DialogTitle>
                <DialogDescription>Add the item details, opening stock, and pricing used by store sales.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="space-y-6">
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Tags className="size-4 text-primary" />
                  Item details
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="inventory-name">Item name *</Label>
                    <Input id="inventory-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. School Shirt" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inventory-sku">Item code / SKU</Label>
                    <Input id="inventory-sku" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} placeholder="e.g. SHIRT-WHITE" />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inventory-unit">Unit</Label>
                    <Input id="inventory-unit" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="pcs" />
                  </div>
                  <div className="space-y-2">
                    <Label>Condition</Label>
                    <Select value={form.condition} onValueChange={(v) => setForm((f) => ({ ...f, condition: v }))}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="inventory-location">Location</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                      <Input id="inventory-location" className="pl-9" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Store room A" />
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-4 rounded-md border bg-background p-4">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Sellable item</div>
                    <p className="text-xs text-muted-foreground">Show this item in Sell to Student.</p>
                  </div>
                  <Switch checked={form.isSellable} onCheckedChange={(c) => setForm((f) => ({ ...f, isSellable: c }))} aria-label="Toggle sellable item" />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-md border bg-background p-4">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Variants</div>
                    <p className="text-xs text-muted-foreground">Use for sizes, classes, or editions.</p>
                  </div>
                  <Switch
                    checked={form.hasVariants}
                    onCheckedChange={(c) => setForm((f) => ({
                      ...f,
                      hasVariants: c,
                      variantLabel: c ? f.variantLabel : '',
                      variants: c ? (f.variants.length ? f.variants : [emptyVariant()]) : [f.variants[0] || emptyVariant()],
                    }))}
                    aria-label="Toggle item variants"
                  />
                </div>
              </section>

              <section className="space-y-4 rounded-md border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Boxes className="size-4 text-primary" />
                  Stock and pricing
                </div>

              {form.hasVariants && (
                <div className="max-w-sm space-y-2">
                  <Label>Variant type *</Label>
                  <Input className="max-w-xs" value={form.variantLabel} onChange={(e) => setForm((f) => ({ ...f, variantLabel: e.target.value }))} placeholder="e.g. Size, Class" />
                </div>
              )}

              <div className="-mx-1 overflow-x-auto rounded-md border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {form.hasVariants && <TableHead className="min-w-24">{form.variantLabel.trim() || 'Label'}</TableHead>}
                      <TableHead>{editingId ? 'Stock' : 'Opening Qty'}</TableHead>
                      <TableHead>Reorder</TableHead>
                      <TableHead>Cost ₹</TableHead>
                      <TableHead>Sell ₹</TableHead>
                      {form.hasVariants && <TableHead className="w-8"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.variants.map((v, idx) => (
                      <TableRow key={v.id || idx}>
                        {form.hasVariants && (
                          <TableCell className="py-1"><Input className="h-8" value={v.label} onChange={(e) => setVariant(idx, { label: e.target.value })} placeholder="e.g. 26" /></TableCell>
                        )}
                        <TableCell className="py-1"><Input className="h-8 w-20" type="number" value={v.quantity} onChange={(e) => setVariant(idx, { quantity: e.target.value })} /></TableCell>
                        <TableCell className="py-1"><Input className="h-8 w-20" type="number" value={v.reorderLevel} onChange={(e) => setVariant(idx, { reorderLevel: e.target.value })} /></TableCell>
                        <TableCell className="py-1"><Input className="h-8 w-24" type="number" value={v.unitPrice} onChange={(e) => setVariant(idx, { unitPrice: e.target.value })} /></TableCell>
                        <TableCell className="py-1"><Input className="h-8 w-24" type="number" value={v.sellingPrice} onChange={(e) => setVariant(idx, { sellingPrice: e.target.value })} /></TableCell>
                        {form.hasVariants && (
                          <TableCell className="py-1">
                            <Button variant="ghost" size="icon" className="size-7 text-destructive" disabled={form.variants.length <= 1} onClick={() => removeVariantRow(idx)}><X className="size-4" /></Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {form.hasVariants && (
                <Button variant="outline" size="sm" className="mt-2" onClick={addVariantRow}><PlusCircle className="mr-1 size-4" />Add {form.variantLabel.trim() || 'variant'}</Button>
              )}
              {editingId && <p className="mt-2 text-xs text-muted-foreground">Changing a stock figure here records a recount adjustment. Use Adjust Stock for restocking.</p>}
              </section>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background px-5 py-4 sm:px-6">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>{saving ? 'Saving...' : editingId ? 'Save changes' : 'Add item'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock movement dialog */}
      <Dialog open={!!stockItem} onOpenChange={(o) => !o && setStockItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Stock — {stockItem?.name}</DialogTitle>
            <DialogDescription>Record a restock, consumption, or recount.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {stockItem && (stockItem.variantLabel != null || stockItem.variants.length > 1) && (
              <div className="space-y-2">
                <Label>{stockItem.variantLabel || 'Variant'}</Label>
                <Select value={stockForm.variantId} onValueChange={(v) => setStockForm((f) => ({ ...f, variantId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {stockItem.variants.map((v) => <SelectItem key={v.id} value={v.id}>{v.label || 'Default'} — {v.quantity} in stock</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Movement</Label>
              <Select value={stockForm.type} onValueChange={(v) => setStockForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">Stock In (restock)</SelectItem>
                  <SelectItem value="OUT">Stock Out (consume/waste)</SelectItem>
                  <SelectItem value="ADJUST">Set exact count (recount)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{stockForm.type === 'ADJUST' ? 'New count' : 'Quantity'}</Label><Input type="number" value={stockForm.quantity} onChange={(e) => setStockForm((f) => ({ ...f, quantity: e.target.value }))} /></div>
            {stockForm.type === 'IN' && <div className="space-y-2"><Label>Unit Cost (optional)</Label><Input type="number" value={stockForm.unitCost} onChange={(e) => setStockForm((f) => ({ ...f, unitCost: e.target.value }))} /></div>}
            <div className="space-y-2"><Label>Reason (optional)</Label><Input value={stockForm.reason} onChange={(e) => setStockForm((f) => ({ ...f, reason: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockItem(null)}>Cancel</Button>
            <Button onClick={handleStock} disabled={stockForm.quantity === '' || !stockForm.variantId}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteItem?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This soft-deletes the item and all its variants. Its sales history is preserved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
