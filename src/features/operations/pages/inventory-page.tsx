'use client'

import { useState, useEffect, useCallback, Fragment, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  PlusCircle,
  Package,
  MoreVertical,
  Pencil,
  Trash2,
  PackagePlus,
  AlertTriangle,
  ShoppingCart,
  Search,
  ChevronDown,
  ChevronRight,
  X,
  Boxes,
  Tags,
  Box,
  Store,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react'

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

interface FormVariant { id?: string; label: string; sku: string; quantity: string; reorderLevel: string; sellingPrice: string }

const emptyVariant = (): FormVariant => ({ label: '', sku: '', quantity: '', reorderLevel: '', sellingPrice: '' })
const emptyForm = () => ({
  name: '', sku: '', categoryId: '', unit: 'pcs', isSellable: false, condition: 'New', location: '',
  hasVariants: false, variantLabel: '', variants: [emptyVariant()] as FormVariant[],
})

function isLowVariant(v: Variant): boolean {
  return v.reorderLevel > 0 && v.quantity <= v.reorderLevel
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
  tone: 'sky' | 'emerald' | 'rose' | 'violet'
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
    rose: {
      card: 'border-rose-500/20 bg-gradient-to-br from-rose-500/[0.14] via-card to-rose-500/[0.05]',
      icon: 'bg-gradient-to-br from-rose-500 to-rose-600 shadow-rose-500/20',
      accent: 'from-rose-500 via-rose-400',
      bubble: 'bg-rose-500/[0.10]',
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

export function InventoryPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMISSIONS.INVENTORY_CREATE)
  const canUpdate = hasPermission(PERMISSIONS.INVENTORY_UPDATE)
  const canDelete = hasPermission(PERMISSIONS.INVENTORY_DELETE)
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
  const [stockForm, setStockForm] = useState({ variantId: '', type: 'IN', quantity: '', reason: '' })
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

  const stats = useMemo(() => {
    const totalStock = items.reduce((sum, item) => sum + item.totalStock, 0)
    const lowStock = items.filter((item) => item.isLowStock).length
    const sellable = items.filter((item) => item.isSellable).length
    const variants = items.reduce((sum, item) => sum + item.variants.length, 0)
    return { total: items.length, totalStock, lowStock, sellable, variants }
  }, [items])

  const toggleExpand = (id: string) => setExpanded((s) => {
    const next = new Set(s)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
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
        sellingPrice: v.sellingPrice != null ? String(v.sellingPrice) : '',
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

    const variantsPayload = form.variants.map((v) => ({
      id: v.id,
      label: form.hasVariants ? v.label.trim() : null,
      sku: v.sku.trim() || null,
      quantity: Number(v.quantity) || 0,
      reorderLevel: Number(v.reorderLevel) || 0,
      unitPrice: null,
      sellingPrice: v.sellingPrice === '' ? null : Number(v.sellingPrice),
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
    setStockForm({ variantId: i.variants[0]?.id || '', type: 'IN', quantity: '', reason: '' })
  }
  const handleStock = async () => {
    if (!stockItem || !stockForm.variantId) return
    try {
      await api.post(`/api/school/inventory/${stockItem.id}/stock`, {
        variantId: stockForm.variantId,
        type: stockForm.type, quantity: Number(stockForm.quantity),
        unitCost: undefined,
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
    <div className="space-y-4">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <Package className="size-5.5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Inventory</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                {stats.total.toLocaleString('en-IN')} items
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">Manage stock, variants, reorder levels, and sellable store items.</p>
          </div>
        </div>
        <div className="relative flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => router.push('/inventory/sell')}
            className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{ backgroundColor: 'white', color: 'var(--primary)' }}
          >
            <ShoppingCart className="size-4" strokeWidth={2.2} />
            <span>Sell to Student</span>
          </Button>
          {canCreate && (
            <Button
              onClick={openAdd}
              className="relative shrink-0 gap-2 border border-white/30 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <PlusCircle className="size-4" strokeWidth={2.2} />
              <span className="font-semibold">Add Item</span>
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Items"
          value={stats.total.toLocaleString('en-IN')}
          description="All inventory items"
          icon={Box}
          tone="sky"
        />
        <StatCard
          title="Total Units"
          value={stats.totalStock.toLocaleString('en-IN')}
          description="Combined stock count"
          icon={Package}
          tone="emerald"
        />
        <StatCard
          title="Low Stock"
          value={stats.lowStock.toLocaleString('en-IN')}
          description="Items below reorder level"
          icon={AlertCircle}
          tone="rose"
        />
        <StatCard
          title="Sellable Items"
          value={stats.sellable.toLocaleString('en-IN')}
          description={`${stats.variants} variants across items`}
          icon={Store}
          tone="violet"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Package} title="No items" description="Add inventory items to track stock and sell to students." action={canCreate ? { label: 'Add Item', onClick: openAdd } : undefined} />
      ) : (
        <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
          <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                  <Package className="size-4" />
                </span>
                <span className="text-sm font-semibold">Inventory Items</span>
                <Badge variant="secondary" className="text-xs">
                  {items.length.toLocaleString('en-IN')}
                </Badge>
                {stats.lowStock > 0 && (
                  <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700 text-[10px] dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
                    {stats.lowStock} low
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-8 w-48 pl-7 text-xs"
                    placeholder="Search by name, SKU…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={lowStockOnly}
                    onCheckedChange={(c) => setLowStockOnly(!!c)}
                    className="size-3.5 border-rose-400 data-[state=checked]:bg-rose-500 data-[state=checked]:border-rose-500"
                  />
                  <span className="font-medium text-rose-600 dark:text-rose-400">Low stock</span>
                </label>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="mx-4 mt-4 mb-4 overflow-x-auto rounded-xl border border-sky-500/15 shadow-sm">
              <Table>
                <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item</TableHead>
                    <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Category</TableHead>
                    <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stock</TableHead>
                    <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Variants</TableHead>
                    <TableHead className="w-14 py-2.5"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((i) => {
                    const multi = i.variantLabel != null || i.variants.length > 1
                    const isOpen = expanded.has(i.id)
                    const stockPct = i.variants.length > 0
                      ? Math.min(100, Math.round(Math.max(i.variants.reduce((s, v) => {
                          const alert = v.reorderLevel > 0 ? v.reorderLevel : 5
                          return s + (v.quantity / alert) * 100
                        }, 0) / i.variants.length, 0)))
                      : 100
                    const barColor = i.isLowStock
                      ? 'bg-rose-400'
                      : stockPct > 50
                        ? 'bg-emerald-400'
                        : 'bg-amber-400'
                    return (
                      <Fragment key={i.id}>
                        <TableRow className={cn(
                          'transition-colors group',
                          i.isLowStock ? 'bg-rose-50/60 dark:bg-rose-950/10 hover:bg-rose-100/60 dark:hover:bg-rose-950/20' : 'hover:bg-sky-500/[0.04]'
                        )}>
                          <TableCell className="py-2.5">
                            {multi && (
                              <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" onClick={() => toggleExpand(i.id)}>
                                {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                                i.isLowStock
                                  ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/40'
                                  : 'bg-sky-100 text-sky-600 dark:bg-sky-950/40'
                              )}>
                                <Box className="size-4.5" />
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-semibold">{i.name}</span>
                                  {i.isSellable && (
                                    <Badge variant="secondary" className="h-4.5 px-1.5 text-[9px] font-medium uppercase tracking-wider">
                                      Sellable
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                                  {i.sku && <span className="font-mono text-[10px]">{i.sku}</span>}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              {i.categoryRef?.name || i.category || 'Uncategorized'}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col items-start gap-0.5">
                                <span className={cn('text-sm tabular-nums font-semibold', i.isLowStock ? 'text-rose-600 dark:text-rose-400' : '')}>
                                  {i.totalStock} {i.unit || ''}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className={cn('h-full rounded-full transition-all', barColor)}
                                      style={{ width: `${Math.min(100, stockPct)}%` }}
                                    />
                                  </div>
                                  {i.isLowStock && (
                                    <Badge variant="outline" className="h-4.5 border-rose-300 bg-rose-50 px-1 text-[9px] font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
                                      <AlertTriangle className="mr-0.5 size-2.5" />Low
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5">
                            {multi ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950/30 dark:text-violet-400">
                                <Boxes className="size-3" />
                                {i.variants.length}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-7 opacity-60 transition-opacity group-hover:opacity-100">
                                  <MoreVertical className="size-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-36">
                                {canUpdate && (
                                  <>
                                    <DropdownMenuItem onClick={() => openStock(i)} className="gap-2">
                                      <span className="flex size-5 items-center justify-center rounded bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50">
                                        <PackagePlus className="size-3" />
                                      </span>
                                      Adjust Stock
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openEdit(i)} className="gap-2">
                                      <span className="flex size-5 items-center justify-center rounded bg-sky-100 text-sky-600 dark:bg-sky-950/50">
                                        <Pencil className="size-3" />
                                      </span>
                                      Edit
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {canDelete && (
                                  <DropdownMenuItem onClick={() => setDeleteItem(i)} className="gap-2 text-destructive focus:text-destructive">
                                    <span className="flex size-5 items-center justify-center rounded bg-rose-100 text-rose-600 dark:bg-rose-950/50">
                                      <Trash2 className="size-3" />
                                    </span>
                                    Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                        {multi && isOpen && i.variants.map((v) => (
                          <TableRow key={v.id} className="bg-muted/15 dark:bg-muted/5 border-t-0">
                            <TableCell className="w-8 border-l-2 border-sky-200 dark:border-sky-800" />
                            <TableCell colSpan={2} className="py-2 pl-10">
                              <div className="flex items-center gap-2">
                                <span className="flex size-5 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
                                  {i.variants.indexOf(v) + 1}
                                </span>
                                <span className="text-sm font-medium">{v.label}</span>
                                {v.sku && <span className="text-[10px] text-muted-foreground font-mono">{v.sku}</span>}
                              </div>
                            </TableCell>
                            <TableCell className="py-2">
                              <div className="flex items-center gap-1.5">
                                <span className={cn('text-sm tabular-nums', isLowVariant(v) ? 'font-semibold text-rose-600 dark:text-rose-400' : '')}>
                                  {v.quantity}
                                </span>
                                {isLowVariant(v) && (
                                  <Badge variant="outline" className="h-4.5 border-rose-300 bg-rose-50 px-1 text-[9px] text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
                                    Low
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell colSpan={2} className="py-2 text-xs text-muted-foreground">
                              {v.sellingPrice != null ? (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                                  <span className="tabular-nums">₹{v.sellingPrice}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-3xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-emerald-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <PackagePlus className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">{editingId ? 'Edit Inventory Item' : 'Add Inventory Item'}</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">Add the item details, opening stock, and selling price used by store sales.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-emerald-500/[0.055] p-4 sm:p-5">
            <div className="space-y-4">
              <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-sky-500/10 sm:p-5">
                <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
                <div className="relative mb-3 flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm"><Tags className="size-4 text-white" /></span>
                  <div><h3 className="text-sm font-semibold">Item details</h3><p className="text-[10px] text-muted-foreground">Name, code and category</p></div>
                </div>
                <div className="relative grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="inventory-name" className="text-xs">Item name *</Label>
                    <Input id="inventory-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. School Shirt" className="h-9 bg-white shadow-sm dark:bg-input/30" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inventory-sku" className="text-xs">Item code / SKU</Label>
                    <Input id="inventory-sku" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} placeholder="e.g. SHIRT-WHITE" className="h-9 bg-white shadow-sm dark:bg-input/30" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Category</Label>
                    <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                      <SelectTrigger className="h-9 w-full bg-white shadow-sm dark:bg-input/30"><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.06] via-card to-emerald-500/[0.02] p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Store className="size-4 text-emerald-600" />
                      Sellable item
                    </div>
                    <p className="text-xs text-muted-foreground">Show this item in Sell to Student.</p>
                  </div>
                  <Switch checked={form.isSellable} onCheckedChange={(c) => setForm((f) => ({ ...f, isSellable: c }))} aria-label="Toggle sellable item" />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-violet-500/15 bg-gradient-to-br from-violet-500/[0.06] via-card to-violet-500/[0.02] p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Boxes className="size-4 text-violet-600" />
                      Variants
                    </div>
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

              <section className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10 sm:p-5">
                <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-emerald-200/35 blur-xl dark:bg-emerald-500/15" />
                <div className="relative mb-3 flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm"><Boxes className="size-4 text-white" /></span>
                  <div><h3 className="text-sm font-semibold">Stock and pricing</h3><p className="text-[10px] text-muted-foreground">Quantities, alerts and selling price per variant</p></div>
                </div>
                <div className="relative">

              {form.hasVariants && (
                <div className="max-w-sm space-y-2">
                  <Label>Variant type *</Label>
                  <Input className="max-w-xs" value={form.variantLabel} onChange={(e) => setForm((f) => ({ ...f, variantLabel: e.target.value }))} placeholder="e.g. Size, Class" />
                </div>
              )}

              <div className="-mx-1 overflow-x-auto rounded-lg border bg-background shadow-xs">
                <Table>
                  <TableHeader className="bg-gradient-to-r from-primary/[0.06] to-teal-600/[0.04]">
                    <TableRow>
                      {form.hasVariants && <TableHead className="min-w-24 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{form.variantLabel.trim() || 'Label'}</TableHead>}
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{editingId ? 'Stock' : 'Opening Qty'}</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Low Stock Alert</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sell Price</TableHead>
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
                <Button variant="outline" size="sm" className="mt-2 gap-1.5 border-primary/20 text-primary" onClick={addVariantRow}><PlusCircle className="size-4" />Add {form.variantLabel.trim() || 'variant'}</Button>
              )}
              {editingId && <p className="mt-2 text-xs text-muted-foreground">Changing a stock figure here records a recount adjustment. Use Adjust Stock for restocking.</p>}
              </div>
              </section>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={handleSave} disabled={saving || !form.name.trim() || !(editingId ? canUpdate : canCreate)}>
              <PackagePlus className="size-3.5" />
              {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock movement dialog */}
      <Dialog open={!!stockItem} onOpenChange={(o) => !o && setStockItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm">
                <PackagePlus className="size-5" />
              </span>
              <div>
                <DialogTitle>Adjust Stock</DialogTitle>
                <DialogDescription>{stockItem?.name}</DialogDescription>
              </div>
            </div>
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
                  <SelectItem value="IN">
                    <div className="flex items-center gap-2">
                      <PackagePlus className="size-4 text-emerald-600" />
                      <span>Stock In (restock)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="OUT">
                    <div className="flex items-center gap-2">
                      <Package className="size-4 text-rose-600" />
                      <span>Stock Out (consume/waste)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ADJUST">
                    <div className="flex items-center gap-2">
                      <Boxes className="size-4 text-amber-600" />
                      <span>Set exact count (recount)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{stockForm.type === 'ADJUST' ? 'New count' : 'Quantity'}</Label>
              <Input type="number" value={stockForm.quantity} onChange={(e) => setStockForm((f) => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input value={stockForm.reason} onChange={(e) => setStockForm((f) => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockItem(null)}>Cancel</Button>
            <Button onClick={handleStock} disabled={stockForm.quantity === '' || !stockForm.variantId || !canUpdate} className="gap-2">
              <PackagePlus className="size-4" /> Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-sm">
                <Trash2 className="size-5" />
              </span>
              <div>
                <AlertDialogTitle>Delete {deleteItem?.name}?</AlertDialogTitle>
                <AlertDialogDescription>This soft-deletes the item and all its variants. Its sales history is preserved.</AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
