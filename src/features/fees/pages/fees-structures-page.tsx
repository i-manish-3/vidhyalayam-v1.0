'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear, toAcademicYearOptions } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PlusCircle, ChevronDown, ChevronRight, LayoutGrid, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

type FeeFrequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM'

interface FeeHead {
  id: string
  name: string
  frequency: FeeFrequency
  isActive: boolean
}

interface FeeGroupItem {
  id: string
  feeHeadId: string
  feeHead?: FeeHead
}

interface FeeGroup {
  id: string
  name: string
  description?: string
  items: FeeGroupItem[]
}

interface InstallmentItem {
  id?: string
  feeHeadId: string
  feeHeadName?: string
  period: string
  amount: number
  dueDate: string
  lateFee?: number
}

interface FeeStructure {
  id: string
  name: string
  classId: string
  sectionId?: string
  academicYear: string
  feeGroupId: string
  feeGroup?: FeeGroup
  class?: { id: string; name: string }
  section?: { id: string; name: string }
  items: InstallmentItem[]
  isActive?: boolean
  createdAt?: string
}

interface ClassOption {
  id: string
  name: string
}

interface SectionOption {
  id: string
  name: string
  classId: string
}

// ── Constants ──────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const QUARTERS = ['Q1 (Apr-Jun)', 'Q2 (Jul-Sep)', 'Q3 (Oct-Dec)', 'Q4 (Jan-Mar)']
const HALF_YEARS = ['H1 (Apr-Sep)', 'H2 (Oct-Mar)']

const FREQUENCY_BADGE_CLASSES: Record<FeeFrequency, string> = {
  MONTHLY: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  YEARLY: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
  ONE_TIME: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  QUARTERLY: 'bg-teal-100 text-teal-800 hover:bg-teal-100',
  HALF_YEARLY: 'bg-pink-100 text-pink-800 hover:bg-pink-100',
  CUSTOM: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
}

const FREQUENCY_LABELS: Record<FeeFrequency, string> = {
  ONE_TIME: 'One Time',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half Yearly',
  YEARLY: 'Yearly',
  CUSTOM: 'Custom',
}

function getInstallmentPeriods(frequency: FeeFrequency): string[] {
  switch (frequency) {
    case 'MONTHLY': return MONTHS
    case 'QUARTERLY': return QUARTERS
    case 'HALF_YEARLY': return HALF_YEARS
    case 'ONE_TIME':
    case 'YEARLY':
    case 'CUSTOM':
    default:
      return ['Annual']
  }
}

// ── Component ──────────────────────────────────────────────────────────

