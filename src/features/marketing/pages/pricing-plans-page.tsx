'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
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
  Search,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CreditCard,
  Package,
  CheckCircle2,
  XCircle,
  ArrowUpDown,
  Star,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PricingPlan {
  id: string
  name: string
  pricePerStudent: number
  billingCycle: string
  description: string | null
  features: string
  highlights: string | null
  isActive: boolean
  isPopular: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

interface PricingAddon {
  id: string
  name: string
  description: string
  icon: string
  price: number
  priceLabel: string
  type: string
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

type PricingItem = PricingPlan | PricingAddon

interface PlanFormState {
  name: string
  pricePerStudent: number
  billingCycle: string
  description: string
  features: string
  highlights: string
  isActive: boolean
  isPopular: boolean
  sortOrder: number
}

interface AddonFormState {
  name: string
  description: string
  icon: string
  price: number
  priceLabel: string
  type: string
  isActive: boolean
  sortOrder: number
}

type FormState = PlanFormState | AddonFormState

const DEFAULT_PLAN_FEATURES = [
  'Student & Teacher Management',
  'Smart Attendance Tracking',
  'Fee Collection & Receipts',
  'Exam & Timetable Management',
  'Parent & Student Portals',
  'Transport & Library Modules',
  'Notifications & Announcements',
  'Inventory & Petty Cash',
  'Role-Based Access Control',
  'Reports & Analytics',
  'Free Data Migration & Setup',
  'Dedicated Onboarding Support',
]

const DEFAULT_PLAN_HIGHLIGHTS = [
  'Data migration included',
  'Free setup & onboarding',
  'All core features',
]

const EMPTY_PLAN_FORM: PlanFormState = {
  name: '',
  pricePerStudent: 10,
  billingCycle: 'monthly',
  description: '',
  features: DEFAULT_PLAN_FEATURES.join('\n'),
  highlights: DEFAULT_PLAN_HIGHLIGHTS.join('\n'),
  isActive: true,
  isPopular: false,
  sortOrder: 0,
}

const EMPTY_ADDON_FORM: AddonFormState = {
  name: '',
  description: '',
  icon: 'Wallet',
  price: 0,
  priceLabel: '',
  type: 'one_time',
  isActive: true,
  sortOrder: 0,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isPlan(item: PricingItem): item is PricingPlan {
  return 'pricePerStudent' in item
}

function parseJsonArray(str: string | null): string[] {
  if (!str) return []
  try {
    const parsed = JSON.parse(str)
    if (Array.isArray(parsed)) return parsed.map(String)
    return []
  } catch {
    return []
  }
}

function jsonArrayToLines(str: string | null): string {
  return parseJsonArray(str).join('\n')
}

function linesToJsonArray(lines: string): string {
  const arr = lines
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  return JSON.stringify(arr)
}

// ─── Component ───────────────────────────────────────────────────────────────

type TabType = 'plan' | 'addon'

export function PricingPlansPage() {
  const { user } = useAppStore()
  const { toast } = useToast()

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('plan')

  // Plan state
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [plansTotal, setPlansTotal] = useState(0)
  const [plansLoading, setPlansLoading] = useState(true)

  // Addon state
  const [addons, setAddons] = useState<PricingAddon[]>([])
  const [addonsTotal, setAddonsTotal] = useState(0)
  const [addonsLoading, setAddonsLoading] = useState(true)

  // Shared UI state
  const [search, setSearch] = useState('')

  // Dialog states
  const [formOpen, setFormOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_PLAN_FORM)
  const [isSaving, setIsSaving] = useState(false)

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // ─── Fetch ─────────────────────────────────────────────────────────────────

  const fetchPlans = useCallback(async () => {
    setPlansLoading(true)
    try {
      const params: Record<string, string> = { type: 'plan' }
      if (search) params.search = search
      const data = await api.get<{ items: PricingPlan[]; total: number }>(
        '/api/super-admin/pricing?' + new URLSearchParams(params).toString()
      )
      setPlans(data.items)
      setPlansTotal(data.total)
    } catch {
      toast({ title: 'Couldn\'t Load Pricing Plans', description: 'We couldn\'t load the pricing plans. Please refresh the page.', variant: 'destructive' })
    } finally {
      setPlansLoading(false)
    }
  }, [search, toast])

  const fetchAddons = useCallback(async () => {
    setAddonsLoading(true)
    try {
      const params: Record<string, string> = { type: 'addon' }
      if (search) params.search = search
      const data = await api.get<{ items: PricingAddon[]; total: number }>(
        '/api/super-admin/pricing?' + new URLSearchParams(params).toString()
      )
      setAddons(data.items)
      setAddonsTotal(data.total)
    } catch {
      toast({ title: 'Couldn\'t Load Add-ons', description: 'We couldn\'t load the pricing add-ons. Please refresh the page.', variant: 'destructive' })
    } finally {
      setAddonsLoading(false)
    }
  }, [search, toast])

  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  useEffect(() => {
    fetchAddons()
  }, [fetchAddons])

  // ─── Derived state ─────────────────────────────────────────────────────────

  const isLoading = activeTab === 'plan' ? plansLoading : addonsLoading
  const items = activeTab === 'plan' ? plans : addons
  const total = activeTab === 'plan' ? plansTotal : addonsTotal

  const activeCount = items.filter(i => i.isActive).length
  const inactiveCount = items.filter(i => !i.isActive).length

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleOpenAdd = () => {
    setIsEditing(false)
    setEditingId(null)
    setForm(activeTab === 'plan' ? EMPTY_PLAN_FORM : EMPTY_ADDON_FORM)
    setFormOpen(true)
  }

  const handleOpenEdit = (item: PricingItem) => {
    setIsEditing(true)
    setEditingId(item.id)

    if (isPlan(item)) {
      setForm({
        name: item.name,
        pricePerStudent: item.pricePerStudent,
        billingCycle: item.billingCycle,
        description: item.description || '',
        features: jsonArrayToLines(item.features),
        highlights: jsonArrayToLines(item.highlights),
        isActive: item.isActive,
        isPopular: item.isPopular,
        sortOrder: item.sortOrder,
      } as PlanFormState)
    } else {
      const addon = item as PricingAddon
      setForm({
        name: addon.name,
        description: addon.description,
        icon: addon.icon,
        price: addon.price,
        priceLabel: addon.priceLabel,
        type: addon.type,
        isActive: addon.isActive,
        sortOrder: addon.sortOrder,
      } as AddonFormState)
    }

    setFormOpen(true)
  }

  const handleSave = async () => {
    if (activeTab === 'plan') {
      const planForm = form as PlanFormState
      if (!planForm.name.trim()) {
        toast({ title: 'Missing Information', description: 'Please enter the plan name.', variant: 'destructive' })
        return
      }

      const parsedFeatures = parseJsonArray(linesToJsonArray(planForm.features))
      if (parsedFeatures.length === 0) {
        toast({ title: 'Missing Information', description: 'Please add at least one feature.', variant: 'destructive' })
        return
      }

      setIsSaving(true)
      try {
        const body = {
          name: planForm.name.trim(),
          pricePerStudent: planForm.pricePerStudent,
          billingCycle: planForm.billingCycle,
          description: planForm.description.trim() || null,
          features: linesToJsonArray(planForm.features),
          highlights: planForm.highlights.trim() ? linesToJsonArray(planForm.highlights) : null,
          isActive: planForm.isActive,
          isPopular: planForm.isPopular,
          sortOrder: planForm.sortOrder,
        }

        if (isEditing && editingId) {
          await api.patch(`/api/super-admin/pricing/${editingId}?type=plan`, body)
          toast({ title: 'Updated', description: 'Pricing plan updated successfully' })
        } else {
          await api.post('/api/super-admin/pricing?type=plan', body)
          toast({ title: 'Created', description: 'Pricing plan created successfully' })
        }

        setFormOpen(false)
        fetchPlans()
      } catch {
        toast({ title: 'Save Failed', description: `We couldn't ${isEditing ? 'update' : 'create'} the pricing plan. Please try again.`, variant: 'destructive' })
      } finally {
        setIsSaving(false)
      }
    } else {
      const addonForm = form as AddonFormState
      if (!addonForm.name.trim()) {
        toast({ title: 'Missing Information', description: 'Please enter the add-on name.', variant: 'destructive' })
        return
      }
      if (!addonForm.description.trim()) {
        toast({ title: 'Missing Information', description: 'Please enter the add-on description.', variant: 'destructive' })
        return
      }
      if (!addonForm.icon.trim()) {
        toast({ title: 'Missing Information', description: 'Please enter the icon name.', variant: 'destructive' })
        return
      }
      if (!addonForm.priceLabel.trim()) {
        toast({ title: 'Missing Information', description: 'Please enter the price label.', variant: 'destructive' })
        return
      }

      setIsSaving(true)
      try {
        const body = {
          name: addonForm.name.trim(),
          description: addonForm.description.trim(),
          icon: addonForm.icon.trim(),
          price: addonForm.price,
          priceLabel: addonForm.priceLabel.trim(),
          type: addonForm.type,
          isActive: addonForm.isActive,
          sortOrder: addonForm.sortOrder,
        }

        if (isEditing && editingId) {
          await api.patch(`/api/super-admin/pricing/${editingId}?type=addon`, body)
          toast({ title: 'Updated', description: 'Add-on updated successfully' })
        } else {
          await api.post('/api/super-admin/pricing?type=addon', body)
          toast({ title: 'Created', description: 'Add-on created successfully' })
        }

        setFormOpen(false)
        fetchAddons()
      } catch {
        toast({ title: 'Save Failed', description: `We couldn't ${isEditing ? 'update' : 'create'} the add-on. Please try again.`, variant: 'destructive' })
      } finally {
        setIsSaving(false)
      }
    }
  }

  const handleDeleteClick = (id: string) => {
    setDeletingId(id)
    setDeleteOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingId) return
    setIsDeleting(true)
    try {
      await api.delete(`/api/super-admin/pricing/${deletingId}?type=${activeTab}`)
      toast({
        title: 'Deleted',
        description: activeTab === 'plan' ? 'Pricing plan deleted successfully' : 'Add-on deleted successfully',
      })
      setDeleteOpen(false)
      if (activeTab === 'plan') fetchPlans()
      else fetchAddons()
    } catch {
      toast({ title: 'Delete Failed', description: 'We couldn\'t delete this item. Please try again.', variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  // ─── Form helpers ──────────────────────────────────────────────────────────

  const updateForm = (key: string, value: unknown) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pricing Plans</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage pricing plans and add-ons displayed on the landing page
          </p>
        </div>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
          onClick={handleOpenAdd}
        >
          <Plus className="size-4 mr-2" />
          {activeTab === 'plan' ? 'Add Plan' : 'Add Add-on'}
        </Button>
      </div>

      {/* Tab Switcher */}
      <div className="inline-flex rounded-lg border bg-muted p-1">
        <button
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
            activeTab === 'plan'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('plan')}
        >
          <CreditCard className="size-4" />
          Base Plans
        </button>
        <button
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
            activeTab === 'addon'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('addon')}
        >
          <Package className="size-4" />
          Add-Ons
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{inactiveCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Inactive</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder={activeTab === 'plan' ? 'Search plans by name...' : 'Search add-ons by name...'}
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          {activeTab === 'plan' ? (
            <CreditCard className="size-12 text-muted-foreground/50 mx-auto" />
          ) : (
            <Package className="size-12 text-muted-foreground/50 mx-auto" />
          )}
          <p className="mt-4 text-muted-foreground font-medium">
            No {activeTab === 'plan' ? 'pricing plans' : 'add-ons'} yet
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            {activeTab === 'plan'
              ? 'Add pricing plans to showcase on the landing page'
              : 'Add add-ons to offer extra features alongside plans'}
          </p>
          <Button
            className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleOpenAdd}
          >
            <Plus className="size-4 mr-2" />
            {activeTab === 'plan' ? 'Add First Plan' : 'Add First Add-on'}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          <AnimatePresence>
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <Card className="hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row gap-4">
                      {/* Main Content */}
                      <div className="flex-1 min-w-0">
                        {isPlan(item) ? (
                          <PlanCardContent plan={item} />
                        ) : (
                          <AddonCardContent addon={item as PricingAddon} />
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 sm:flex-col sm:justify-center shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(item)}
                        >
                          <Pencil className="size-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                          onClick={() => handleDeleteClick(item.id)}
                        >
                          <Trash2 className="size-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing
                ? activeTab === 'plan' ? 'Edit Pricing Plan' : 'Edit Add-on'
                : activeTab === 'plan' ? 'Add Pricing Plan' : 'Add Add-on'}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update the details below'
                : 'Fill in the details for the new item'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {activeTab === 'plan' ? (
              <PlanFormFields form={form as PlanFormState} updateForm={updateForm} />
            ) : (
              <AddonFormFields form={form as AddonFormState} updateForm={updateForm} />
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="size-4 mr-2" />
                )}
                {isEditing
                  ? 'Save Changes'
                  : activeTab === 'plan' ? 'Create Plan' : 'Create Add-on'}
              </Button>
              <Button variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {activeTab === 'plan' ? 'Delete Pricing Plan' : 'Delete Add-on'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {activeTab === 'plan' ? 'pricing plan' : 'add-on'}?
              This action will remove it from the landing page. The data will be soft-deleted and can be
              recovered if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="size-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Plan Card Content ───────────────────────────────────────────────────────

function PlanCardContent({ plan }: { plan: PricingPlan }) {
  const featureList = parseJsonArray(plan.features)
  const highlightList = parseJsonArray(plan.highlights)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-semibold truncate">{plan.name}</h3>
        <Badge
          className={
            plan.isActive
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 text-xs'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-xs'
          }
        >
          {plan.isActive ? (
            <><CheckCircle2 className="size-3 mr-1" />Active</>
          ) : (
            <><XCircle className="size-3 mr-1" />Inactive</>
          )}
        </Badge>
        {plan.isPopular && (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 text-xs">
            <Star className="size-3 mr-1" />Popular
          </Badge>
        )}
        <Badge variant="outline" className="text-xs py-0">
          <CreditCard className="size-3 mr-1" />
          {plan.billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}
        </Badge>
        {plan.sortOrder > 0 && (
          <Badge variant="outline" className="text-xs py-0">
            <ArrowUpDown className="size-3 mr-1" />
            #{plan.sortOrder}
          </Badge>
        )}
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-emerald-600">
          ₹{plan.pricePerStudent}
        </span>
        <span className="text-sm text-muted-foreground">/student/{plan.billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
      </div>

      {plan.description && (
        <p className="text-sm text-muted-foreground line-clamp-2">{plan.description}</p>
      )}

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{featureList.length} features</span>
        {highlightList.length > 0 && (
          <span>{highlightList.length} highlights</span>
        )}
      </div>
    </div>
  )
}

// ─── Addon Card Content ──────────────────────────────────────────────────────

function AddonCardContent({ addon }: { addon: PricingAddon }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-semibold truncate">{addon.name}</h3>
        <Badge
          className={
            addon.isActive
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 text-xs'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-xs'
          }
        >
          {addon.isActive ? (
            <><CheckCircle2 className="size-3 mr-1" />Active</>
          ) : (
            <><XCircle className="size-3 mr-1" />Inactive</>
          )}
        </Badge>
        <Badge
          variant="outline"
          className="text-xs py-0"
        >
          {addon.type === 'recurring' ? 'Recurring' : 'One-time'}
        </Badge>
        {addon.sortOrder > 0 && (
          <Badge variant="outline" className="text-xs py-0">
            <ArrowUpDown className="size-3 mr-1" />
            #{addon.sortOrder}
          </Badge>
        )}
      </div>

      <p className="text-sm text-muted-foreground line-clamp-2">{addon.description}</p>

      <div className="flex items-center gap-3">
        <span className="text-lg font-bold text-emerald-600">₹{addon.price}</span>
        <span className="text-sm text-muted-foreground">{addon.priceLabel}</span>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Package className="size-3" />
        <span>Icon: {addon.icon}</span>
      </div>
    </div>
  )
}

// ─── Plan Form Fields ────────────────────────────────────────────────────────

function PlanFormFields({ form, updateForm }: { form: PlanFormState; updateForm: (key: string, value: unknown) => void }) {
  return (
    <>
      {/* Name */}
      <div className="space-y-1.5">
        <Label>Name <span className="text-red-500">*</span></Label>
        <Input
          placeholder="e.g., Basic, Premium, Enterprise"
          value={form.name}
          onChange={(e) => updateForm('name', e.target.value)}
        />
      </div>

      {/* Price Per Student */}
      <div className="space-y-1.5">
        <Label>Price Per Student (₹)</Label>
        <Input
          type="number"
          min={0}
          placeholder="10"
          value={form.pricePerStudent}
          onChange={(e) => updateForm('pricePerStudent', parseFloat(e.target.value) || 0)}
        />
        <p className="text-xs text-muted-foreground">
          Cost per student for this plan
        </p>
      </div>

      {/* Billing Cycle */}
      <div className="space-y-1.5">
        <Label>Billing Cycle</Label>
        <Select
          value={form.billingCycle}
          onValueChange={(v) => updateForm('billingCycle', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Textarea
          placeholder="A brief description of this plan..."
          value={form.description}
          onChange={(e) => updateForm('description', e.target.value)}
          rows={3}
        />
      </div>

      {/* Features */}
      <div className="space-y-1.5">
        <Label>Features <span className="text-red-500">*</span></Label>
        <Textarea
          placeholder="One feature per line..."
          value={form.features}
          onChange={(e) => updateForm('features', e.target.value)}
          rows={6}
        />
        <p className="text-xs text-muted-foreground">
          Enter one feature per line. These will be displayed as a bulleted list.
        </p>
      </div>

      {/* Highlights */}
      <div className="space-y-1.5">
        <Label>Highlights <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Textarea
          placeholder="One highlight per line..."
          value={form.highlights}
          onChange={(e) => updateForm('highlights', e.target.value)}
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          Key selling points shown prominently. One per line.
        </p>
      </div>

      {/* Active Toggle */}
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Active</Label>
          <p className="text-xs text-muted-foreground">
            Display this plan on the landing page
          </p>
        </div>
        <Switch
          checked={form.isActive}
          onCheckedChange={(checked) => updateForm('isActive', checked)}
        />
      </div>

      {/* Popular Toggle */}
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Popular</Label>
          <p className="text-xs text-muted-foreground">
            Mark this plan as popular with a special badge
          </p>
        </div>
        <Switch
          checked={form.isPopular}
          onCheckedChange={(checked) => updateForm('isPopular', checked)}
        />
      </div>

      {/* Sort Order */}
      <div className="space-y-1.5">
        <Label>Sort Order</Label>
        <Input
          type="number"
          min={0}
          placeholder="0"
          value={form.sortOrder}
          onChange={(e) => updateForm('sortOrder', parseInt(e.target.value) || 0)}
        />
        <p className="text-xs text-muted-foreground">
          Lower numbers appear first. Use 0 for default ordering.
        </p>
      </div>
    </>
  )
}

// ─── Addon Form Fields ───────────────────────────────────────────────────────

function AddonFormFields({ form, updateForm }: { form: AddonFormState; updateForm: (key: string, value: unknown) => void }) {
  return (
    <>
      {/* Name */}
      <div className="space-y-1.5">
        <Label>Name <span className="text-red-500">*</span></Label>
        <Input
          placeholder="e.g., White-label Branding, Priority Support"
          value={form.name}
          onChange={(e) => updateForm('name', e.target.value)}
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label>Description <span className="text-red-500">*</span></Label>
        <Textarea
          placeholder="What does this add-on include?"
          value={form.description}
          onChange={(e) => updateForm('description', e.target.value)}
          rows={3}
        />
      </div>

      {/* Icon */}
      <div className="space-y-1.5">
        <Label>Icon <span className="text-red-500">*</span></Label>
        <Input
          placeholder="e.g., Wallet, Crown, Palette, Globe"
          value={form.icon}
          onChange={(e) => updateForm('icon', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Lucide icon name. Available: Wallet, Crown, Palette, Globe
        </p>
      </div>

      {/* Price */}
      <div className="space-y-1.5">
        <Label>Price (₹) <span className="text-red-500">*</span></Label>
        <Input
          type="number"
          min={0}
          placeholder="0"
          value={form.price}
          onChange={(e) => updateForm('price', parseFloat(e.target.value) || 0)}
        />
      </div>

      {/* Price Label */}
      <div className="space-y-1.5">
        <Label>Price Label <span className="text-red-500">*</span></Label>
        <Input
          placeholder="e.g., /month, one-time, /year"
          value={form.priceLabel}
          onChange={(e) => updateForm('priceLabel', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Display text shown next to the price (e.g., &quot;/month&quot;, &quot;one-time&quot;)
        </p>
      </div>

      {/* Type */}
      <div className="space-y-1.5">
        <Label>Type</Label>
        <Select
          value={form.type}
          onValueChange={(v) => updateForm('type', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="one_time">One-time</SelectItem>
            <SelectItem value="recurring">Recurring</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Active Toggle */}
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Active</Label>
          <p className="text-xs text-muted-foreground">
            Display this add-on on the landing page
          </p>
        </div>
        <Switch
          checked={form.isActive}
          onCheckedChange={(checked) => updateForm('isActive', checked)}
        />
      </div>

      {/* Sort Order */}
      <div className="space-y-1.5">
        <Label>Sort Order</Label>
        <Input
          type="number"
          min={0}
          placeholder="0"
          value={form.sortOrder}
          onChange={(e) => updateForm('sortOrder', parseInt(e.target.value) || 0)}
        />
        <p className="text-xs text-muted-foreground">
          Lower numbers appear first. Use 0 for default ordering.
        </p>
      </div>
    </>
  )
}
