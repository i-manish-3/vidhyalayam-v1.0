'use client'

import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { EmptyState, LoadingState } from '@/components/shared'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
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
import { ArrowLeft, Calendar, CheckCircle2, ChevronDown, ChevronRight, FileText, Info, LayoutGrid, PlusCircle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

type FeeFrequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM' | 'INSTALLMENT' | 'ON_DEMAND'

interface FeeHead {
  id: string
  name: string
  frequency: FeeFrequency
  isActive: boolean
  headType?: string
  isOptional?: boolean
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
  feeHead?: FeeHead
  installmentName?: string
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
  feesGroupId?: string
  feeGroup?: FeeGroup
  class?: { id: string; name: string }
  section?: { id: string; name: string }
  items: InstallmentItem[]
  isActive?: boolean
  status?: string
  version?: number
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

interface StructureInstallmentRow {
  feeHeadId: string
  feeHeadName: string
  frequency: FeeFrequency
  period: string
  amount: string
  dueDate: string
  lateFee: string
}

// ── Constants ──────────────────────────────────────────────────────────

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']
const QUARTERS = ['Q1 (Apr-Jun)', 'Q2 (Jul-Sep)', 'Q3 (Oct-Dec)', 'Q4 (Jan-Mar)']
const HALF_YEARS = ['H1 (Apr-Sep)', 'H2 (Oct-Mar)']

const FREQUENCY_BADGE_CLASSES: Record<FeeFrequency, string> = {
  MONTHLY: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  YEARLY: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
  ONE_TIME: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  QUARTERLY: 'bg-teal-100 text-teal-800 hover:bg-teal-100',
  HALF_YEARLY: 'bg-pink-100 text-pink-800 hover:bg-pink-100',
  INSTALLMENT: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  ON_DEMAND: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
  CUSTOM: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
}

const FREQUENCY_LABELS: Record<FeeFrequency, string> = {
  ONE_TIME: 'One Time',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half Yearly',
  YEARLY: 'Yearly',
  INSTALLMENT: 'Installment Based',
  ON_DEMAND: 'On Demand',
  CUSTOM: 'Custom',
}

function getInstallmentPeriods(frequency: FeeFrequency): string[] {
  switch (frequency) {
    case 'MONTHLY': return MONTHS
    case 'QUARTERLY': return QUARTERS
    case 'HALF_YEARLY': return HALF_YEARS
    case 'ONE_TIME': return ['One Time']
    case 'YEARLY': return ['Yearly']
    case 'INSTALLMENT': return ['Installment 1']
    case 'ON_DEMAND': return ['On Demand']
    case 'CUSTOM': return ['Custom 1']
    default:
      return ['Annual']
  }
}

function buildRowsForHead(feeHead: FeeHead): StructureInstallmentRow[] {
  return getInstallmentPeriods(feeHead.frequency).map((period) => ({
    feeHeadId: feeHead.id,
    feeHeadName: feeHead.name,
    frequency: feeHead.frequency,
    period,
    amount: '',
    dueDate: '',
    lateFee: '',
  }))
}

function isCustomPeriodFrequency(frequency: FeeFrequency) {
  return frequency === 'CUSTOM' || frequency === 'INSTALLMENT' || frequency === 'ON_DEMAND'
}

function getStructureFeeGroupId(structure: FeeStructure) {
  return structure.feeGroupId || structure.feesGroupId || ''
}

function sortStructureRows(rows: StructureInstallmentRow[]) {
  return [...rows].sort((a, b) => {
    const headCompare = a.feeHeadName.localeCompare(b.feeHeadName)
    if (headCompare !== 0) return headCompare
    return getInstallmentPeriods(a.frequency).indexOf(a.period) - getInstallmentPeriods(b.frequency).indexOf(b.period)
  })
}

// ── Component ──────────────────────────────────────────────────────────

export function FeesStructuresPage() {
  const { toast } = useToast()
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const goBack = useAppStore((s) => s.goBack)

  // Data
  const [structures, setStructures] = useState<FeeStructure[]>([])
  const [feeGroups, setFeeGroups] = useState<FeeGroup[]>([])
  const [feeHeads, setFeeHeads] = useState<FeeHead[]>([])
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
  const [classStructureForm, setClassStructureForm] = useState({
    academicYear: currentSchoolAcademicYear || getCurrentAcademicYear(),
    feeGroupId: '',
    classId: '',
    sectionId: '',
  })
  const [classStructureRows, setClassStructureRows] = useState<StructureInstallmentRow[]>([])
  const [classStructureHeadIds, setClassStructureHeadIds] = useState<string[]>([])
  const [expandedHeadId, setExpandedHeadId] = useState<string>('')
  const [savingClassStructure, setSavingClassStructure] = useState(false)
  const [activeStructure, setActiveStructure] = useState<FeeStructure | null>(null)
  // Installment rows for the add dialog
  const [installmentRows, setInstallmentRows] = useState<StructureInstallmentRow[]>([])
  const [selectedStructureHeadIds, setSelectedStructureHeadIds] = useState<string[]>([])

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [structRes, groupsRes, headsRes, clsRes, secRes, academicYearRes] = await Promise.all([
        api.get<{ structures: FeeStructure[] }>('/api/school/fees/structures'),
        api.get<{ groups: FeeGroup[] }>('/api/school/fees/groups'),
        api.get<{ heads: FeeHead[] }>('/api/school/fees/heads'),
        api.get<{ classes: ClassOption[] }>('/api/school/classes'),
        api.get<{ sections: SectionOption[] }>('/api/school/sections'),
        api.get<{ academicYears: string[] }>('/api/school/academic-years'),
      ])
      setStructures((structRes.structures || []).map((structure) => ({
        ...structure,
        feeGroup: structure.feeGroup || (structure as unknown as { feesGroup?: FeeGroup }).feesGroup,
        items: (structure.items || []).map((item) => ({
          ...item,
          period: item.period || item.installmentName || 'Annual',
          feeHeadName: item.feeHeadName || item.feeHead?.name || 'Unknown',
          dueDate: item.dueDate ? String(item.dueDate).slice(0, 10) : '',
        })),
      })))
      setFeeGroups(groupsRes.groups || [])
      setFeeHeads((headsRes.heads || []).filter((head) => head.isActive))
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
    if (!academicYearOptions.some((year) => year.value === classStructureForm.academicYear)) {
      setClassStructureForm((current) => ({
        ...current,
        academicYear: academicYearOptions[0]?.value || currentSchoolAcademicYear || getCurrentAcademicYear(),
      }))
    }
  }, [academicYearOptions, classStructureForm.academicYear, currentSchoolAcademicYear, form.academicYear])

  // Filtered sections
  const filteredSections = form.classId ? sections.filter((s) => s.classId === form.classId) : []
  const filteredClassStructureSections = classStructureForm.classId ? sections.filter((s) => s.classId === classStructureForm.classId) : []
  const availableStructureHeads = feeHeads

  useEffect(() => {
    if (!classStructureForm.academicYear || !classStructureForm.classId || !classStructureForm.feeGroupId) {
      setActiveStructure(null)
      setClassStructureHeadIds([])
      setClassStructureRows([])
      setExpandedHeadId('')
      return
    }

    const normalizedSectionId = classStructureForm.sectionId && classStructureForm.sectionId !== 'ALL'
      ? classStructureForm.sectionId
      : ''

    const existing = structures.find((structure) => {
      const structureSectionId = structure.sectionId || ''
      return structure.academicYear === classStructureForm.academicYear
        && structure.classId === classStructureForm.classId
        && getStructureFeeGroupId(structure) === classStructureForm.feeGroupId
        && structureSectionId === normalizedSectionId
        && structure.status !== 'archived'
        && structure.isActive !== false
    })

    setActiveStructure(existing || null)
    if (!existing) {
      setClassStructureHeadIds([])
      setClassStructureRows([])
      setExpandedHeadId('')
      return
    }

    const rows = (existing.items || []).map((item) => {
      const feeHead = item.feeHead || feeHeads.find((head) => head.id === item.feeHeadId)
      const frequency = (feeHead?.frequency || 'MONTHLY') as FeeFrequency
      return {
        feeHeadId: item.feeHeadId,
        feeHeadName: item.feeHeadName || feeHead?.name || 'Unknown',
        frequency,
        period: item.period || item.installmentName || 'Annual',
        amount: String(item.amount || ''),
        dueDate: item.dueDate ? String(item.dueDate).slice(0, 10) : '',
        lateFee: item.lateFee ? String(item.lateFee) : '',
      }
    })
    const headIds = Array.from(new Set(rows.map((row) => row.feeHeadId)))
    setClassStructureHeadIds(headIds)
    setClassStructureRows(sortStructureRows(rows))
    setExpandedHeadId((current) => current && headIds.includes(current) ? current : headIds[0] || '')
  }, [classStructureForm, feeHeads, structures])

  const groupedClassStructureRows = useMemo(() => {
    const map = new Map<string, StructureInstallmentRow[]>()
    classStructureRows.forEach((row) => {
      if (!map.has(row.feeHeadId)) map.set(row.feeHeadId, [])
      map.get(row.feeHeadId)!.push(row)
    })
    return map
  }, [classStructureRows])

  const toggleClassStructureHead = (feeHead: FeeHead) => {
    const isSelected = classStructureHeadIds.includes(feeHead.id)
    setClassStructureHeadIds((prev) =>
      isSelected ? prev.filter((id) => id !== feeHead.id) : [...prev, feeHead.id]
    )
    setClassStructureRows((rows) =>
      isSelected
        ? rows.filter((row) => row.feeHeadId !== feeHead.id)
        : sortStructureRows([...rows, ...buildRowsForHead(feeHead)])
    )
    setExpandedHeadId(isSelected ? '' : feeHead.id)
  }

  const updateClassStructureRow = (index: number, field: 'period' | 'amount' | 'dueDate' | 'lateFee', value: string) => {
    setClassStructureRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    )
  }

  const addClassStructurePeriodRow = (feeHeadId: string) => {
    const feeHead = feeHeads.find((head) => head.id === feeHeadId)
    if (!feeHead) return
    const existingCount = classStructureRows.filter((row) => row.feeHeadId === feeHeadId).length
    setClassStructureRows((prev) => [
      ...prev,
      {
        feeHeadId: feeHead.id,
        feeHeadName: feeHead.name,
        frequency: feeHead.frequency,
        period: `${FREQUENCY_LABELS[feeHead.frequency]} ${existingCount + 1}`,
        amount: '',
        dueDate: '',
        lateFee: '',
      },
    ])
  }

  const removeClassStructurePeriodRow = (index: number) => {
    setClassStructureRows((prev) => prev.filter((_, i) => i !== index))
  }

  const fillHeadAmounts = (feeHeadId: string, amount: string) => {
    setClassStructureRows((prev) =>
      prev.map((row) => (row.feeHeadId === feeHeadId ? { ...row, amount } : row))
    )
  }

  const saveClassFeeStructure = async () => {
    if (!classStructureForm.academicYear || !classStructureForm.classId || !classStructureForm.feeGroupId) {
      toast({ title: 'Missing Information', description: 'Please select session, class, and fee group.', variant: 'destructive' })
      return
    }

    const items = classStructureRows
      .filter((row) => classStructureHeadIds.includes(row.feeHeadId) && row.period.trim() && row.amount && Number(row.amount) > 0)
      .map((row) => ({
        feeHeadId: row.feeHeadId,
        period: row.period.trim(),
        amount: Number(row.amount),
        dueDate: row.dueDate || undefined,
        lateFee: row.lateFee ? Number(row.lateFee) : 0,
        frequency: row.frequency,
      }))

    if (items.length === 0) {
      toast({ title: 'Missing Amounts', description: 'Turn on at least one fee heading and enter an amount.', variant: 'destructive' })
      return
    }

    const className = classes.find((item) => item.id === classStructureForm.classId)?.name || 'Class'
    const groupName = feeGroups.find((item) => item.id === classStructureForm.feeGroupId)?.name || 'Fee Group'

    setSavingClassStructure(true)
    try {
      await api.post('/api/school/fees/structures', {
        name: `${className} - ${groupName} Fee Structure`,
        feeGroupId: classStructureForm.feeGroupId,
        classId: classStructureForm.classId,
        sectionId: classStructureForm.sectionId || undefined,
        academicYear: classStructureForm.academicYear,
        replaceExisting: true,
        items,
      })
      toast({ title: 'Success', description: 'Class fee structure updated successfully.' })
      fetchData()
    } catch (err) {
      toast({
        title: 'Something Went Wrong',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSavingClassStructure(false)
    }
  }

  // When fee group changes in the add dialog, show its heads first.
  const handleGroupChange = (groupId: string) => {
    setForm((f) => ({ ...f, feeGroupId: groupId, sectionId: '' }))
    setSelectedStructureHeadIds([])
    setInstallmentRows([])
  }

  const toggleStructureHead = (feeHead: FeeHead) => {
    setSelectedStructureHeadIds((prev) => {
      const isSelected = prev.includes(feeHead.id)
      const next = isSelected ? prev.filter((id) => id !== feeHead.id) : [...prev, feeHead.id]
      setInstallmentRows((rows) =>
        isSelected
          ? rows.filter((row) => row.feeHeadId !== feeHead.id)
          : [...rows, ...buildRowsForHead(feeHead)]
      )
      return next
    })
  }

  const selectAllStructureHeads = () => {
    setSelectedStructureHeadIds(availableStructureHeads.map((head) => head.id))
    setInstallmentRows(availableStructureHeads.flatMap(buildRowsForHead))
  }

  const clearStructureHeads = () => {
    setSelectedStructureHeadIds([])
    setInstallmentRows([])
  }

  // Update installment row
  const updateInstallmentRow = (index: number, field: 'period' | 'amount' | 'dueDate' | 'lateFee', value: string) => {
    setInstallmentRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    )
  }

  const addCustomPeriodRow = (feeHeadId: string) => {
    const feeHead = availableStructureHeads.find((head) => head.id === feeHeadId)
    if (!feeHead) return
    const existingCount = installmentRows.filter((row) => row.feeHeadId === feeHeadId).length
    setInstallmentRows((prev) => [
      ...prev,
      {
        feeHeadId: feeHead.id,
        feeHeadName: feeHead.name,
        frequency: feeHead.frequency,
        period: `${FREQUENCY_LABELS[feeHead.frequency]} ${existingCount + 1}`,
        amount: '',
        dueDate: '',
        lateFee: '',
      },
    ])
  }

  const removeInstallmentRow = (index: number) => {
    setInstallmentRows((prev) => prev.filter((_, i) => i !== index))
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
      .filter((row) => row.period.trim() && row.amount && Number(row.amount) > 0)
      .map((row) => ({
        feeHeadId: row.feeHeadId,
        period: row.period.trim(),
        amount: Number(row.amount),
        dueDate: row.dueDate || undefined,
        lateFee: row.lateFee ? Number(row.lateFee) : 0,
        frequency: row.frequency,
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
      setSelectedStructureHeadIds([])
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="outline" size="icon" onClick={() => goBack('dashboard')} className="mt-0.5 size-9 shrink-0">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Class Fee Structure</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure fee amounts by session, class, section, and fee group.
            </p>
          </div>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2 shrink-0">
          <PlusCircle className="size-4" />
          Add Structure
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <LayoutGrid className="size-4 text-primary" />
                Structure Setup
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Select a class context, turn on fee heads, then enter the amounts to save.
              </p>
            </div>
            {activeStructure ? (
              <Badge variant="outline" className="w-fit">Editing version {activeStructure.version || 1}</Badge>
            ) : (
              <Badge variant="secondary" className="w-fit">New structure</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-4">
          <div className="grid gap-4 rounded-md border bg-card p-4 shadow-sm md:grid-cols-4">
            <div className="space-y-2">
              <Label>Session</Label>
              <Select
                value={classStructureForm.academicYear}
                onValueChange={(value) => setClassStructureForm((current) => ({ ...current, academicYear: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select session" />
                </SelectTrigger>
                <SelectContent>
                  {academicYearOptions.map((year) => (
                    <SelectItem key={year.value} value={year.value}>{year.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Class</Label>
                {classStructureForm.classId && <span className="text-xs font-medium text-primary">1 selected</span>}
              </div>
              <Select
                value={classStructureForm.classId}
                onValueChange={(value) => setClassStructureForm((current) => ({ ...current, classId: value, sectionId: '' }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Section</Label>
              <Select
                value={classStructureForm.sectionId}
                onValueChange={(value) => setClassStructureForm((current) => ({ ...current, sectionId: value }))}
                disabled={!classStructureForm.classId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Sections</SelectItem>
                  {filteredClassStructureSections.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fee Group</Label>
              <Select
                value={classStructureForm.feeGroupId}
                onValueChange={(value) => setClassStructureForm((current) => ({ ...current, feeGroupId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select fee group" />
                </SelectTrigger>
                <SelectContent>
                  {feeGroups.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <Info className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-1">
              <h3 className="font-semibold">Before saving</h3>
              <p className="text-sm">
                Define each fee head amount for the selected session, class, section, and group. Avoid changing one-time fees after students have already been billed or paid.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[90px]">Enable</TableHead>
                  <TableHead>Fee Head</TableHead>
                  <TableHead className="w-[140px]">Schedule</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeHeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No active fee heads found. Create Fee Heads first.
                    </TableCell>
                  </TableRow>
                ) : (
                  feeHeads.map((head) => {
                    const isSelected = classStructureHeadIds.includes(head.id)
                    const rows = groupedClassStructureRows.get(head.id) || []
                    const isExpanded = expandedHeadId === head.id
                    return (
                      <Fragment key={head.id}>
                        <TableRow className={cn('transition-colors', isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'bg-muted/20')}>
                          <TableCell>
                            <Switch
                              checked={isSelected}
                              onCheckedChange={() => toggleClassStructureHead(head)}
                              disabled={!classStructureForm.classId || !classStructureForm.feeGroupId}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{head.name}</div>
                            <div className="mt-1 flex items-center gap-2">
                              <Badge className={FREQUENCY_BADGE_CLASSES[head.frequency]} variant="secondary">
                                {FREQUENCY_LABELS[head.frequency]}
                              </Badge>
                              {head.isOptional && <span className="text-xs text-muted-foreground">Optional</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={isSelected ? 'default' : 'secondary'} className={cn(!isSelected && 'bg-muted text-muted-foreground')}>
                              {isSelected ? `${rows.length} row${rows.length !== 1 ? 's' : ''}` : 'Off'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={!isSelected}
                              onClick={() => setExpandedHeadId(isExpanded ? '' : head.id)}
                              aria-label={`Configure ${head.name}`}
                            >
                              {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isSelected && isExpanded && (
                          <TableRow key={`${head.id}-setup`} className="bg-muted/30 hover:bg-muted/30">
                            <TableCell colSpan={4}>
                              <div className="space-y-4 rounded-md border bg-background p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">{FREQUENCY_LABELS[head.frequency]}</Badge>
                                    <span className="text-sm font-medium">{head.name} amount schedule</span>
                                  </div>
                                  <Input
                                    type="number"
                                    placeholder="Copy amount to all rows"
                                    className="h-8 w-48"
                                    onBlur={(event) => {
                                      if (event.currentTarget.value) fillHeadAmounts(head.id, event.currentTarget.value)
                                    }}
                                  />
                                  <div className="flex items-center gap-2">
                                    {isCustomPeriodFrequency(head.frequency) && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => addClassStructurePeriodRow(head.id)}
                                      >
                                        Add Period
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  {rows.map((row) => {
                                    const globalIdx = classStructureRows.indexOf(row)
                                    return (
                                      <div key={`${row.feeHeadId}-${row.period}-${globalIdx}`} className="grid gap-2 rounded-md border p-3 md:grid-cols-[minmax(120px,1fr)_1fr_1fr_1fr_36px] md:items-end">
                                        <div className="space-y-1">
                                          <Label className="text-xs">Period</Label>
                                          {isCustomPeriodFrequency(row.frequency) ? (
                                            <Input
                                              value={row.period}
                                              onChange={(event) => updateClassStructureRow(globalIdx, 'period', event.target.value)}
                                              className="h-8"
                                            />
                                          ) : (
                                            <div className="flex h-8 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
                                              {row.period}
                                            </div>
                                          )}
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">Amount</Label>
                                          <Input
                                            type="number"
                                            placeholder="Amount"
                                            value={row.amount}
                                            onChange={(event) => updateClassStructureRow(globalIdx, 'amount', event.target.value)}
                                            className="h-8"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">Due Date</Label>
                                          <Input
                                            type="date"
                                            value={row.dueDate}
                                            onChange={(event) => updateClassStructureRow(globalIdx, 'dueDate', event.target.value)}
                                            className="h-8"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs">Late Fee</Label>
                                          <Input
                                            type="number"
                                            placeholder="Late fee"
                                            value={row.lateFee}
                                            onChange={(event) => updateClassStructureRow(globalIdx, 'lateFee', event.target.value)}
                                            className="h-8"
                                          />
                                        </div>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-muted-foreground"
                                          onClick={() => removeClassStructurePeriodRow(globalIdx)}
                                          disabled={!isCustomPeriodFrequency(row.frequency)}
                                          aria-label="Remove period"
                                        >
                                          <Trash2 className="size-3.5" />
                                        </Button>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-xs">
              {classStructureForm.classId && (
                <Badge variant="secondary">Class: {classes.find((item) => item.id === classStructureForm.classId)?.name}</Badge>
              )}
              {classStructureForm.feeGroupId && (
                <Badge variant="secondary">Group: {feeGroups.find((item) => item.id === classStructureForm.feeGroupId)?.name}</Badge>
              )}
              {activeStructure && (
                <Badge variant="outline">Editing version {activeStructure.version || 1}</Badge>
              )}
            </div>
            <Button
              onClick={saveClassFeeStructure}
              disabled={savingClassStructure || !classStructureForm.classId || !classStructureForm.feeGroupId}
            >
              {savingClassStructure ? 'Saving...' : 'Save Fee Structure'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {structures.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No Fee Structures"
          description="Create fee structures to define installment plans for different classes and groups."
          action={{ label: 'Add Structure', onClick: () => setShowAdd(true) }}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Saved Structures</h2>
              <p className="text-sm text-muted-foreground">{structures.length} fee structure{structures.length !== 1 ? 's' : ''} configured</p>
            </div>
          </div>
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
                    <CardHeader className="cursor-pointer border-l-4 border-l-primary/70 pb-4 transition-colors hover:bg-muted/30">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <FileText className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-base">{structure.name}</CardTitle>
                            {structure.isActive !== undefined && (
                              <Badge variant={structure.isActive ? 'default' : 'destructive'} className="gap-1">
                                {structure.isActive && <CheckCircle2 className="size-3" />}
                                {structure.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            <Badge variant="secondary">Class {structure.class?.name || '-'}</Badge>
                            {structure.section?.name && (
                              <Badge variant="secondary">Section {structure.section.name}</Badge>
                            )}
                            <Badge variant="secondary">{structure.academicYear}</Badge>
                            {structure.feeGroup?.name && (
                              <Badge variant="secondary">{structure.feeGroup.name}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="outline">
                            {(structure.items || []).length} row{(structure.items || []).length !== 1 ? 's' : ''}
                          </Badge>
                          {isExpanded ? (
                            <ChevronDown className="size-5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="border-t bg-muted/10 pt-4">
                      {groupedItems.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No installment details available
                        </p>
                      ) : (
                        <div className="space-y-6">
                          {groupedItems.map((group, gIdx) => (
                            <div key={gIdx}>
                              <div className="mb-2 flex items-center gap-2">
                                <h4 className="font-medium text-sm">{group.feeHeadName}</h4>
                                {group.items[0] && (
                                  <Badge variant="outline" className="text-xs">
                                    {group.items.length} period{group.items.length !== 1 ? 's' : ''}
                                  </Badge>
                                )}
                              </div>
                              <div className="overflow-hidden rounded-md border bg-background">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-muted/30">
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
                                          Rs {Number(item.amount).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                          {item.dueDate || '-'}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                          {item.lateFee ? `Rs ${Number(item.lateFee).toLocaleString()}` : '-'}
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

            {form.feeGroupId && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-base font-semibold">Select Fee Heads</Label>
                    <p className="text-xs text-muted-foreground">
                      Choose only the heads that should apply to this academic year, class, and selected fee group.
                    </p>
                  </div>
                  {availableStructureHeads.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={
                        selectedStructureHeadIds.length === availableStructureHeads.length
                          ? clearStructureHeads
                          : selectAllStructureHeads
                      }
                    >
                      {selectedStructureHeadIds.length === availableStructureHeads.length ? 'Clear All' : 'Select All'}
                    </Button>
                  )}
                </div>

                {availableStructureHeads.length === 0 ? (
                  <p className="rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">
                    No active fee heads found. Create fee heads first, then come back here.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {availableStructureHeads.map((head) => {
                      const selected = selectedStructureHeadIds.includes(head.id)
                      return (
                        <div
                          key={head.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleStructureHead(head)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              toggleStructureHead(head)
                            }
                          }}
                          className={cn(
                            'flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-left transition-colors',
                            selected && 'border-primary bg-primary/5'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox checked={selected} aria-label={`Select ${head.name}`} />
                            <div>
                              <div className="text-sm font-medium">{head.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {head.isOptional ? 'Optional' : 'Mandatory'}
                              </div>
                            </div>
                          </div>
                          <Badge className={FREQUENCY_BADGE_CLASSES[head.frequency]} variant="secondary">
                            {FREQUENCY_LABELS[head.frequency]}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Installment Grid */}
            {installmentRows.length > 0 && (
              <div className="space-y-3">
                <Label className="text-base font-semibold">Amount Schedule</Label>
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
                              {isCustomPeriodFrequency(rows[0]?.frequency) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => addCustomPeriodRow(feeHeadId)}
                                >
                                  <PlusCircle className="mr-1 size-3" />
                                  Add Period
                                </Button>
                              )}
                            </div>
                            <div className="space-y-2 pl-0">
                              {rows.map((row, rIdx) => {
                                const globalIdx = installmentRows.indexOf(row)
                                return (
                                  <div
                                    key={`${feeHeadId}-${rIdx}`}
                                    className="grid grid-cols-[110px_1fr_1fr_1fr_32px] gap-2 items-center"
                                  >
                                    {isCustomPeriodFrequency(row.frequency) ? (
                                      <Input
                                        placeholder="Period"
                                        value={row.period}
                                        onChange={(e) =>
                                          updateInstallmentRow(globalIdx, 'period', e.target.value)
                                        }
                                        className="h-8 text-sm"
                                      />
                                    ) : (
                                      <span className="text-xs font-medium text-muted-foreground">
                                        {row.period}
                                      </span>
                                    )}
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
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground"
                                      onClick={() => removeInstallmentRow(globalIdx)}
                                      disabled={!isCustomPeriodFrequency(row.frequency)}
                                      aria-label="Remove period"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
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