export function FeesStructuresPage() {
  const { toast } = useToast()
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)

  // Data
  const [structures, setStructures] = useState<FeeStructure[]>([])
  const [feeGroups, setFeeGroups] = useState<FeeGroup[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [availableAcademicYears, setAvailableAcademicYears] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const academicYearOptions = useMemo(
    () => toAcademicYearOptions(availableAcademicYears, currentSchoolAcademicYear),
    [availableAcademicYears, currentSchoolAcademicYear]
  )

  // Expanded cards
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Dialog state
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    feeGroupId: '',
    classId: '',
    sectionId: '',
    academicYear: currentSchoolAcademicYear || getCurrentAcademicYear(),
  })
  // Installment rows for the add dialog
  const [installmentRows, setInstallmentRows] = useState<{
    feeHeadId: string
    feeHeadName: string
    frequency: FeeFrequency
    period: string
    amount: string
    dueDate: string
    lateFee: string
  }[]>([])

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [structRes, groupsRes, clsRes, secRes, academicYearRes] = await Promise.all([
        api.get<{ structures: FeeStructure[] }>('/api/school/fees/structures'),
        api.get<{ groups: FeeGroup[] }>('/api/school/fees/groups'),
        api.get<{ classes: ClassOption[] }>('/api/school/classes'),
        api.get<{ sections: SectionOption[] }>('/api/school/sections'),
        api.get<{ academicYears: string[] }>('/api/school/academic-years'),
      ])
      setStructures(structRes.structures || [])
      setFeeGroups(groupsRes.groups || [])
      setClasses(clsRes.classes || [])
      setSections(secRes.sections || [])
      setAvailableAcademicYears(academicYearRes.academicYears || [])
    } catch {
      toast({ title: 'Couldn\'t Load Fee Structures', description: 'We couldn\'t load the fee structures. Please refresh the page.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!academicYearOptions.some((year) => year.value === form.academicYear)) {
      setForm((current) => ({
        ...current,
        academicYear: academicYearOptions[0]?.value || currentSchoolAcademicYear || getCurrentAcademicYear(),
      }))
    }
  }, [academicYearOptions, currentSchoolAcademicYear, form.academicYear])

  // Filtered sections
  const filteredSections = form.classId ? sections.filter((s) => s.classId === form.classId) : []

  // When fee group changes in the add dialog, generate installment rows
  const handleGroupChange = (groupId: string) => {
    setForm((f) => ({ ...f, feeGroupId: groupId, sectionId: '' }))

    const group = feeGroups.find((g) => g.id === groupId)
    if (!group) {
      setInstallmentRows([])
      return
    }

    const rows: typeof installmentRows = []
    ;(group.items || []).forEach((item) => {
      const feeHead = item.feeHead
      if (!feeHead) return
      const periods = getInstallmentPeriods(feeHead.frequency)
      periods.forEach((period) => {
        rows.push({
          feeHeadId: feeHead.id,
          feeHeadName: feeHead.name,
          frequency: feeHead.frequency,
          period,
          amount: '',
          dueDate: '',
          lateFee: '',
        })
      })
    })
    setInstallmentRows(rows)
  }

  // Update installment row
  const updateInstallmentRow = (index: number, field: 'amount' | 'dueDate' | 'lateFee', value: string) => {
    setInstallmentRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    )
  }

  // Toggle expanded
  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Add structure
  const handleAdd = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Missing Information', description: 'Please enter the name.', variant: 'destructive' })
      return
    }
    if (!form.feeGroupId) {
      toast({ title: 'Missing Information', description: 'Please select a fee group.', variant: 'destructive' })
      return
    }
    if (!form.classId) {
      toast({ title: 'Missing Information', description: 'Please select a class.', variant: 'destructive' })
      return
    }

    // Build items
    const items = installmentRows
      .filter((row) => row.amount && Number(row.amount) > 0)
      .map((row) => ({
        feeHeadId: row.feeHeadId,
        period: row.period,
        amount: Number(row.amount),
        dueDate: row.dueDate || undefined,
        lateFee: row.lateFee ? Number(row.lateFee) : 0,
      }))

    if (items.length === 0) {
      toast({ title: 'Missing Information', description: 'Please add at least one installment with an amount.', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      await api.post('/api/school/fees/structures', {
        name: form.name,
        feeGroupId: form.feeGroupId,
        classId: form.classId,
        sectionId: form.sectionId || undefined,
        academicYear: form.academicYear,
        items,
      })
      toast({ title: 'Success', description: 'Fee structure created successfully' })
      setShowAdd(false)
      setForm({ name: '', feeGroupId: '', classId: '', sectionId: '', academicYear: academicYearOptions[0]?.value || currentSchoolAcademicYear || getCurrentAcademicYear() })
      setInstallmentRows([])
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

  // Group installment items by feeHead for the expanded view
  const groupItemsByFeeHead = (items: InstallmentItem[] | null | undefined) => {
    const map = new Map<string, { feeHeadName: string; items: InstallmentItem[] }>()
    if (!items) return []
    items.forEach((item) => {
      const key = item.feeHeadId
      if (!map.has(key)) {
        map.set(key, { feeHeadName: item.feeHeadName || 'Unknown', items: [] })
      }
      map.get(key)!.items.push(item)
    })
    return Array.from(map.values())
  }

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return <LoadingState />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Structures"
        description={`${structures.length} fee structures configured`}
        action={{
          label: 'Add Structure',
          icon: PlusCircle,
          onClick: () => setShowAdd(true),
        }}
      />

      {structures.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No Fee Structures"
          description="Create fee structures to define installment plans for different classes and groups."
          action={{ label: 'Add Structure', onClick: () => setShowAdd(true) }}
        />
      ) : (
        <div className="space-y-4">
          {structures.map((structure) => {
            const isExpanded = expandedIds.has(structure.id)
            const groupedItems = groupItemsByFeeHead(structure.items || [])

            return (
              <Collapsible
                key={structure.id}
                open={isExpanded}
                onOpenChange={() => toggleExpanded(structure.id)}
              >
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-3">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="size-5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="size-5 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-lg">{structure.name}</CardTitle>
                            {structure.isActive !== undefined && (
                              <Badge variant={structure.isActive ? 'default' : 'destructive'}>
                                {structure.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                            <span>Class: {structure.class?.name || '-'}</span>
                            {structure.section?.name && (
                              <span>Section: {structure.section.name}</span>
                            )}
                            <span>Year: {structure.academicYear}</span>
                            {structure.feeGroup?.name && (
                              <span>Group: {structure.feeGroup.name}</span>
                            )}
                          </div>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {(structure.items || []).length} installment{(structure.items || []).length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <Separator className="mb-4" />
                      {groupedItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No installment details available
                        </p>
                      ) : (
                        <div className="space-y-6">
                          {groupedItems.map((group, gIdx) => (
                            <div key={gIdx}>
                              <div className="flex items-center gap-2 mb-2">
                                <h4 className="font-medium text-sm">{group.feeHeadName}</h4>
                                {group.items[0] && (
                                  <Badge variant="outline" className="text-xs">
                                    {group.items.length} period{group.items.length !== 1 ? 's' : ''}
                                  </Badge>
                                )}
                              </div>
                              <div className="rounded-lg border overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-[140px]">Period</TableHead>
                                      <TableHead className="w-[120px]">Amount</TableHead>
                                      <TableHead className="w-[120px]">Due Date</TableHead>
                                      <TableHead className="w-[100px]">Late Fee</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {group.items.map((item, iIdx) => (
                                      <TableRow key={iIdx}>
                                        <TableCell className="font-medium text-sm">
                                          {item.period}
                                        </TableCell>
                                        <TableCell className="font-semibold text-sm">
                                          ₹{Number(item.amount).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                          {item.dueDate || '—'}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                          {item.lateFee ? `₹${Number(item.lateFee).toLocaleString()}` : '—'}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )
          })}
        </div>
      )}

      {/* Add Fee Structure Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Add New Fee Structure</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="struct-name">Structure Name</Label>
                <Input
                  id="struct-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Class 10 Academic Fees 2025"
                />
              </div>
              <div className="space-y-2">
                <Label>Academic Year</Label>
                <Select value={form.academicYear} onValueChange={(value) => setForm((f) => ({ ...f, academicYear: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select academic year" />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYearOptions.map((year) => (
                      <SelectItem key={year.value} value={year.value}>{year.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Fee Group</Label>
                <Select value={form.feeGroupId} onValueChange={handleGroupChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select group" />
                  </SelectTrigger>
                  <SelectContent>
                    {feeGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Class</Label>
                <Select
                  value={form.classId}
                  onValueChange={(v) => setForm((f) => ({ ...f, classId: v, sectionId: '' }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Section</Label>
                <Select
                  value={form.sectionId}
                  onValueChange={(v) => setForm((f) => ({ ...f, sectionId: v }))}
                  disabled={!form.classId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All sections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Sections</SelectItem>
                    {filteredSections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Installment Grid */}
            {installmentRows.length > 0 && (
              <div className="space-y-3">
                <Label className="text-base font-semibold">Installments</Label>
                <ScrollArea className="h-72 rounded-lg border">
                  <div className="p-3 space-y-4">
                    {/* Group rows by fee head for display */}
                    {(() => {
                      const feeHeadGroups = new Map<string, typeof installmentRows>()
                      installmentRows.forEach((row) => {
                        if (!feeHeadGroups.has(row.feeHeadId)) {
                          feeHeadGroups.set(row.feeHeadId, [])
                        }
                        feeHeadGroups.get(row.feeHeadId)!.push(row)
                      })

                      return Array.from(feeHeadGroups.entries()).map(
                        ([feeHeadId, rows], gIdx) => (
                          <div key={feeHeadId} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-medium">{rows[0]?.feeHeadName}</h4>
                              <Badge
                                className={cn('text-xs', FREQUENCY_BADGE_CLASSES[rows[0]?.frequency])}
                                variant="secondary"
                              >
                                {FREQUENCY_LABELS[rows[0]?.frequency]}
                              </Badge>
                            </div>
                            <div className="space-y-2 pl-0">
                              {rows.map((row, rIdx) => {
                                const globalIdx = installmentRows.indexOf(row)
                                return (
                                  <div
                                    key={`${feeHeadId}-${rIdx}`}
                                    className="grid grid-cols-[100px_1fr_1fr_1fr] gap-2 items-center"
                                  >
                                    <span className="text-xs font-medium text-muted-foreground">
                                      {row.period}
                                    </span>
                                    <Input
                                      type="number"
                                      placeholder="Amount"
                                      value={row.amount}
                                      onChange={(e) =>
                                        updateInstallmentRow(globalIdx, 'amount', e.target.value)
                                      }
                                      className="h-8 text-sm"
                                    />
                                    <Input
                                      type="date"
                                      placeholder="Due"
                                      value={row.dueDate}
                                      onChange={(e) =>
                                        updateInstallmentRow(globalIdx, 'dueDate', e.target.value)
                                      }
                                      className="h-8 text-sm"
                                    />
                                    <Input
                                      type="number"
                                      placeholder="Late fee"
                                      value={row.lateFee}
                                      onChange={(e) =>
                                        updateInstallmentRow(globalIdx, 'lateFee', e.target.value)
                                      }
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                )
                              })}
                            </div>
                            {gIdx < Array.from(feeHeadGroups.keys()).length - 1 && (
                              <Separator />
                            )}
                          </div>
                        )
                      )
                    })()}
                  </div>
                </ScrollArea>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="size-3" />
                  Columns: Period, Amount, Due Date, Late Fee
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={saving || !form.name.trim() || !form.feeGroupId || !form.classId}
            >
              {saving ? 'Creating...' : 'Create Structure'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
