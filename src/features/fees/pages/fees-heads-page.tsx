'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  CalendarDays,
  CheckCircle2,
  IndianRupee,
  X,
  Layers3,
  MoreHorizontal,
  PlusCircle,
  ReceiptText,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type FeeFrequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM' | 'INSTALLMENT' | 'ON_DEMAND'
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'
type FrequencyFilter = 'ALL' | FeeFrequency

interface FeeHead {
  id: string
  name: string
  frequency: FeeFrequency
  isActive: boolean
  createdAt?: string
}

interface FeeHeadForm {
  name: string
  frequency: FeeFrequency
  isActive: boolean
}

const DEFAULT_FORM: FeeHeadForm = {
  name: '',
  frequency: 'MONTHLY',
  isActive: true,
}

const FREQUENCY_OPTIONS: { value: FeeFrequency; label: string; shortLabel: string; description: string; icon: LucideIcon }[] = [
  { value: 'ONE_TIME', label: 'One Time', shortLabel: 'Once', description: 'Collected once during admission or setup.', icon: ReceiptText },
  { value: 'MONTHLY', label: 'Monthly', shortLabel: '12 months', description: 'Creates monthly rows from Apr to Mar.', icon: CalendarDays },
  { value: 'QUARTERLY', label: 'Quarterly', shortLabel: '4 terms', description: 'Creates four term-wise rows.', icon: Layers3 },
  { value: 'HALF_YEARLY', label: 'Half Yearly', shortLabel: '2 terms', description: 'Creates two half-year rows.', icon: Layers3 },
  { value: 'YEARLY', label: 'Yearly', shortLabel: 'Annual', description: 'Creates one yearly row.', icon: CalendarDays },
  { value: 'INSTALLMENT', label: 'Installment Based', shortLabel: 'Installments', description: 'Allows custom installment rows.', icon: ReceiptText },
  { value: 'ON_DEMAND', label: 'On Demand', shortLabel: 'Manual', description: 'Used only when the charge is raised.', icon: IndianRupee },
  { value: 'CUSTOM', label: 'Custom', shortLabel: 'Custom', description: 'Keeps the schedule flexible.', icon: Sparkles },
]

const FREQUENCY_BADGE_CLASSES: Record<FeeFrequency, string> = {
  MONTHLY: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
  YEARLY: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-300',
  ONE_TIME: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300',
  QUARTERLY: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-300',
  HALF_YEARLY: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300',
  INSTALLMENT: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300',
  ON_DEMAND: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300',
  CUSTOM: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300',
}

function getFrequencyOption(freq: FeeFrequency) {
  return FREQUENCY_OPTIONS.find((option) => option.value === freq) || FREQUENCY_OPTIONS[0]
}

interface FeeHeadsListState {
  search: string
  statusFilter: StatusFilter
  frequencyFilter: FrequencyFilter
}

const FEE_HEADS_LIST_STATE_KEY = 'fees:heads:list'

