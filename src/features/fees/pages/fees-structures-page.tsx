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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DatePicker } from '@/components/date-picker'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Info,
  LayoutGrid,
  ListChecks,
  PlusCircle,
  School,
  Settings2,
  Search,
  Tags,
  Trash2,
} from 'lucide-react'
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
const DEFAULT_FEE_GROUP_NAME = '_DEFAULT'

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

function canAutoFillDueDates(frequency: FeeFrequency) {
  return frequency === 'MONTHLY' || frequency === 'QUARTERLY' || frequency === 'HALF_YEARLY'
}

function parseAcademicYear(value: string) {
  const [startYear, endYear] = value.split('-').map((part) => Number(part))
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null
  return { startYear, endYear }
}

function formatDateInput(year: number, monthIndex: number, day: number) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  const safeDay = Math.min(day, lastDay)
  const month = String(monthIndex + 1).padStart(2, '0')
  const date = String(safeDay).padStart(2, '0')
  return `${year}-${month}-${date}`
}

function dueDateForPeriod(period: string, academicYear: string, day: number) {
  const academic = parseAcademicYear(academicYear)
  if (!academic) return ''

  const normalizedPeriod = period.trim().toLowerCase()
  const monthIndex = MONTHS.findIndex((month) => normalizedPeriod.includes(month.toLowerCase()))
  if (monthIndex === -1) return ''

  const calendarMonthIndex = monthIndex <= 8 ? monthIndex + 3 : monthIndex - 9
  const year = monthIndex <= 8 ? academic.startYear : academic.endYear
  return formatDateInput(year, calendarMonthIndex, day)
}

// ── Component ──────────────────────────────────────────────────────────

