'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  FileText,
  Search,
  PlusCircle,
  Pencil,
  Trash2,
  MoreHorizontal,
  User,
  Users,
  Truck,
  Briefcase,
  IndianRupee,
  Wallet,
  BadgeCheck,
  type LucideIcon,
} from 'lucide-react'
import { StaffPicker, type PickableStaff } from '@/features/salary/components/staff-picker'
import {
  SalaryHero,
  SalaryStatCard,
  SalaryTableCard,
  SalaryPagination,
  LegendItem,
  MODAL_CONTENT_CLASSES,
  ModalHeader,
  ModalSection,
} from '@/features/salary/components/salary-ui'

interface ResolvedStaff {
  fullName: string
  employeeId: string | null
  roleLabel: string
}

interface SalaryStructure {
  id: string
  staffType: string
  staffId: string
  staff?: ResolvedStaff | null
  staffName?: string
  basicSalary: number
  hra: number
  da: number
  ta: number
  medicalAllowance: number
  specialAllowance: number
  pf: number
  esi: number
  tax: number
  otherDeductions: number
  grossSalary: number
  netSalary: number
  standardDays: number
}

const EMPTY_FORM = {
  basicSalary: '',
  hra: '',
  da: '',
  ta: '',
  medicalAllowance: '',
  specialAllowance: '',
  pf: '',
  esi: '',
  tax: '',
  otherDeductions: '',
  standardDays: '30',
}

type FormState = typeof EMPTY_FORM

const ALL = '__all__'
const PAGE_SIZES = [10, 25, 50, 100]

const money = (n: number | undefined) => `₹${(n || 0).toLocaleString('en-IN')}`

