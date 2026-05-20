'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { EmptyState, LoadingState, PageHeader } from '@/components/shared'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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
  ONE_TIME: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
  QUARTERLY: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-300',
  HALF_YEARLY: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300',
  INSTALLMENT: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300',
  ON_DEMAND: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300',
  CUSTOM: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300',
}

function getFrequencyOption(freq: FeeFrequency) {
  return FREQUENCY_OPTIONS.find((option) => option.value === freq) || FREQUENCY_OPTIONS[0]
}

export function FeesHeadsPage() {
  const { toast } = useToast()
  const goBack = useAppStore((state) => state.goBack)
  const navigateTo = useAppStore((state) => state.navigateTo)

  const [feeHeads, setFeeHeads] = useState<FeeHead[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FeeHeadForm>(DEFAULT_FORM)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [frequencyFilter, setFrequencyFilter] = useState<FrequencyFilter>('ALL')

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
    <div className="space-y-4">
      <PageHeader
        title="Fee Heads"
        description="Define the fee names and billing behavior used in fee structures."
        backAction={{ onClick: () => goBack('dashboard') }}
        secondaryAction={{ label: 'Fee Groups', icon: Layers3, onClick: () => navigateTo('fees-groups') }}
        action={{ label: 'Add Fee Head', icon: PlusCircle, onClick: () => setShowAdd(true) }}
      />

      {feeHeads.length === 0 ? (
        <EmptyState
          icon={IndianRupee}
          title="No Fee Heads"
          description="Create fee heads such as Tuition Fee, Lab Fee, Annual Charge, or Security Deposit."
          action={{ label: 'Add Fee Head', onClick: () => setShowAdd(true) }}
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0 shadow-sm">
          <CardHeader className="border-b bg-muted/30 px-4 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <CardTitle className="text-base">Fee Head Library</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {filteredFeeHeads.length} of {feeHeads.length} heads shown
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_190px] xl:w-[650px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search fee heads..."
                    className="h-9 pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Status</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={frequencyFilter} onValueChange={(value) => setFrequencyFilter(value as FrequencyFilter)}>
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
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 hover:bg-muted/20">
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
                      <TableRow key={head.id} className="group">
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
                              <CheckCircle2 className="size-4 text-emerald-600" />
                            ) : (
                              <XCircle className="size-4 text-muted-foreground" />
                            )}
                            <span className={cn('text-sm font-medium', !head.isActive && 'text-muted-foreground')}>
                              {head.isActive ? 'Active' : 'Inactive'}
                            </span>
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
          </CardContent>
        </Card>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <IndianRupee className="size-5" />
              </span>
              Add Fee Head
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-3">
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

            <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3">
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={saving || !form.name.trim()}>
              {saving ? 'Adding...' : 'Add Fee Head'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