export function FeesStructuresPage() {
  const { toast } = useToast()
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const goBack = useAppStore((s) => s.goBack)
  const navigateTo = useAppStore((s) => s.navigateTo)
  const effectiveAcademicYear = viewingAcademicYear || currentSchoolAcademicYear || getCurrentAcademicYear()

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
  const activeSessionYear = viewingAcademicYear || currentSchoolAcademicYear || academicYearOptions[0]?.value || getCurrentAcademicYear()
  const structureYearOptions = useMemo(() => {
    if (academicYearOptions.some((year) => year.value === activeSessionYear)) return academicYearOptions
    return [{ value: activeSessionYear, label: activeSessionYear }, ...academicYearOptions]
  }, [academicYearOptions, activeSessionYear])

  // Expanded cards
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [structureSearch, setStructureSearch] = useState('')
  const [structureClassFilter, setStructureClassFilter] = useState('ALL')
  const [structureGroupFilter, setStructureGroupFilter] = useState('ALL')
  const [structureYearFilter, setStructureYearFilter] = useState('')
  const [classSelectSearch, setClassSelectSearch] = useState('')
  const [feeGroupSelectSearch, setFeeGroupSelectSearch] = useState('')
  const selectedStructureYearFilter = structureYearFilter || activeSessionYear

  // Dialog state
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    feeGroupId: '',
    classId: '',
    sectionId: '',
    academicYear: effectiveAcademicYear,
  })
  const [classStructureForm, setClassStructureForm] = useState({
    academicYear: effectiveAcademicYear,
    feeGroupId: '',
    classIds: [] as string[],
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
        academicYear: effectiveAcademicYear,
      }))
    }
    if (!academicYearOptions.some((year) => year.value === classStructureForm.academicYear)) {
      setClassStructureForm((current) => ({
        ...current,
        academicYear: effectiveAcademicYear,
      }))
    }
  }, [academicYearOptions, classStructureForm.academicYear, effectiveAcademicYear, form.academicYear])

  useEffect(() => {
    setForm((current) => ({ ...current, academicYear: effectiveAcademicYear }))
    setClassStructureForm((current) => ({ ...current, academicYear: effectiveAcademicYear }))
  }, [effectiveAcademicYear])

  useEffect(() => {
    const defaultFeeGroup = feeGroups.find((group) => group.name === DEFAULT_FEE_GROUP_NAME)
    if (!defaultFeeGroup) return

    if (!classStructureForm.feeGroupId) {
      setClassStructureForm((current) => ({ ...current, feeGroupId: defaultFeeGroup.id }))
    }
    if (!form.feeGroupId) {
      setForm((current) => ({ ...current, feeGroupId: defaultFeeGroup.id }))
    }
  }, [classStructureForm.feeGroupId, feeGroups, form.feeGroupId])

  // Filtered sections
  const filteredSections = form.classId ? sections.filter((s) => s.classId === form.classId) : []
  const availableStructureHeads = feeHeads
  const filteredClassOptions = classes.filter((item) =>
    item.name.toLowerCase().includes(classSelectSearch.trim().toLowerCase())
  )
  const selectedClassNames = classes
    .filter((item) => classStructureForm.classIds.includes(item.id))
    .map((item) => item.name)
  const filteredFeeGroupOptions = feeGroups.filter((item) =>
    item.name.toLowerCase().includes(feeGroupSelectSearch.trim().toLowerCase())
  )

  useEffect(() => {
    if (!classStructureForm.academicYear || classStructureForm.classIds.length === 0 || !classStructureForm.feeGroupId) {
      setActiveStructure(null)
      setClassStructureHeadIds([])
      setClassStructureRows([])
      setExpandedHeadId('')
      return
    }

    if (classStructureForm.classIds.length !== 1) {
      setActiveStructure(null)
      return
    }

    const selectedClassId = classStructureForm.classIds[0]
    const existing = structures.find((structure) => {
      const structureSectionId = structure.sectionId || ''
      return structure.academicYear === classStructureForm.academicYear
        && structure.classId === selectedClassId
        && getStructureFeeGroupId(structure) === classStructureForm.feeGroupId
        && structureSectionId === ''
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

  const filteredStructures = useMemo(() => {
    const query = structureSearch.trim().toLowerCase()

    return structures.filter((structure) => {
      const matchesSearch = !query
        || structure.name.toLowerCase().includes(query)
        || (structure.feeGroup?.name || '').toLowerCase().includes(query)
        || (structure.class?.name || '').toLowerCase().includes(query)
        || (structure.section?.name || '').toLowerCase().includes(query)
        || structure.academicYear.toLowerCase().includes(query)

      const matchesClass = structureClassFilter === 'ALL' || structure.classId === structureClassFilter
      const matchesGroup = structureGroupFilter === 'ALL' || getStructureFeeGroupId(structure) === structureGroupFilter
      const matchesYear = selectedStructureYearFilter === 'ALL' || structure.academicYear === selectedStructureYearFilter

      return matchesSearch && matchesClass && matchesGroup && matchesYear
    })
  }, [selectedStructureYearFilter, structureClassFilter, structureGroupFilter, structureSearch, structures])

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

  const toggleClassStructureClass = (classId: string) => {
    setClassStructureForm((current) => ({
      ...current,
      classIds: current.classIds.includes(classId)
        ? current.classIds.filter((id) => id !== classId)
        : [...current.classIds, classId],
    }))
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

  const fillHeadDueDates = (feeHeadId: string, selectedDate: string) => {
    const day = Number(selectedDate.slice(8, 10))
    if (!selectedDate || !Number.isFinite(day)) return

    setClassStructureRows((prev) =>
      prev.map((row) => {
        if (row.feeHeadId !== feeHeadId) return row
        const dueDate = dueDateForPeriod(row.period, classStructureForm.academicYear, day)
        return dueDate ? { ...row, dueDate } : row
      })
    )
  }

  const saveClassFeeStructure = async () => {
    if (!classStructureForm.academicYear || classStructureForm.classIds.length === 0 || !classStructureForm.feeGroupId) {
      toast({ title: 'Missing Information', description: 'Please select session, at least one class, and fee group.', variant: 'destructive' })
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

    const groupName = feeGroups.find((item) => item.id === classStructureForm.feeGroupId)?.name || 'Fee Group'

    setSavingClassStructure(true)
    try {
      await Promise.all(classStructureForm.classIds.map((classId) => {
        const className = classes.find((item) => item.id === classId)?.name || 'Class'
        return api.post('/api/school/fees/structures', {
          name: `${className} - ${groupName} Fee Structure`,
          feeGroupId: classStructureForm.feeGroupId,
          classId,
          academicYear: classStructureForm.academicYear,
          replaceExisting: true,
          items,
        })
      }))
      toast({
        title: 'Success',
        description: `Fee structure saved for ${classStructureForm.classIds.length} class${classStructureForm.classIds.length !== 1 ? 'es' : ''}.`,
      })
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
      setForm({ name: '', feeGroupId: '', classId: '', sectionId: '', academicYear: effectiveAcademicYear })
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
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="outline" size="icon" onClick={() => goBack('dashboard')} className="mt-0.5 size-9 shrink-0">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Class Fee Structure</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Configure fee amounts by session, class, and fee group.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button onClick={() => setShowAdd(true)} className="gap-2">
            <PlusCircle className="size-4" />
            Add Structure
          </Button>
          <Button variant="outline" onClick={() => navigateTo('fees-groups')} className="gap-2">
            <Tags className="size-4" />
            Fee Group
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden rounded-lg py-0 shadow-sm">
        <CardHeader className="border-b bg-muted/40 px-4 !pb-2 !pt-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <LayoutGrid className="size-4 text-primary" />
                Class Fee Structure Setup
              </CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
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
        <CardContent className="space-y-4 px-4 pb-2 pt-0">
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">Before Updating Fee Structure</p>
              <p>
                Use this page to define amounts for the selected session, class, and group. Structure changes are safest before fee collection starts for the session.
              </p>
              <p>
                <span className="font-medium">Important for One Time fees:</span> do not change a fee head to or from One Time after students have already paid,
                partially paid, or received that charge. This can recreate dues or cause mismatches for existing students. If correction is needed, review affected
                students before saving.
              </p>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="size-3.5 text-muted-foreground" />
                Session
              </Label>
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
                <Label className="flex items-center gap-2">
                  <School className="size-3.5 text-muted-foreground" />
                  Class
                </Label>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full justify-between px-3 font-normal"
                  >
                    <span className="truncate">
                      {selectedClassNames.length === 0
                        ? 'Select class'
                        : selectedClassNames.length === 1
                          ? selectedClassNames[0]
                          : `${selectedClassNames.length} classes selected`}
                    </span>
                    <ChevronDown className="size-4 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <div className="border-b p-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={classSelectSearch}
                        onChange={(event) => setClassSelectSearch(event.target.value)}
                        placeholder="Search class..."
                        className="h-8 pl-8"
                      />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1">
                    {filteredClassOptions.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No class found</div>
                    ) : (
                      filteredClassOptions.map((item) => {
                        const selected = classStructureForm.classIds.includes(item.id)
                        return (
                          <div
                            key={item.id}
                            role="option"
                            aria-selected={selected}
                            tabIndex={0}
                            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
                            onClick={() => toggleClassStructureClass(item.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                toggleClassStructureClass(item.id)
                              }
                            }}
                          >
                            <Checkbox checked={selected} tabIndex={-1} aria-hidden="true" className="pointer-events-none" />
                            <span>{item.name}</span>
                          </div>
                        )
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Tags className="size-3.5 text-muted-foreground" />
                Fee Group
              </Label>
              <Select
                value={classStructureForm.feeGroupId}
                onValueChange={(value) => setClassStructureForm((current) => ({ ...current, feeGroupId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select fee group" />
                </SelectTrigger>
                <SelectContent>
                  <div className="sticky top-0 z-10 bg-popover p-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={feeGroupSelectSearch}
                        onChange={(event) => setFeeGroupSelectSearch(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                        placeholder="Search fee group..."
                        className="h-8 pl-8"
                      />
                    </div>
                  </div>
                  {filteredFeeGroupOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No fee group found</div>
                  ) : (
                    filteredFeeGroupOptions.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {classStructureForm.classIds.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              <School className="size-4 shrink-0" />
              <span>Select one or more classes to configure fee heads.</span>
            </div>
          ) : (
          <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 w-[90px] px-3 text-xs font-semibold uppercase text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="size-3.5" />
                      Enable
                    </span>
                  </TableHead>
                  <TableHead className="h-9 px-3 text-xs font-semibold uppercase text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <FileText className="size-3.5" />
                      Fee Head
                    </span>
                  </TableHead>
                  <TableHead className="h-9 w-[130px] px-3 text-xs font-semibold uppercase text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <ListChecks className="size-3.5" />
                      Schedule
                    </span>
                  </TableHead>
                  <TableHead className="h-9 w-[64px] px-3 text-right text-xs font-semibold uppercase text-muted-foreground">
                    <Settings2 className="ml-auto size-3.5" />
                  </TableHead>
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
                        <TableRow className={cn('transition-colors', isSelected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/40')}>
                          <TableCell className="px-3 py-1.5">
                            <Switch
                              checked={isSelected}
                              onCheckedChange={() => toggleClassStructureHead(head)}
                              disabled={classStructureForm.classIds.length === 0 || !classStructureForm.feeGroupId}
                            />
                          </TableCell>
                          <TableCell className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                'flex size-7 shrink-0 items-center justify-center rounded-md',
                                isSelected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                              )}>
                                <FileText className="size-3.5" />
                              </span>
                              <div>
                                <div className="text-sm font-medium text-foreground">{head.name}</div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              <Badge className={cn('h-5 px-2 text-xs', FREQUENCY_BADGE_CLASSES[head.frequency])} variant="secondary">
                                {FREQUENCY_LABELS[head.frequency]}
                              </Badge>
                              {head.isOptional && <span className="text-xs text-muted-foreground">Optional</span>}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-1.5">
                            <Badge variant={isSelected ? 'default' : 'secondary'} className={cn('h-5 px-2 text-xs', !isSelected && 'bg-muted text-muted-foreground')}>
                              {isSelected ? `${rows.length} row${rows.length !== 1 ? 's' : ''}` : 'Off'}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 py-1.5 text-right">
                            <Button
                              variant="outline"
                              size="icon"
                              className="size-7"
                              disabled={!isSelected}
                              onClick={() => setExpandedHeadId(isExpanded ? '' : head.id)}
                              aria-label={`Configure ${head.name}`}
                            >
                              {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isSelected && isExpanded && (
                          <TableRow key={`${head.id}-setup`} className="bg-muted/20 hover:bg-muted/20">
                            <TableCell colSpan={4}>
                              <div className="space-y-3 rounded-lg border bg-background p-3 shadow-sm">
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
                                  {canAutoFillDueDates(head.frequency) && (
                                    <DatePicker
                                      value=""
                                      onChange={(v) => fillHeadDueDates(head.id, v)}
                                      showQuickActions={false}
                                      placeholder="Auto fill due dates"
                                      triggerClassName="h-8 w-48"
                                    />
                                  )}
                                  <div className="flex items-center gap-2">
                                    {isCustomPeriodFrequency(head.frequency) && (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="gap-2"
                                        onClick={() => addClassStructurePeriodRow(head.id)}
                                      >
                                        <PlusCircle className="size-3.5" />
                                        Add Period
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                <div className="overflow-x-auto">
                                  <div className="min-w-[760px] space-y-1.5">
                                    <div className="grid grid-cols-[120px_minmax(160px,1fr)_minmax(160px,1fr)_minmax(160px,1fr)_32px] gap-2 px-1 text-xs font-medium text-muted-foreground">
                                      <span>Period</span>
                                      <span>Amount</span>
                                      <span>Due Date</span>
                                      <span>Late Fee</span>
                                      <span />
                                    </div>
                                  {rows.map((row) => {
                                    const globalIdx = classStructureRows.indexOf(row)
                                    return (
                                      <div key={`${row.feeHeadId}-${row.period}-${globalIdx}`} className="grid grid-cols-[120px_minmax(160px,1fr)_minmax(160px,1fr)_minmax(160px,1fr)_32px] items-center gap-2">
                                        <div>
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
                                        <div>
                                          <Input
                                            type="number"
                                            placeholder="Amount"
                                            value={row.amount}
                                            onChange={(event) => updateClassStructureRow(globalIdx, 'amount', event.target.value)}
                                            className="h-8"
                                          />
                                        </div>
                                        <div>
                                          <DatePicker
                                            value={row.dueDate}
                                            onChange={(v) => updateClassStructureRow(globalIdx, 'dueDate', v)}
                                            showQuickActions={false}
                                            placeholder="Due date"
                                            triggerClassName="h-8 w-full"
                                          />
                                        </div>
                                        <div>
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
                                          className="size-8 text-muted-foreground"
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
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-xs">
              {classStructureForm.classIds.length > 0 && (
                <Badge variant="secondary">
                  Class{classStructureForm.classIds.length !== 1 ? 'es' : ''}: {selectedClassNames.join(', ')}
                </Badge>
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
              disabled={savingClassStructure || classStructureForm.classIds.length === 0 || !classStructureForm.feeGroupId}
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
        <div className="space-y-3">
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Saved Class Fee Structures</h2>
              <p className="text-sm text-muted-foreground">
                {filteredStructures.length} of {structures.length} fee structure{structures.length !== 1 ? 's' : ''} shown
              </p>
            </div>
          </div>
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={structureSearch}
                onChange={(event) => setStructureSearch(event.target.value)}
                placeholder="Search structure, group, class..."
                className="pl-9"
              />
            </div>
            <Select value={structureClassFilter} onValueChange={setStructureClassFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Classes</SelectItem>
                {classes.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={structureGroupFilter} onValueChange={setStructureGroupFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All fee groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Fee Groups</SelectItem>
                {feeGroups.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedStructureYearFilter} onValueChange={setStructureYearFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Current session" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Sessions</SelectItem>
                {structureYearOptions.map((year) => (
                  <SelectItem key={year.value} value={year.value}>
                    {year.label}{year.value === activeSessionYear ? ' (Current)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-11 px-4 text-xs font-semibold uppercase text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <FileText className="size-3.5" />
                      Structure
                    </span>
                  </TableHead>
                  <TableHead className="h-11 px-4 text-xs font-semibold uppercase text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Tags className="size-3.5" />
                      Fee Group
                    </span>
                  </TableHead>
                  <TableHead className="h-11 px-4 text-xs font-semibold uppercase text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <School className="size-3.5" />
                      Class
                    </span>
                  </TableHead>
                  <TableHead className="h-11 px-4 text-xs font-semibold uppercase text-muted-foreground">Session</TableHead>
                  <TableHead className="h-11 px-4 text-xs font-semibold uppercase text-muted-foreground">Rows</TableHead>
                  <TableHead className="h-11 px-4 text-xs font-semibold uppercase text-muted-foreground">Status</TableHead>
                  <TableHead className="h-11 w-24 px-4 text-right text-xs font-semibold uppercase text-muted-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStructures.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      No saved structures match the selected filters.
                    </TableCell>
                  </TableRow>
                ) : filteredStructures.map((structure) => {
                  const isExpanded = expandedIds.has(structure.id)
                  const groupedItems = groupItemsByFeeHead(structure.items || [])

                  return (
                    <Fragment key={structure.id}>
                      <TableRow className="hover:bg-muted/40">
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                              <FileText className="size-4" />
                            </span>
                            <span className="font-medium text-foreground">{structure.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 font-medium">
                          {structure.feeGroup?.name || '-'}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <div className="space-y-1">
                            <div className="font-medium">{structure.class?.name || '-'}</div>
                            <div className="text-xs text-muted-foreground">
                              {structure.section?.name ? `Section ${structure.section.name}` : 'All sections'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-muted-foreground">{structure.academicYear}</TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge variant="outline">
                            {(structure.items || []).length} row{(structure.items || []).length !== 1 ? 's' : ''}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          {structure.isActive !== undefined ? (
                            <Badge variant={structure.isActive ? 'default' : 'destructive'} className="gap-1">
                              {structure.isActive && <CheckCircle2 className="size-3" />}
                              {structure.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 px-3"
                            onClick={() => toggleExpanded(structure.id)}
                          >
                            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={7} className="p-4">
                            {groupedItems.length === 0 ? (
                              <p className="py-4 text-center text-sm text-muted-foreground">
                                No installment details available
                              </p>
                            ) : (
                              <div className="space-y-5">
                                {groupedItems.map((group, gIdx) => (
                                  <div key={gIdx}>
                                    <div className="mb-2 flex items-center gap-2">
                                      <h4 className="text-sm font-medium">{group.feeHeadName}</h4>
                                      <Badge variant="outline" className="text-xs">
                                        {group.items.length} period{group.items.length !== 1 ? 's' : ''}
                                      </Badge>
                                    </div>
                                    <div className="overflow-hidden rounded-md border bg-background">
                                      <Table>
                                        <TableHeader className="bg-muted/40">
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
                                              <TableCell className="text-sm font-medium">
                                                {item.period}
                                              </TableCell>
                                              <TableCell className="text-sm font-semibold">
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
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
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
                            <Checkbox checked={selected} tabIndex={-1} aria-hidden="true" className="pointer-events-none" />
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
                                    <DatePicker
                                      value={row.dueDate}
                                      onChange={(v) => updateInstallmentRow(globalIdx, 'dueDate', v)}
                                      showQuickActions={false}
                                      placeholder="Due"
                                      triggerClassName="h-8 w-full text-sm"
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