const STAFF_TYPE_META: Record<string, { label: string; tone: 'sky' | 'violet' | 'amber' | 'teal' }> = {
  teacher: { label: 'Teachers', tone: 'violet' },
  staff: { label: 'Staff', tone: 'teal' },
  driver: { label: 'Drivers', tone: 'amber' },
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      <Input type="number" min="0" className="h-9" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function SalaryStructurePage() {
  const { toast } = useToast()
  const [structures, setStructures] = useState<SalaryStructure[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<SalaryStructure | null>(null)
  const [picked, setPicked] = useState<PickableStaff | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [toDelete, setToDelete] = useState<SalaryStructure | null>(null)

  // List controls
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState(ALL)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ structures: SalaryStructure[] }>('/api/school/salary/structures')
      setStructures(res.structures || [])
    } catch {
      toast({
        title: "Couldn't Load Data",
        description: "We couldn't load the salary structures. Please refresh the page.",
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const num = (v: string) => Number(v || 0)
  const gross =
    num(form.basicSalary) +
    num(form.hra) +
    num(form.da) +
    num(form.ta) +
    num(form.medicalAllowance) +
    num(form.specialAllowance)
  const deductions = num(form.pf) + num(form.esi) + num(form.tax) + num(form.otherDeductions)
  const net = gross - deductions

  const openAdd = () => {
    setEditing(null)
    setPicked(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = (s: SalaryStructure) => {
    setEditing(s)
    setPicked(null)
    setForm({
      basicSalary: String(s.basicSalary ?? ''),
      hra: String(s.hra ?? ''),
      da: String(s.da ?? ''),
      ta: String(s.ta ?? ''),
      medicalAllowance: String(s.medicalAllowance ?? ''),
      specialAllowance: String(s.specialAllowance ?? ''),
      pf: String(s.pf ?? ''),
      esi: String(s.esi ?? ''),
      tax: String(s.tax ?? ''),
      otherDeductions: String(s.otherDeductions ?? ''),
      standardDays: String(s.standardDays ?? 30),
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        basicSalary: num(form.basicSalary),
        hra: num(form.hra),
        da: num(form.da),
        ta: num(form.ta),
        medicalAllowance: num(form.medicalAllowance),
        specialAllowance: num(form.specialAllowance),
        pf: num(form.pf),
        esi: num(form.esi),
        tax: num(form.tax),
        otherDeductions: num(form.otherDeductions),
        standardDays: num(form.standardDays) || 30,
      }
      if (editing) {
        await api.patch(`/api/school/salary/structures/${editing.id}`, payload)
        toast({ title: 'Saved', description: 'Salary structure updated.' })
      } else {
        if (!picked) return
        await api.post('/api/school/salary/structures', {
          staffType: picked.staffType,
          staffId: picked.id,
          ...payload,
        })
        toast({ title: 'Created', description: 'Salary structure created.' })
      }
      setShowForm(false)
      fetchData()
    } catch (err) {
      toast({
        title: 'Something Went Wrong',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!toDelete) return
    try {
      await api.delete(`/api/school/salary/structures/${toDelete.id}`)
      toast({ title: 'Removed', description: 'Salary structure removed.' })
      setToDelete(null)
      fetchData()
    } catch (err) {
      toast({
        title: "Couldn't Remove",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  // Client-side list filtering + pagination (structures are unbounded server-side)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return structures.filter((s) => {
      if (typeFilter !== ALL && s.staffType !== typeFilter) return false
      if (!q) return true
      const name = (s.staffName || '').toLowerCase()
      const emp = (s.staff?.employeeId || '').toLowerCase()
      const role = (s.staff?.roleLabel || '').toLowerCase()
      return name.includes(q) || emp.includes(q) || role.includes(q)
    })
  }, [structures, search, typeFilter])

  const totalPages = Math.max(Math.ceil(filtered.length / (limit || filtered.length)), 1)
  const paginated = limit === 0 ? filtered : filtered.slice((page - 1) * limit, page * limit)

  const stats = useMemo(() => {
    const byType: Record<string, number> = { teacher: 0, staff: 0, driver: 0 }
    for (const s of structures) if (byType[s.staffType] !== undefined) byType[s.staffType]++
    return {
      total: structures.length,
      teachers: byType.teacher,
      staff: byType.staff,
      drivers: byType.driver,
      gross: structures.reduce((a, s) => a + (s.grossSalary || 0), 0),
      net: structures.reduce((a, s) => a + (s.netSalary || 0), 0),
    }
  }, [structures])

  const saveDisabled = saving || (!editing && !picked) || !form.basicSalary

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      <SalaryHero
        icon={FileText}
        title="Salary Structures"
        description="Pay scales for teachers, staff, and drivers"
        badge={`${stats.total.toLocaleString('en-IN')} structures`}
        action={{ label: 'Add Structure', icon: PlusCircle, onClick: openAdd }}
      />

      {/* Stats */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SalaryStatCard title="Total Structures" value={stats.total} description="Across all staff types" icon={FileText} tone="sky" />
        <SalaryStatCard title="Teachers" value={stats.teachers} description="With a pay scale" icon={User} tone="violet" />
        <SalaryStatCard title="Staff" value={stats.staff} description="With a pay scale" icon={Briefcase} tone="teal" />
        <SalaryStatCard title="Drivers" value={stats.drivers} description="With a pay scale" icon={Truck} tone="amber" />
      </div>

      {/* List */}
      <SalaryTableCard
        title="Configured Structures"
        icon={FileText}
        badge={`${filtered.length} shown`}
        footer={
          <>
            <LegendItem color="bg-sky-500" label={`Monthly gross ₹${Math.round(stats.gross).toLocaleString('en-IN')}`} />
            <LegendItem color="bg-emerald-500" label={`Monthly net ₹${Math.round(stats.net).toLocaleString('en-IN')}`} />
            <LegendItem color="bg-violet-500" label="Teachers" />
            <LegendItem color="bg-teal-500" label="Staff" />
            <LegendItem color="bg-amber-500" label="Drivers" />
          </>
        }
      >
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 border-b border-sky-500/10 bg-gradient-to-r from-sky-500/[0.045] via-transparent to-violet-500/[0.045] px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, ID, role..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="h-9 w-full bg-background/90 pl-9 shadow-sm sm:w-64"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue placeholder="All Staff Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Staff Types</SelectItem>
              <SelectItem value="teacher">Teachers</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="driver">Drivers</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="py-8">
            <EmptyState
              icon={FileText}
              title="No Salary Structures"
              description="Create salary structures to define compensation for teachers, staff, and drivers."
              action={{ label: 'Add Structure', onClick: openAdd }}
            />
          </div>
        ) : (
          <div className="mx-4 mb-4 overflow-x-auto rounded-xl border border-sky-500/15 shadow-sm">
            <Table>
              <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                <TableRow>
                  <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                    <span className="flex items-center gap-1.5"><User className="size-3.5" />Staff Member</span>
                  </TableHead>
                  <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Basic</TableHead>
                  <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Gross</TableHead>
                  <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Deductions</TableHead>
                  <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Net Salary</TableHead>
                  <TableHead className="w-12 py-3" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((s, idx) => (
                  <TableRow
                    key={s.id}
                    className={cn('transition-colors hover:bg-sky-500/[0.04]', idx % 2 === 0 ? 'bg-transparent' : 'bg-sky-500/[0.02]')}
                  >
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-[10px] font-bold text-white shadow-sm">
                          {(s.staffName || '?').slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{s.staffName || 'Unknown'}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {s.staff?.roleLabel}
                            {s.staff?.employeeId ? ` · ${s.staff.employeeId}` : ''}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-right text-sm tabular-nums">{money(s.basicSalary)}</TableCell>
                    <TableCell className="py-3 text-right text-sm font-semibold tabular-nums">{money(s.grossSalary)}</TableCell>
                    <TableCell className="py-3 text-right text-sm tabular-nums text-rose-600 dark:text-rose-400">
                      {money((s.pf || 0) + (s.esi || 0) + (s.tax || 0) + (s.otherDeductions || 0))}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300">
                        {money(s.netSalary)}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8 transition-all hover:scale-110 hover:bg-primary/5">
                            <MoreHorizontal className="size-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 border-primary/10 shadow-xl">
                          <DropdownMenuLabel className="text-xs font-bold text-foreground/80">Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openEdit(s)} className="gap-2.5">
                            <Pencil className="size-4 text-sky-600 dark:text-sky-400" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setToDelete(s)}
                            className="gap-2.5 text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                          >
                            <Trash2 className="size-4" /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {filtered.length > 0 && (
          <SalaryPagination
            page={page}
            limit={limit}
            total={filtered.length}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setLimit(size); setPage(1) }}
            label="structures"
            sizes={PAGE_SIZES}
            includeAll
          />
        )}
      </SalaryTableCard>

      {/* Add / Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className={MODAL_CONTENT_CLASSES}>
          <ModalHeader
            icon={editing ? Pencil : Wallet}
            title={editing ? 'Edit Salary Structure' : 'Add Salary Structure'}
            description={
              editing
                ? `Updating structure for ${editing.staffName || 'this staff member'}.`
                : 'Choose any teacher, staff member, or driver and define their compensation.'
            }
          />
          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-emerald-500/[0.04] via-background to-cyan-500/[0.055] p-4 sm:p-5">
            {!editing && (
              <ModalSection icon={Users} title="Staff Member" subtitle="Who is this structure for?">
                <StaffPicker value={picked ? { staffType: picked.staffType, staffId: picked.id } : undefined} onChange={setPicked} />
              </ModalSection>
            )}
            <ModalSection icon={BadgeCheck} title="Earnings" subtitle="Monthly allowances paid to the employee">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Basic Salary" value={form.basicSalary} onChange={(v) => setForm((f) => ({ ...f, basicSalary: v }))} />
                <Field label="HRA" value={form.hra} onChange={(v) => setForm((f) => ({ ...f, hra: v }))} />
                <Field label="DA" value={form.da} onChange={(v) => setForm((f) => ({ ...f, da: v }))} />
                <Field label="TA" value={form.ta} onChange={(v) => setForm((f) => ({ ...f, ta: v }))} />
                <Field label="Medical" value={form.medicalAllowance} onChange={(v) => setForm((f) => ({ ...f, medicalAllowance: v }))} />
                <Field label="Special Allowance" value={form.specialAllowance} onChange={(v) => setForm((f) => ({ ...f, specialAllowance: v }))} />
              </div>
            </ModalSection>
            <ModalSection icon={IndianRupee} title="Deductions" subtitle="Monthly statutory and other deductions">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="PF" value={form.pf} onChange={(v) => setForm((f) => ({ ...f, pf: v }))} />
                <Field label="ESI" value={form.esi} onChange={(v) => setForm((f) => ({ ...f, esi: v }))} />
                <Field label="Tax (TDS)" value={form.tax} onChange={(v) => setForm((f) => ({ ...f, tax: v }))} />
                <Field label="Other Deductions" value={form.otherDeductions} onChange={(v) => setForm((f) => ({ ...f, otherDeductions: v }))} />
              </div>
              <div className="mt-3 space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Standard Days / Month</Label>
                <Input
                  type="number"
                  min="1"
                  className="h-9 max-w-28"
                  value={form.standardDays}
                  onChange={(e) => setForm((f) => ({ ...f, standardDays: e.target.value }))}
                />
              </div>
            </ModalSection>
            <div className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-4 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-emerald-500/10">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross Salary</span>
                  <span className="font-semibold tabular-nums">{money(gross)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Deductions</span>
                  <span className="text-rose-600 dark:text-rose-400 tabular-nums">{money(deductions)}</span>
                </div>
                <div className="flex justify-between border-t border-emerald-200/70 pt-1.5 text-base font-bold">
                  <span>Net Salary</span>
                  <span className="text-emerald-700 dark:text-emerald-300 tabular-nums">{money(net)}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button size="sm" variant="outline" className="h-8 px-4 text-xs" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-8 px-4 text-xs" onClick={handleSave} disabled={saveDisabled}>
              {editing ? 'Save Changes' : 'Create Structure'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove salary structure?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the salary structure for {toDelete?.staffName || 'this staff member'}. Existing
              payslips are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}