export function FeesHeadsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const savedListState = useAppStore((state) => state.pageState[FEE_HEADS_LIST_STATE_KEY] as FeeHeadsListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)

  const [feeHeads, setFeeHeads] = useState<FeeHead[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FeeHeadForm>(DEFAULT_FORM)
  const [search, setSearch] = useState(savedListState?.search ?? '')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(savedListState?.statusFilter ?? 'ALL')
  const [frequencyFilter, setFrequencyFilter] = useState<FrequencyFilter>(savedListState?.frequencyFilter ?? 'ALL')

  const rememberListState = useCallback((patch: Partial<FeeHeadsListState>) => {
    setPageState(FEE_HEADS_LIST_STATE_KEY, {
      search,
      statusFilter,
      frequencyFilter,
      ...patch,
    })
  }, [frequencyFilter, search, setPageState, statusFilter])

  const fetchFeeHeads = useCallback(async () => {
    try {
      const data = await api.get<{ heads: FeeHead[] }>('/api/school/fees/heads')
      setFeeHeads(data.heads || [])
    } catch {
      toast({ title: "Couldn't Load Fee Heads", description: 'We could not load the fee heads. Please refresh the page.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchFeeHeads()
  }, [fetchFeeHeads])

  const filteredFeeHeads = useMemo(() => {
    const query = search.trim().toLowerCase()

    return feeHeads.filter((head) => {
      const matchesSearch = !query || [
        head.name,
        getFrequencyOption(head.frequency).label,
        head.isActive ? 'active' : 'inactive',
      ].join(' ').toLowerCase().includes(query)
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && head.isActive) ||
        (statusFilter === 'INACTIVE' && !head.isActive)
      const matchesFrequency = frequencyFilter === 'ALL' || head.frequency === frequencyFilter

      return matchesSearch && matchesStatus && matchesFrequency
    })
  }, [feeHeads, frequencyFilter, search, statusFilter])

  const handleAdd = async () => {
    const name = form.name.trim()
    if (!name) {
      toast({ title: 'Missing Information', description: 'Please enter the fee head name.', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      await api.post('/api/school/fees/heads', { ...form, name })
      toast({ title: 'Success', description: 'Fee head added successfully.' })
      setShowAdd(false)
      setForm(DEFAULT_FORM)
      fetchFeeHeads()
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

  const handleToggleActive = async (head: FeeHead) => {
    try {
      await api.patch(`/api/school/fees/heads/${head.id}`, { isActive: !head.isActive })
      toast({ title: 'Success', description: `Fee head ${head.isActive ? 'deactivated' : 'activated'} successfully.` })
      fetchFeeHeads()
    } catch (err) {
      toast({
        title: 'Something Went Wrong',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    }
  }

  if (loading) {
    return <LoadingState />
  }

  return (
    <div className="space-y-6">
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-10 -top-12 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <IndianRupee className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Fee Heads</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85">{feeHeads.length} heads</span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">Define the fee names and billing behavior used in fee structures.</p>
          </div>
        </div>
        <div className="relative flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => router.push('/fees/groups')}
            className="gap-2 border border-white/60 shadow-md"
            style={{ backgroundColor: 'white', color: 'var(--primary)' }}
          >
            <Layers3 className="size-4" />
            Fee Groups
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowAdd(true)}
            className="gap-2 border border-white/60 shadow-md"
            style={{ backgroundColor: 'white', color: 'var(--primary)' }}
          >
            <PlusCircle className="size-4" />
            Add Fee Head
          </Button>
        </div>
      </div>

      {feeHeads.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-sky-200/60 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-12 text-center shadow-sm dark:border-sky-500/20 dark:from-sky-500/5 dark:via-card dark:to-cyan-500/5">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-cyan-100 shadow-sm dark:from-sky-900/50 dark:to-cyan-900/50">
            <IndianRupee className="size-8 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-sky-900 dark:text-sky-200">No Fee Heads</h3>
            <p className="mt-1 text-sm text-sky-700/70 dark:text-sky-300/70">Create fee heads such as Tuition Fee, Lab Fee, Annual Charge, or Security Deposit.</p>
          </div>
          <Button
            onClick={() => setShowAdd(true)}
            className="gap-2 bg-gradient-to-r from-primary to-cyan-600 shadow-md shadow-primary/20"
          >
            <PlusCircle className="size-4" />
            Add Fee Head
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-cyan-200/80 bg-card shadow-sm dark:border-cyan-500/20">
          <div className="flex flex-col gap-3 border-b border-cyan-500/15 bg-gradient-to-r from-cyan-500/10 via-sky-500/5 to-violet-500/10 p-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-semibold">Fee Head Library</p>
              <p className="text-xs text-muted-foreground">
                {filteredFeeHeads.length} of {feeHeads.length} heads shown
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_190px] xl:w-[650px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    const value = event.target.value
                    setSearch(value)
                    rememberListState({ search: value })
                  }}
                  placeholder="Search fee heads..."
                  className="h-9 pl-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  const next = value as StatusFilter
                  setStatusFilter(next)
                  rememberListState({ statusFilter: next })
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={frequencyFilter}
                onValueChange={(value) => {
                  const next = value as FrequencyFilter
                  setFrequencyFilter(next)
                  rememberListState({ frequencyFilter: next })
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Frequencies</SelectItem>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gradient-to-r from-cyan-500/[0.07] via-sky-500/[0.04] to-violet-500/[0.07]">
                <TableRow>
                  <TableHead className="px-4 py-2.5">Fee Head</TableHead>
                  <TableHead className="px-4 py-2.5">Billing Behavior</TableHead>
                  <TableHead className="px-4 py-2.5">Status</TableHead>
                  <TableHead className="w-[52px] px-4 py-2.5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFeeHeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      No fee heads match the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredFeeHeads.map((head) => {
                    const frequency = getFrequencyOption(head.frequency)
                    const FrequencyIcon = frequency.icon

                    return (
                      <TableRow key={head.id} className="transition-colors hover:bg-cyan-500/[0.045]">
                        <TableCell className="px-4 py-3">
                          <div className="flex min-w-56 items-center gap-3">
                            <div className={cn(
                              'flex size-9 items-center justify-center rounded-md border',
                              head.isActive ? 'border-primary/20 bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                            )}>
                              <IndianRupee className="size-4" />
                            </div>
                            <div>
                              <div className="font-semibold leading-tight">{head.name}</div>
                              <div className="mt-0.5 text-xs text-muted-foreground">{frequency.description}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={cn('gap-1.5 border', FREQUENCY_BADGE_CLASSES[head.frequency])}>
                              <FrequencyIcon className="size-3.5" />
                              {frequency.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{frequency.shortLabel}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {head.isActive ? (
                              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                                <CheckCircle2 className="size-4" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                                <XCircle className="size-4" />
                                Inactive
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleToggleActive(head)}>
                                {head.isActive ? 'Deactivate' : 'Activate'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg border-sky-200/80 bg-gradient-to-br from-white via-sky-50/45 to-cyan-50/60 p-0 shadow-xl dark:border-sky-500/25 dark:from-card dark:via-sky-500/10 dark:to-cyan-500/10">
          <DialogHeader className="relative overflow-hidden rounded-t-lg border-b border-sky-500/15 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 p-5 text-white">
            <div aria-hidden className="absolute -right-10 -top-12 size-32 rounded-full border-[16px] border-white/15" />
            <div aria-hidden className="absolute bottom-0 right-32 h-px w-48 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
                <IndianRupee className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-white">Add Fee Head</DialogTitle>
                <DialogDescription className="text-white/80">Create a new fee head for billing fee structures.</DialogDescription>
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
                  <IndianRupee className="size-3.5" />
                </span>
                Fee details
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fee-head-name">Fee Head Name</Label>
                  <Input
                    id="fee-head-name"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="e.g., Tuition Fee, Lab Fee, Annual Charge"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Billing Behavior</Label>
                  <Select
                    value={form.frequency}
                    onValueChange={(value) => setForm((current) => ({ ...current, frequency: value as FeeFrequency }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{getFrequencyOption(form.frequency).description}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-3.5 shadow-sm dark:border-amber-500/25 dark:from-amber-500/10 dark:via-card dark:to-orange-500/10">
              <div>
                <Label htmlFor="fee-head-active" className="cursor-pointer">Active</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">Available while creating fee structures.</p>
              </div>
              <Switch
                id="fee-head-active"
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))}
              />
            </div>
          </div>
          <DialogFooter className="border-t border-sky-500/15 bg-white/80 p-4 dark:bg-card/80">
            <div className="flex w-full items-center justify-between gap-3 max-sm:flex-col">
              <p className="hidden text-xs text-sky-700 sm:block dark:text-sky-300">
                <span className="inline-flex items-center gap-1">
                  <IndianRupee className="size-3" />
                  Create a new fee head
                </span>
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setShowAdd(false)} className="bg-white dark:bg-card">
                  Cancel
                </Button>
                <Button
                  onClick={handleAdd}
                  disabled={saving || !form.name.trim()}
                  className="gap-1.5 bg-gradient-to-r from-primary to-cyan-600 shadow-sm shadow-primary/20"
                >
                  {saving ? 'Adding...' : 'Add Fee Head'}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
