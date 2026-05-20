'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoadingState } from '@/components/shared'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  ArrowLeft,
  Bus,
  CalendarDays,
  MessageCircle,
  Printer,
  PlusCircle,
  ReceiptText,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID'
type PaymentMethod = 'CASH' | 'ONLINE' | 'CHEQUE' | 'UPI' | 'SPLIT'

interface Student {
  id: string
  firstName: string
  lastName: string
  fullName?: string
  rollNumber?: string | null
  admissionNumber?: string | null
  class?: { id: string; name: string } | null
  section?: { id: string; name: string } | null
  admission?: {
    registrationNumber?: string | null
    dateOfAdmission?: string | null
    profileImage?: string | null
  } | null
  parentLinks?: {
    parent?: {
      fatherName?: string | null
      motherName?: string | null
      phone?: string | null
    } | null
  }[]
}

interface FeeCollectionItem {
  id: string
  ledgerEntryId?: string | null
  studentId: string
  studentFeeAssignmentItemId?: string | null
  studentFeeInvoiceId?: string | null
  feeHeadName?: string | null
  installment?: string | null
  installmentName?: string | null
  amount: number
  paidAmount: number
  status: PaymentStatus
  paymentDate?: string | null
  dueDate?: string | null
  lateFee?: number
  fine?: number
  discount?: number
  concession?: number
  scholarship?: number
  paymentMethod?: PaymentMethod
  notes?: string | null
  receiptNumber?: string | null
  academicYear?: string | null
  feesGroupName?: string | null
  source?: 'fees' | 'transport'
}

interface TransportInfo {
  id: string
  routeId: string
  routeName: string
  routeNumber?: string | null
  startPoint?: string | null
  endPoint?: string | null
  vehicleNumber?: string | null
  stopName?: string | null
  pickupPoint?: string | null
  dropPoint?: string | null
  fareAmount: number
  academicYear?: string | null
}

interface PaymentSplitRow {
  id: string
  paymentMethod: Exclude<PaymentMethod, 'SPLIT'>
  amount: string
  remarks: string
}

interface ReceiptSummary {
  receiptNumber: string
  receiptDate: Date
  student: Student
  feeMonths: string[]
  lines: Array<{
    label: string
    months: string[]
    amount: number
  }>
  totalPaid: number
  duesAmount: number
  paymentMethod: PaymentMethod
}

interface ReceiptHistoryRow {
  id: string
  receiptNumber: string
  studentName: string
  className: string
  feeMonth: string
  transportMonth: string
  hostelMonth: string
  date: string
  discount: number
  paid: number
  dues: number
  paymentMethod?: PaymentMethod | null
  session?: string | null
  receiptId?: string | null
}

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  ONLINE: 'Online',
  CHEQUE: 'Cheque',
  UPI: 'UPI',
  SPLIT: 'Split',
}

const SELECTABLE_PAYMENT_METHODS: Exclude<PaymentMethod, 'SPLIT'>[] = ['CASH', 'ONLINE', 'CHEQUE', 'UPI']

function money(value: number | string | null | undefined) {
  return `Rs ${Number(value || 0).toLocaleString()}`
}

function receiptPlainAmount(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

function receiptMoney(value: number | string | null | undefined) {
  return `\u20b9 ${receiptPlainAmount(value)}`
}

function formatReceiptDate(value: Date) {
  return value.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatReceiptTime(value: Date) {
  return value.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatHistoryDateTime(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function formatStudentDate(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function studentName(student: Student | null) {
  if (!student) return ''
  return student.fullName || `${student.firstName} ${student.lastName}`.trim()
}

function itemPeriod(item: FeeCollectionItem) {
  return item.installment || item.installmentName || 'General'
}

function isTransportItem(item: FeeCollectionItem) {
  return item.source === 'transport' || (item.feeHeadName || '').toLowerCase().includes('transport')
}

function normalizedPeriod(period: string) {
  return period.trim().toLowerCase()
}

function academicYearKey(value?: string | null) {
  return value || 'unassigned'
}

function matchesPeriod(item: FeeCollectionItem, period: string) {
  return normalizedPeriod(itemPeriod(item)) === normalizedPeriod(period)
}

function isMonthPeriod(period: string) {
  return MONTHS.some((month) => normalizedPeriod(month) === normalizedPeriod(period))
}

function periodSelectionKey(period: string, transport = false, itemAcademicYear?: string | null) {
  return `${transport ? 'transport' : 'fees'}:${academicYearKey(itemAcademicYear)}:${normalizedPeriod(period)}`
}

function collectionSelectionKey(item: FeeCollectionItem) {
  return periodSelectionKey(itemPeriod(item), isTransportItem(item), item.academicYear)
}

function receiptPeriodLabel(item: FeeCollectionItem, currentAcademicYear: string) {
  const period = itemPeriod(item)
  if (!item.academicYear || item.academicYear === currentAcademicYear) return period
  return `${period} (${item.academicYear})`
}

function remainingAmount(item: FeeCollectionItem) {
  const netAmount =
    Number(item.amount || 0) -
    Number(item.discount || 0) -
    Number(item.concession || 0) -
    Number(item.scholarship || 0) +
    Number(item.fine || item.lateFee || 0)
  return Math.max(0, netAmount - Number(item.paidAmount || 0))
}

function totalAmount(item: FeeCollectionItem) {
  return Math.max(
    0,
    Number(item.amount || 0) -
      Number(item.discount || 0) -
      Number(item.concession || 0) -
      Number(item.scholarship || 0) +
      Number(item.fine || item.lateFee || 0)
  )
}

function isPreviousDue(item: FeeCollectionItem) {
  if (!item.dueDate) return false
  const dueDate = new Date(item.dueDate)
  const currentMonthStart = new Date()
  currentMonthStart.setDate(1)
  currentMonthStart.setHours(0, 0, 0, 0)
  return dueDate < currentMonthStart
}

function periodSortIndex(period: string) {
  const index = MONTHS.findIndex((month) => normalizedPeriod(month) === normalizedPeriod(period))
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function sortPeriods(periods: string[]) {
  return [...periods].sort((a, b) => {
    const indexCompare = periodSortIndex(a) - periodSortIndex(b)
    return indexCompare || a.localeCompare(b)
  })
}

function comparePeriods(a: string, b: string) {
  const indexCompare = periodSortIndex(a) - periodSortIndex(b)
  return indexCompare || a.localeCompare(b)
}

function statusLabel(status: PaymentStatus) {
  if (status === 'PAID') return 'Paid'
  if (status === 'PARTIAL') return 'Partial'
  return 'Unpaid'
}

function periodPaymentState(items: FeeCollectionItem[]) {
  if (items.length === 0) return null
  const total = items.reduce((sum, item) => sum + totalAmount(item), 0)
  const due = items.reduce((sum, item) => sum + remainingAmount(item), 0)
  if (due <= 0) return 'paid'
  if (due < total) return 'partial'
  return 'unpaid'
}

function periodStateLabel(state: ReturnType<typeof periodPaymentState>) {
  if (state === 'paid') return 'Paid'
  if (state === 'partial') return 'Partial'
  if (state === 'unpaid') return 'Unpaid'
  return ''
}

function numberToWords(value: number) {
  const amount = Math.round(Number(value || 0))
  if (amount === 0) return 'Zero Rupees only'

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  const underHundred = (num: number) => {
    if (num < 20) return ones[num]
    return [tens[Math.floor(num / 10)], ones[num % 10]].filter(Boolean).join(' ')
  }

  const underThousand = (num: number) => {
    const hundred = Math.floor(num / 100)
    const rest = num % 100
    return [
      hundred ? `${ones[hundred]} Hundred` : '',
      rest ? underHundred(rest) : '',
    ].filter(Boolean).join(' ')
  }

  const parts = [
    { value: Math.floor(amount / 10000000), label: 'Crore' },
    { value: Math.floor((amount % 10000000) / 100000), label: 'Lakh' },
    { value: Math.floor((amount % 100000) / 1000), label: 'Thousand' },
    { value: amount % 1000, label: '' },
  ]

  return `${parts
    .filter((part) => part.value > 0)
    .map((part) => `${underThousand(part.value)} ${part.label}`.trim())
    .join(' ')} Rupees only`
}

export function FeeCollectionsPage() {
  const { toast } = useToast()
  const currentSchoolAcademicYear = useAppStore((state) => state.currentSchool?.academicYear)
  const goBack = useAppStore((state) => state.goBack)

  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [allStudentCollections, setAllStudentCollections] = useState<FeeCollectionItem[]>([])
  const [receiptHistory, setReceiptHistory] = useState<ReceiptHistoryRow[]>([])
  const [transportInfo, setTransportInfo] = useState<TransportInfo | null>(null)
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [availableAcademicYears, setAvailableAcademicYears] = useState<string[]>([])
  const [academicYear, setAcademicYear] = useState(currentSchoolAcademicYear || getCurrentAcademicYear())
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [discountAmount, setDiscountAmount] = useState('')
  const [remarks, setRemarks] = useState('')
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplitRow[]>([
    { id: 'split-1', paymentMethod: 'CASH', amount: '', remarks: '' },
  ])
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([])
  const [receiptSummary, setReceiptSummary] = useState<ReceiptSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const receiptRef = useRef<HTMLDivElement>(null)
  const academicYearOptions = useMemo(
    () => toAcademicYearOptions(availableAcademicYears, currentSchoolAcademicYear),
    [availableAcademicYears, currentSchoolAcademicYear]
  )

  const fetchInitialData = useCallback(async () => {
    try {
      const [studentsRes, academicYearRes] = await Promise.all([
        api.get<{ students: Student[] }>('/api/school/students', { limit: '25', academicYear }),
        api.get<{ academicYears: string[] }>('/api/school/academic-years').catch(() => ({ academicYears: [] })),
      ])
      setStudents(studentsRes.students || [])
      setAvailableAcademicYears(academicYearRes.academicYears || [])
    } catch {
      toast({
        title: "Couldn't Load Collect Fees",
        description: 'We could not load students and fee data. Please refresh the page.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [academicYear, toast])

  useEffect(() => {
    fetchInitialData()
  }, [fetchInitialData])

  useEffect(() => {
    if (!academicYearOptions.some((year) => year.value === academicYear)) {
      setAcademicYear(academicYearOptions[0]?.value || currentSchoolAcademicYear || getCurrentAcademicYear())
    }
  }, [academicYear, academicYearOptions, currentSchoolAcademicYear])

  useEffect(() => {
    const value = search.trim()
    if (selectedStudent || value.length < 2) return

    const timeout = window.setTimeout(async () => {
      try {
        const data = await api.get<{ students: Student[] }>('/api/school/students', {
          search: value,
          limit: '20',
          academicYear,
        })
        setStudents(data.students || [])
      } catch {
        // Search should stay quiet while the user is typing.
      }
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [academicYear, search, selectedStudent])

  const fetchStudentCollections = useCallback(async (studentId: string) => {
    try {
      const [currentData, arrearsData] = await Promise.all([
        api.get<{ collections: FeeCollectionItem[]; receiptHistory?: ReceiptHistoryRow[]; transportInfo?: TransportInfo | null }>(
          '/api/school/fees/collections',
          { studentId, academicYear, limit: '300' }
        ),
        api.get<{ collections: FeeCollectionItem[] }>(
          '/api/school/fees/collections',
          { studentId, paymentStatus: 'unpaid', limit: '500' }
        ),
      ])
      const merged = new Map<string, FeeCollectionItem>()
      for (const item of [...(arrearsData.collections || []), ...(currentData.collections || [])]) {
        merged.set(item.ledgerEntryId || item.id, item)
      }
      setAllStudentCollections(Array.from(merged.values()))
      setReceiptHistory(currentData.receiptHistory || [])
      setTransportInfo(currentData.transportInfo || null)
      setSelectedCollectionIds([])
      setSelectedPeriods([])
      setDiscountAmount('')
      setPaymentSplits([{ id: 'split-1', paymentMethod: 'CASH', amount: '', remarks: '' }])
    } catch {
      setAllStudentCollections([])
      setReceiptHistory([])
      setTransportInfo(null)
      toast({
        title: "Couldn't Load Student Dues",
        description: 'This student fee assignment may not be generated yet.',
        variant: 'destructive',
      })
    }
  }, [academicYear, toast])

  const filteredStudents = useMemo(() => {
    const value = search.trim().toLowerCase()
    if (!value) return students.slice(0, 25)
    return students.filter((student) => {
      const haystack = [
        studentName(student),
        student.rollNumber,
        student.admissionNumber,
        student.admission?.registrationNumber,
        student.class?.name,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(value)
    }).slice(0, 25)
  }, [search, students])

  const studentCollections = useMemo(
    () => allStudentCollections.filter((item) => item.status !== 'PAID'),
    [allStudentCollections]
  )
  const paymentHistory = useMemo(
    () => [...receiptHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [receiptHistory]
  )
  const academicItems = useMemo(
    () => studentCollections.filter((item) => !isTransportItem(item)),
    [studentCollections]
  )
  const transportItems = useMemo(
    () => studentCollections.filter(isTransportItem),
    [studentCollections]
  )
  const allAcademicItems = useMemo(
    () => allStudentCollections.filter((item) => !isTransportItem(item)),
    [allStudentCollections]
  )
  const allTransportItems = useMemo(
    () => allStudentCollections.filter(isTransportItem),
    [allStudentCollections]
  )
  const currentTransportItems = useMemo(
    () => transportItems.filter((item) => item.academicYear === academicYear),
    [academicYear, transportItems]
  )
  const currentAllTransportItems = useMemo(
    () => allTransportItems.filter((item) => item.academicYear === academicYear),
    [academicYear, allTransportItems]
  )
  const visibleStudentCollections = useMemo(() => {
    if (selectedPeriods.length === 0) return []
    const selectedPeriodSet = new Set(selectedPeriods)
    return studentCollections.filter((item) => selectedPeriodSet.has(collectionSelectionKey(item)))
  }, [selectedPeriods, studentCollections])
  const currentAcademicItems = useMemo(
    () => academicItems.filter((item) => item.academicYear === academicYear),
    [academicItems, academicYear]
  )
  const currentAllAcademicItems = useMemo(
    () => allAcademicItems.filter((item) => item.academicYear === academicYear),
    [academicYear, allAcademicItems]
  )
  const currentMonthItems = useMemo(
    () => currentAcademicItems.filter((item) => isMonthPeriod(itemPeriod(item))),
    [currentAcademicItems]
  )
  const currentAllMonthItems = useMemo(
    () => currentAllAcademicItems.filter((item) => isMonthPeriod(itemPeriod(item))),
    [currentAllAcademicItems]
  )
  const currentOtherTermItems = useMemo(
    () => currentAcademicItems.filter((item) => !isMonthPeriod(itemPeriod(item))),
    [currentAcademicItems]
  )
  const previousDueItems = useMemo(
    () => studentCollections.filter((item) => item.academicYear !== academicYear),
    [academicYear, studentCollections]
  )
  const otherTermOptions = useMemo(() => {
    const map = new Map<string, { period: string; academicYear?: string | null; amount: number; count: number }>()
    for (const item of currentOtherTermItems) {
      const key = collectionSelectionKey(item)
      const option = map.get(key) || { period: itemPeriod(item), academicYear: item.academicYear, amount: 0, count: 0 }
      option.amount += remainingAmount(item)
      option.count += 1
      map.set(key, option)
    }
    return Array.from(map.values()).sort((a, b) => comparePeriods(a.period, b.period))
  }, [currentOtherTermItems])
  const previousDueOptions = useMemo(() => {
    const map = new Map<string, { period: string; academicYear?: string | null; transport: boolean; amount: number; count: number }>()
    for (const item of previousDueItems) {
      const key = collectionSelectionKey(item)
      const option = map.get(key) || { period: itemPeriod(item), academicYear: item.academicYear, transport: isTransportItem(item), amount: 0, count: 0 }
      option.amount += remainingAmount(item)
      option.count += 1
      map.set(key, option)
    }
    return Array.from(map.values()).sort((a, b) => {
      const yearCompare = academicYearKey(a.academicYear).localeCompare(academicYearKey(b.academicYear))
      if (yearCompare !== 0) return yearCompare
      return comparePeriods(a.period, b.period)
    })
  }, [previousDueItems])
  const selectedItems = useMemo(
    () => studentCollections.filter((item) => selectedCollectionIds.includes(item.id)),
    [selectedCollectionIds, studentCollections]
  )
  const selectedCurrentMonthIndex = useMemo(() => {
    const selectedMonthIndexes = selectedItems
      .filter((item) => item.academicYear === academicYear && isMonthPeriod(itemPeriod(item)))
      .map((item) => periodSortIndex(itemPeriod(item)))
      .filter((index) => index !== Number.MAX_SAFE_INTEGER)
    return selectedMonthIndexes.length > 0 ? Math.max(...selectedMonthIndexes) : -1
  }, [academicYear, selectedItems])
  const previousMonthDueItems = useMemo(() => {
    if (selectedCurrentMonthIndex <= 0) return []
    const selectedIds = new Set(selectedCollectionIds)
    return studentCollections
      .filter((item) =>
        item.academicYear === academicYear &&
        isMonthPeriod(itemPeriod(item)) &&
        periodSortIndex(itemPeriod(item)) < selectedCurrentMonthIndex &&
        !selectedIds.has(item.id)
      )
      .sort((a, b) => {
        const periodCompare = comparePeriods(itemPeriod(a), itemPeriod(b))
        if (periodCompare !== 0) return periodCompare
        return (a.dueDate || '').localeCompare(b.dueDate || '')
      })
  }, [academicYear, selectedCollectionIds, selectedCurrentMonthIndex, studentCollections])
  const collectionItems = useMemo(() => {
    const map = new Map<string, FeeCollectionItem>()
    for (const item of [...previousMonthDueItems, ...selectedItems]) {
      map.set(item.id, item)
    }
    return Array.from(map.values())
  }, [previousMonthDueItems, selectedItems])
  const visibleCollectionItems = useMemo(() => {
    const map = new Map<string, FeeCollectionItem>()
    for (const item of [...previousMonthDueItems, ...visibleStudentCollections]) {
      map.set(item.id, item)
    }
    return Array.from(map.values())
  }, [previousMonthDueItems, visibleStudentCollections])
  const selectedTotal = collectionItems.reduce((sum, item) => sum + remainingAmount(item), 0)
  const discount = Number(discountAmount || 0)
  const payableTotal = Math.max(0, selectedTotal - discount)
  const splitTotal = paymentSplits.reduce((sum, split) => sum + Number(split.amount || 0), 0)
  const paymentValue = splitTotal || payableTotal
  const balanceDue = Math.max(0, payableTotal - paymentValue)
  const feeGroupName = allStudentCollections.find((item) => item.feesGroupName)?.feesGroupName || '-'
  const father = selectedStudent?.parentLinks?.find((link) => link.parent?.fatherName)?.parent
  const mother = selectedStudent?.parentLinks?.find((link) => link.parent?.motherName)?.parent
  const contact = father?.phone || mother?.phone || ''
  const previousMonthDueTotal = previousMonthDueItems
    .reduce((sum, item) => sum + remainingAmount(item), 0)
  const selectedPreviousSessionDue = selectedItems
    .filter((item) => item.academicYear !== academicYear)
    .reduce((sum, item) => sum + remainingAmount(item), 0)
  const selectedCurrentSessionFee = selectedItems
    .filter((item) => item.academicYear === academicYear && !isTransportItem(item))
    .reduce((sum, item) => sum + remainingAmount(item), 0)
  const selectedTransportFare = selectedItems
    .filter((item) => item.academicYear === academicYear && isTransportItem(item))
    .reduce((sum, item) => sum + remainingAmount(item), 0)

  useEffect(() => {
    if (selectedTotal > 0 && paymentSplits.length === 1 && !paymentSplits[0].amount) {
      setPaymentSplits((current) => current.map((split, index) => index === 0 ? { ...split, amount: String(payableTotal) } : split))
    }
  }, [payableTotal, paymentSplits, selectedTotal])

  const toggleCollection = (id: string) => {
    setSelectedCollectionIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    )
  }

  const togglePeriod = (period: string, transport = false, itemAcademicYear: string | null = academicYear) => {
    const source = transport ? transportItems : academicItems
    const ids = source
      .filter((item) => matchesPeriod(item, period) && academicYearKey(item.academicYear) === academicYearKey(itemAcademicYear))
      .map((item) => item.id)
    const periodKey = periodSelectionKey(period, transport, itemAcademicYear)
    const isSelected = selectedPeriods.includes(periodKey)

    setSelectedPeriods((current) =>
      isSelected
        ? current.filter((item) => item !== periodKey)
        : Array.from(new Set([...current, periodKey]))
    )
    setSelectedCollectionIds((current) => {
      if (isSelected) return current.filter((id) => !ids.includes(id))
      return Array.from(new Set([...current, ...ids]))
    })
  }

  const selectAllDues = () => {
    setSelectedPeriods(Array.from(new Set(studentCollections.map(collectionSelectionKey))))
    setSelectedCollectionIds(studentCollections.map((item) => item.id))
  }

  const handleSelectStudent = (student: Student) => {
    setSelectedStudent(student)
    setTransportInfo(null)
    setSearch(studentName(student))
  }

  const createReceiptSummary = (
    receiptNumber: string,
    collectedItems: FeeCollectionItem[],
    paidTotal: number,
    remainingDue: number,
    method: PaymentMethod,
  ) => {
    if (!selectedStudent) return null

    const previousMonthIds = new Set(previousMonthDueItems.map((item) => item.id))
    const lineMap = new Map<string, { label: string; months: Set<string>; amount: number }>()
    for (const item of collectedItems) {
      const label = previousMonthIds.has(item.id) ? 'Previous Month Dues' : item.feeHeadName || 'Fee'
      const existing = lineMap.get(label) || { label, months: new Set<string>(), amount: 0 }
      existing.months.add(receiptPeriodLabel(item, academicYear))
      existing.amount += remainingAmount(item)
      lineMap.set(label, existing)
    }

    const lines = Array.from(lineMap.values()).map((line) => ({
      label: line.label,
      months: sortPeriods(Array.from(line.months)),
      amount: line.amount,
    }))

    return {
      receiptNumber,
      receiptDate: new Date(),
      student: selectedStudent,
      feeMonths: sortPeriods(Array.from(new Set(collectedItems.map((item) => receiptPeriodLabel(item, academicYear))))),
      lines,
      totalPaid: paidTotal,
      duesAmount: remainingDue,
      paymentMethod: method,
    }
  }

  const openHistoryReceipt = (row: ReceiptHistoryRow) => {
    if (!selectedStudent) return

    const months = [
      row.feeMonth,
      row.transportMonth ? `Transport: ${row.transportMonth}` : '',
      row.hostelMonth ? `Hostel: ${row.hostelMonth}` : '',
    ].filter(Boolean)

    setReceiptSummary({
      receiptNumber: row.receiptId || row.receiptNumber || 'Receipt',
      receiptDate: row.date ? new Date(row.date) : new Date(),
      student: selectedStudent,
      feeMonths: months.length > 0 ? months : ['-'],
      lines: [{ label: 'Fee Payment', months: months.length > 0 ? months : ['-'], amount: row.paid }],
      totalPaid: row.paid,
      duesAmount: row.dues,
      paymentMethod: row.paymentMethod || 'CASH',
    })
  }

  const printReceipt = () => {
    if (!receiptRef.current) return
    const printWindow = window.open('', '_blank', 'width=430,height=650')
    if (!printWindow) {
      window.print()
      return
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Fee Receipt</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 12px;
              background: #fff;
              color: #000;
              font-family: Arial, Helvetica, sans-serif;
            }
            .receipt-print-root { width: 375px; max-width: 100%; }
            .fee-receipt-slip {
              width: 380px;
              max-width: 100%;
              border: 2px solid #000;
              background: #fff;
              color: #000;
              font-size: 13px;
              line-height: 1.15;
            }
            .fee-receipt-header {
              display: grid;
              grid-template-columns: 95px 1fr 96px;
              border-bottom: 2px solid #000;
              padding: 8px;
            }
            .fee-receipt-header-left,
            .fee-receipt-header-center,
            .fee-receipt-header-right,
            .fee-receipt-info-label,
            .fee-receipt-month-row,
            .fee-receipt-total-label,
            .fee-receipt-total-amount,
            .fee-receipt-footer strong,
            .fee-receipt-footer .font-bold,
            .font-bold,
            .font-extrabold {
              font-weight: 700;
            }
            .fee-receipt-header-center {
              text-align: center;
              font-weight: 800;
            }
            .fee-receipt-header-right {
              text-align: right;
              font-size: 12px;
            }
            .fee-receipt-details {
              display: grid;
              grid-template-columns: 1fr 1fr;
              column-gap: 16px;
              row-gap: 8px;
              border-bottom: 2px solid #000;
              padding: 8px;
            }
            .fee-receipt-info {
              display: grid;
              grid-template-columns: 80px 1fr;
              gap: 4px;
            }
            .fee-receipt-month-row {
              grid-column: 1 / -1;
              display: grid;
              grid-template-columns: 95px 1fr;
            }
            .fee-receipt-line,
            .fee-receipt-summary-row {
              display: grid;
              border-bottom: 2px solid #000;
            }
            .fee-receipt-line {
              min-height: 40px;
              grid-template-columns: 1fr 70px 100px;
            }
            .fee-receipt-summary-row {
              grid-template-columns: 1fr 100px;
            }
            .fee-receipt-line-label,
            .fee-receipt-line-detail,
            .fee-receipt-line-amount,
            .fee-receipt-total-label,
            .fee-receipt-total-amount,
            .fee-receipt-footer {
              padding: 6px;
            }
            .fee-receipt-line-detail,
            .fee-receipt-line-amount,
            .fee-receipt-total-amount {
              border-left: 2px solid #000;
            }
            .fee-receipt-line-detail {
              text-align: center;
              font-size: 12px;
            }
            .fee-receipt-line-amount,
            .fee-receipt-total-amount {
              font-size: 16px;
              font-weight: 700;
            }
            @media print {
              @page { margin: 8mm; size: auto; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="receipt-print-root">${receiptRef.current.outerHTML}</div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.onafterprint = () => printWindow.close()
    window.setTimeout(() => {
      printWindow.focus()
      printWindow.print()
    }, 250)
  }

  useEffect(() => {
    if (selectedStudent) {
      fetchStudentCollections(selectedStudent.id)
    }
  }, [academicYear, fetchStudentCollections, selectedStudent])

  const updatePaymentSplit = (id: string, patch: Partial<PaymentSplitRow>) => {
    setPaymentSplits((current) =>
      current.map((split) => split.id === id ? { ...split, ...patch } : split)
    )
  }

  const addPaymentSplit = () => {
    setPaymentSplits((current) => [
      ...current,
      { id: `split-${Date.now()}`, paymentMethod: 'CASH', amount: '', remarks: '' },
    ])
  }

  const removePaymentSplit = (id: string) => {
    setPaymentSplits((current) => current.length === 1 ? current : current.filter((split) => split.id !== id))
  }

  const collectNow = async () => {
    if (!selectedStudent) {
      toast({ title: 'Missing Student', description: 'Please select a student first.', variant: 'destructive' })
      return
    }
    if (collectionItems.length === 0) {
      toast({ title: 'Missing Particulars', description: 'Please select at least one fee particular.', variant: 'destructive' })
      return
    }
    if ((!paymentValue || paymentValue <= 0) && discount <= 0) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid payment amount.', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      let remaining = paymentValue
      let remainingDiscount = discount
      const sortedSelectedItems = [...collectionItems].sort((a, b) => {
        const periodCompare = periodSortIndex(itemPeriod(a)) - periodSortIndex(itemPeriod(b))
        if (periodCompare !== 0) return periodCompare
        return (a.dueDate || '').localeCompare(b.dueDate || '')
      })
      const payments: Array<{
        collectionId: string
        ledgerEntryId?: string | null
        amount: number
        discount: number
      }> = []

      for (const item of sortedSelectedItems) {
        if (remaining <= 0 && remainingDiscount <= 0) break
        const due = remainingAmount(item)
        if (due <= 0) continue
        const discountForRow = remainingDiscount > 0 ? Math.min(remainingDiscount, due) : 0
        const payableForRow = Math.max(0, due - discountForRow)
        const paymentForRow = Math.min(payableForRow, remaining)
        remaining -= paymentForRow
        remainingDiscount -= discountForRow

        payments.push({
          collectionId: item.id,
          ledgerEntryId: item.ledgerEntryId || item.id,
          amount: paymentForRow,
          discount: discountForRow,
        })
      }

      if (payments.length === 0) {
        toast({ title: 'Nothing To Collect', description: 'No payable amount or adjustment was found for the selected rows.', variant: 'destructive' })
        return
      }

      const activePaymentSplits = paymentSplits.filter((split) => Number(split.amount || 0) > 0)
      const splitSummary = activePaymentSplits
        .map((split) => `${PAYMENT_METHOD_LABELS[split.paymentMethod]}: ${money(split.amount)}${split.remarks ? ` (${split.remarks})` : ''}`)
        .join('; ')
      const appliedPaymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0)

      const selectedPaymentMethod: PaymentMethod = activePaymentSplits.length > 1
        ? 'SPLIT'
        : activePaymentSplits[0]?.paymentMethod || paymentSplits[0]?.paymentMethod || 'CASH'

      const collectionResponse = await api.post<{ receiptNumber?: string; appliedAmount?: number }>('/api/school/fees/collections', {
        studentId: selectedStudent.id,
        payments,
        paymentMethod: selectedPaymentMethod,
        paymentDate,
        notes: [remarks, splitSummary].filter(Boolean).join(' | '),
      })

      const receipt = createReceiptSummary(
        collectionResponse.receiptNumber || 'Pending',
        collectionItems,
        collectionResponse.appliedAmount ?? appliedPaymentTotal,
        balanceDue,
        selectedPaymentMethod
      )
      setReceiptSummary(receipt)
      toast({ title: 'Success', description: 'Fee payment collected successfully.' })
      fetchStudentCollections(selectedStudent.id)
      fetchInitialData()
    } catch (err) {
      toast({
        title: 'Collection Failed',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingState />
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Button variant="outline" size="icon" onClick={() => goBack('dashboard')} className="mt-0.5 size-9 shrink-0">
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">Collect Fee</h1>
                <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/10">
                  {academicYear}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Search a student, select dues, split payment, and print the receipt from one clean workspace.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <div className="space-y-4">
          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-muted/30 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="size-4 text-primary" />
                Student Search
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 md:grid-cols-[170px_1fr]">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <UserRound className="size-4" />
                  </div>
                  <Label className="font-semibold">Find Student</Label>
                </div>
                <div className="relative">
                  <Input
                    placeholder="Search by student name, admission no., registration no., or roll no."
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value)
                      setSelectedStudent(null)
                      setAllStudentCollections([])
                      setReceiptHistory([])
                      setTransportInfo(null)
                      setSelectedCollectionIds([])
                    }}
                  />
                  {search && !selectedStudent && (
                    <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-lg">
                      {filteredStudents.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">No students found</div>
                      ) : (
                        filteredStudents.map((student) => (
                          <button
                            key={student.id}
                            type="button"
                            className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted"
                            onClick={() => handleSelectStudent(student)}
                          >
                            <span>{studentName(student)}</span>
                            <span className="text-xs text-muted-foreground">
                              {student.class?.name || '-'} {student.rollNumber ? `- Roll ${student.rollNumber}` : ''}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Academic Year</Label>
                  <Select
                    value={academicYear}
                    onValueChange={setAcademicYear}
                  >
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
                <div className="space-y-2">
                  <Label>Payment Date</Label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={(event) => setPaymentDate(event.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {selectedStudent && (
            <>
              <Card className="overflow-hidden shadow-sm">
                <CardHeader className="border-b bg-muted/30 pb-3">
                  <CardTitle className="flex items-center justify-between gap-3 text-base">
                    <span className="flex items-center gap-2">
                      <CalendarDays className="size-4 text-primary" />
                      Select Months / Terms
                    </span>
                    <Button variant="outline" size="sm" onClick={selectAllDues}>
                      Select All
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  {previousDueOptions.length > 0 && (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                      <div className="mb-2 text-sm font-semibold text-amber-900">Previous Session Dues</div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {previousDueOptions.map((option) => {
                          const checked = selectedPeriods.includes(periodSelectionKey(option.period, option.transport, option.academicYear))
                          return (
                            <label key={`${option.academicYear}-${option.period}`} className="flex items-center gap-2 rounded-md border border-amber-200/70 bg-white/70 p-2 text-sm text-amber-950 dark:bg-background/50">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => togglePeriod(option.period, option.transport, option.academicYear || null)}
                              />
                              <span>{option.academicYear || 'Previous'} - {option.transport ? 'Transport ' : ''}{option.period}</span>
                              <span className="ml-auto font-medium">{money(option.amount)}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {otherTermOptions.length > 0 && (
                    <div className="mb-4 rounded-lg border bg-background p-3">
                      <div className="mb-2 text-sm font-semibold">Admission / Term Fees</div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {otherTermOptions.map((option) => {
                          const checked = selectedPeriods.includes(periodSelectionKey(option.period, false, option.academicYear))
                          return (
                            <label key={`${option.academicYear}-${option.period}`} className="flex items-center gap-2 rounded-md border bg-card p-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => togglePeriod(option.period, false, option.academicYear || null)}
                              />
                              <span>{option.period}</span>
                              <span className="ml-auto font-medium">{money(option.amount)}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {MONTHS.map((month) => {
                      const monthItems = currentMonthItems.filter((item) => matchesPeriod(item, month))
                      const allMonthItems = currentAllMonthItems.filter((item) => matchesPeriod(item, month))
                      const monthState = periodPaymentState(allMonthItems)
                      const checked = selectedPeriods.includes(periodSelectionKey(month, false, academicYear))
                      const isSettled = monthState === 'paid'
                      return (
                        <label
                          key={month}
                          className={cn(
                            'flex min-h-9 items-center gap-1.5 rounded-md border bg-card px-2 py-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5',
                            checked && 'border-primary/50 bg-primary/10',
                            isSettled && 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10',
                            allMonthItems.length === 0 && 'bg-muted/40 text-muted-foreground line-through hover:border-border hover:bg-muted/40'
                          )}
                        >
                          <Checkbox
                            checked={checked || isSettled}
                            disabled={allMonthItems.length === 0 || isSettled}
                            onCheckedChange={() => togglePeriod(month, false, academicYear)}
                          />
                          <span>{month}</span>
                          {monthState && (
                            <Badge
                              variant="outline"
                              className={cn(
                                'ml-auto px-1 py-0 text-[9px]',
                                monthState === 'paid' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                                monthState === 'partial' && 'border-amber-200 bg-amber-50 text-amber-700',
                                monthState === 'unpaid' && 'border-slate-200 bg-white text-slate-600'
                              )}
                            >
                              {periodStateLabel(monthState)}
                            </Badge>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {currentAllTransportItems.length > 0 && (
                <Card className="overflow-hidden border-emerald-200 bg-emerald-50 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <CardContent className="p-4">
                    <div className="mb-3 grid gap-3 sm:grid-cols-[90px_1fr]">
                      <div className="flex flex-col items-center justify-center text-green-800">
                        <span className="text-sm font-medium">Transport</span>
                        <Bus className="mt-2 size-8" />
                      </div>
                      <div className="space-y-1 text-sm text-green-900">
                        <div className="font-semibold">
                          {transportInfo?.routeName || 'Assigned Transport Route'}
                          {transportInfo?.routeNumber ? ` (${transportInfo.routeNumber})` : ''}
                        </div>
                        <div>
                          Stop: {transportInfo?.stopName || transportInfo?.pickupPoint || 'Not set'}
                          <span className="mx-2 text-green-700">|</span>
                          Fare: {money(transportInfo?.fareAmount || currentAllTransportItems[0]?.amount || 0)}
                        </div>
                        {(transportInfo?.vehicleNumber || transportInfo?.startPoint || transportInfo?.endPoint) && (
                          <div className="text-xs text-green-700">
                            {[
                              transportInfo.vehicleNumber ? `Vehicle ${transportInfo.vehicleNumber}` : null,
                              transportInfo.startPoint && transportInfo.endPoint ? `${transportInfo.startPoint} to ${transportInfo.endPoint}` : null,
                            ].filter(Boolean).join(' | ')}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-6">
                    {MONTHS.map((month) => {
                      const monthItems = currentTransportItems.filter((item) => matchesPeriod(item, month))
                      const allMonthItems = currentAllTransportItems.filter((item) => matchesPeriod(item, month))
                      const monthState = periodPaymentState(allMonthItems)
                      const monthKey = periodSelectionKey(month, true, academicYear)
                      const checked = selectedPeriods.includes(monthKey)
                      const isSettled = monthState === 'paid'
                      return (
                        <label
                          key={month}
                          className={cn(
                            'flex min-h-9 items-center gap-1.5 rounded-md border bg-white/80 px-2 py-1.5 text-xs transition-colors hover:border-emerald-400 hover:bg-white dark:bg-background/60',
                            checked && 'border-emerald-500 bg-white',
                            isSettled && 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20',
                            allMonthItems.length === 0 && 'bg-muted/40 text-muted-foreground line-through hover:border-border hover:bg-muted/40'
                          )}
                        >
                          <Checkbox
                            checked={checked || isSettled}
                            disabled={allMonthItems.length === 0 || isSettled}
                            onCheckedChange={() => togglePeriod(month, true, academicYear)}
                          />
                            <span>{month}</span>
                            {monthState && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'ml-auto px-1 py-0 text-[9px]',
                                  monthState === 'paid' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                                  monthState === 'partial' && 'border-amber-200 bg-amber-50 text-amber-700',
                                  monthState === 'unpaid' && 'border-slate-200 bg-white text-slate-600'
                                )}
                              >
                                {periodStateLabel(monthState)}
                              </Badge>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="border-b bg-primary text-primary-foreground">
            <CardTitle className="flex items-center justify-center gap-2 text-base">
              Student Detail
              <UserRound className="size-4" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!selectedStudent ? (
              <div className="flex min-h-80 flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <UserRound className="mb-3 size-10" />
                Search and select a student to collect fees.
              </div>
            ) : (
              <div>
                <div className="grid gap-3 p-3 sm:grid-cols-[150px_1fr]">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-muted">
                    {selectedStudent.admission?.profileImage ? (
                      <img src={selectedStudent.admission.profileImage} alt={studentName(selectedStudent)} className="h-full w-full object-cover" />
                    ) : (
                      <UserRound className="size-14 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <DetailRow label="Roll No" value={selectedStudent.rollNumber || '-'} />
                    <DetailRow label="Contact" value={contact || '-'} />
                    <DetailRow label="Fee Group" value={feeGroupName} />
                    <DetailRow label="Admission Date" value={formatStudentDate(selectedStudent.admission?.dateOfAdmission)} />
                    <DetailRow label="Class" value={selectedStudent.class?.name || '-'} />
                  </div>
                </div>
                <Separator />
                <DetailRow className="px-3 py-2" label="Adm. No." value={selectedStudent.admissionNumber || '-'} />
                <DetailRow className="px-3 py-2" label="Reg. No." value={selectedStudent.admission?.registrationNumber || '-'} />
                <DetailRow className="px-3 py-2" label="Name" value={studentName(selectedStudent)} />
                <DetailRow className="px-3 py-2" label="Father's Name" value={father?.fatherName || '-'} />
                <DetailRow className="px-3 py-2" label="Mother's Name" value={mother?.motherName || '-'} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedStudent && (
        <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-muted/30 pb-3">
              <CardTitle className="flex items-center justify-between gap-3 text-base">
                <span className="flex items-center gap-2">
                  <ReceiptText className="size-4 text-primary" />
                  Payment Split
                </span>
                <Badge variant="outline">Payable {money(payableTotal)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">Split total: <span className="font-semibold text-foreground">{money(splitTotal)}</span></p>
                  <Button type="button" variant="outline" size="sm" onClick={addPaymentSplit}>
                    <PlusCircle className="mr-2 size-4" />
                    Add Row
                  </Button>
                </div>
                {paymentSplits.map((split) => (
                  <div key={split.id} className="grid gap-2 rounded-lg border bg-background p-2 md:grid-cols-[150px_1fr_1fr_40px]">
                    <Select
                      value={split.paymentMethod}
                      onValueChange={(value) => updatePaymentSplit(split.id, { paymentMethod: value as Exclude<PaymentMethod, 'SPLIT'> })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SELECTABLE_PAYMENT_METHODS.map((method) => (
                          <SelectItem key={method} value={method}>{PAYMENT_METHOD_LABELS[method]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={split.amount}
                      onChange={(event) => updatePaymentSplit(split.id, { amount: event.target.value })}
                      placeholder="Paid amount"
                    />
                    <Input
                      value={split.remarks}
                      onChange={(event) => updatePaymentSplit(split.id, { remarks: event.target.value })}
                      placeholder="Remarks?"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removePaymentSplit(split.id)}
                      disabled={paymentSplits.length === 1}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 md:grid-cols-[220px_1fr]">
                {selectedPreviousSessionDue > 0 && (
                  <>
                    <Label>Previous Session Dues</Label>
                    <Input value={money(selectedPreviousSessionDue)} readOnly />
                  </>
                )}
                <Label>Previous Month Dues</Label>
                <Input value={money(previousMonthDueTotal)} readOnly />
                <Label>Selected Fees</Label>
                <Input value={money(selectedCurrentSessionFee)} readOnly />
                <Label>Transport Fare</Label>
                <Input value={money(selectedTransportFare)} readOnly />
                <Label>Discount Amount</Label>
                <Input type="number" value={discountAmount} onChange={(event) => setDiscountAmount(event.target.value)} />
                <div>
                  <div className="text-lg font-semibold text-destructive">Actual Payment</div>
                  {transportItems.length > 0 && <div className="text-sm text-green-700">Transport fee applicable</div>}
                </div>
                <Input value={money(paymentValue)} readOnly />
                <Label>Balance/Due Amount</Label>
                <Input value={money(balanceDue)} readOnly />
              </div>
              <Button className="h-11 w-full text-base font-semibold" size="lg" onClick={collectNow} disabled={saving || collectionItems.length === 0}>
                {saving ? 'Collecting...' : `Collect Now (${money(paymentValue)})`}
              </Button>
            </CardContent>
          </Card>

          <Card className="overflow-hidden shadow-sm">
            <CardHeader className="border-b bg-muted/30 pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <ReceiptText className="size-4 text-primary" />
                  Select Particular
                </span>
                <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/10">Grand Total {money(payableTotal)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {studentCollections.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No pending fee rows found. Assign fees during admission or manual assignment first.
                </div>
              ) : visibleCollectionItems.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Tick a month or term to show its fee heads here.
                </div>
              ) : (
                visibleCollectionItems.map((item) => {
                  const checked = selectedCollectionIds.includes(item.id)
                  const carriedForward = !checked && previousMonthDueItems.some((due) => due.id === item.id)
                  return (
                    <div key={item.id} className={cn(
                      'grid grid-cols-[32px_1fr_110px] items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-primary/5',
                      checked && 'border-primary/50 bg-primary/10',
                      carriedForward && 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
                    )}>
                      <Checkbox checked={checked || carriedForward} disabled={carriedForward} onCheckedChange={() => toggleCollection(item.id)} />
                      <div>
                        <div className="font-medium">{item.feeHeadName || 'Fee'}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant="secondary">{itemPeriod(item)}</Badge>
                          {carriedForward && (
                            <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Previous Month Due</Badge>
                          )}
                          {item.academicYear && item.academicYear !== academicYear && (
                            <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Previous {item.academicYear}</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">{statusLabel(item.status)}</span>
                        </div>
                      </div>
                      <Input value={money(remainingAmount(item))} readOnly className="text-right" />
                    </div>
                  )
                })
              )}
              <div className="rounded-lg border bg-muted/40 p-3 text-right font-semibold">
                Grand Total {money(payableTotal)}
              </div>
              <Button variant="outline" className="w-full gap-2">
                <MessageCircle className="size-4" />
                Message For Cashier/Accountant
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {selectedStudent && (
        <Tabs defaultValue="history" className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-3 gap-2 bg-transparent p-0">
            <TabsTrigger
              value="history"
              className="h-14 gap-2 rounded-xl border bg-background text-base font-semibold data-[state=active]:border-primary/50 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <ReceiptText className="size-4" />
              Payment History
            </TabsTrigger>
            <TabsTrigger
              value="comment"
              className="h-14 gap-2 rounded-xl border bg-background text-base font-semibold data-[state=active]:border-primary/50 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <MessageCircle className="size-4" />
              Special Comment
            </TabsTrigger>
            <TabsTrigger
              value="expected"
              className="h-14 gap-2 rounded-xl border bg-background text-base font-semibold data-[state=active]:border-primary/50 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <CalendarDays className="size-4" />
              Expected Payment
            </TabsTrigger>
          </TabsList>
          <TabsContent value="history" className="rounded-lg border bg-card p-0 shadow-sm">
            {paymentHistory.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No payment history found for this academic year.</p>
            ) : (
              <div className="max-h-96 overflow-auto">
                <table className="w-full min-w-[920px] border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-muted">
                    <tr className="border-b">
                      <th className="px-3 py-3 text-left font-bold">#</th>
                      <th className="px-3 py-3 text-left font-bold">Receipt</th>
                      <th className="px-3 py-3 text-left font-bold">Name</th>
                      <th className="px-3 py-3 text-left font-bold">Class</th>
                      <th className="px-3 py-3 text-left font-bold">Fee Month</th>
                      <th className="px-3 py-3 text-left font-bold">Tr. Month</th>
                      <th className="px-3 py-3 text-left font-bold">Hostel Month</th>
                      <th className="px-3 py-3 text-left font-bold">Date</th>
                      <th className="px-3 py-3 text-right font-bold">Discount</th>
                      <th className="px-3 py-3 text-right font-bold">Paid</th>
                      <th className="px-3 py-3 text-right font-bold">Dues</th>
                      <th className="px-3 py-3 text-center font-bold">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b bg-muted/60">
                      <td colSpan={12} className="px-3 py-3 text-center text-base font-extrabold">
                        SESSION : {academicYear}
                      </td>
                    </tr>
                    {paymentHistory.map((row, index) => (
                      <tr key={row.id} className="border-b hover:bg-muted/40">
                        <td className="px-3 py-3">{index + 1}</td>
                        <td className="px-3 py-3">{row.receiptNumber || '-'}</td>
                        <td className="px-3 py-3">{row.studentName || studentName(selectedStudent)}</td>
                        <td className="px-3 py-3">{row.className || selectedStudent.class?.name || '-'}</td>
                        <td className="px-3 py-3">{row.feeMonth || '-'}</td>
                        <td className="px-3 py-3">{row.transportMonth || '-'}</td>
                        <td className="px-3 py-3">{row.hostelMonth || '-'}</td>
                        <td className="px-3 py-3">{formatHistoryDateTime(row.date)}</td>
                        <td className="px-3 py-3 text-right">{row.discount > 0 ? receiptMoney(row.discount) : '-'}</td>
                        <td className="px-3 py-3 text-right font-semibold text-emerald-700">{receiptMoney(row.paid)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-red-700">{row.dues > 0 ? receiptMoney(row.dues) : '-'}</td>
                        <td className="px-3 py-3 text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full border-red-300 px-3 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => openHistoryReceipt(row)}
                          >
                            Receipt
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
          <TabsContent value="comment" className="rounded-lg border bg-card p-4 shadow-sm">
            <Input value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Remarks for cashier/accountant" />
          </TabsContent>
          <TabsContent value="expected" className="rounded-lg border bg-card p-4 text-sm shadow-sm">
            Expected selected payment: <span className="font-semibold">{money(payableTotal)}</span>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!receiptSummary} onOpenChange={(open) => { if (!open) setReceiptSummary(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="size-5" />
              Fee Receipt
            </DialogTitle>
          </DialogHeader>
          {receiptSummary && (
            <div className="space-y-4">
              <div ref={receiptRef} className="fee-receipt-slip mx-auto w-full max-w-[380px] border-2 border-black bg-white text-[13px] leading-tight text-black">
                <div className="fee-receipt-header grid grid-cols-[95px_1fr_96px] border-b-2 border-black p-2">
                  <div className="fee-receipt-header-left font-bold">
                    <div>RECEIPT</div>
                    <div>NO: {receiptSummary.receiptNumber.replace(/^RCP-/, '')}</div>
                  </div>
                  <div className="fee-receipt-header-center text-center font-extrabold">
                    <div>FOR THE ACADEMIC</div>
                    <div>SESSION</div>
                    <div>{academicYear}</div>
                  </div>
                  <div className="fee-receipt-header-right text-right text-xs font-bold">
                    <div>{formatReceiptDate(receiptSummary.receiptDate)}</div>
                    <div>{formatReceiptTime(receiptSummary.receiptDate)}</div>
                  </div>
                </div>

                <div className="fee-receipt-details grid grid-cols-2 gap-x-4 gap-y-2 border-b-2 border-black p-2">
                  <ReceiptInfo label="Name:" value={studentName(receiptSummary.student)} />
                  <ReceiptInfo label="Phone:" value={contact || '-'} />
                  <ReceiptInfo label="Reg. No. :" value={receiptSummary.student.admission?.registrationNumber || receiptSummary.student.admissionNumber || '-'} />
                  <ReceiptInfo label="Father Name:" value={father?.fatherName || '-'} />
                  <ReceiptInfo label="Class:" value={receiptSummary.student.class?.name || '-'} />
                  <ReceiptInfo label="Roll No:" value={receiptSummary.student.rollNumber || '-'} />
                  <div className="fee-receipt-month-row col-span-2 grid grid-cols-[95px_1fr]">
                    <span className="font-bold">Fee Month:</span>
                    <span className="font-bold">{receiptSummary.feeMonths.join(', ') || '-'}</span>
                  </div>
                </div>

                <div>
                  {receiptSummary.lines.map((line) => (
                    <div key={line.label} className="fee-receipt-line grid min-h-10 grid-cols-[1fr_70px_100px] border-b-2 border-black">
                      <div className="fee-receipt-line-label p-1.5">{line.label}</div>
                      <div className="fee-receipt-line-detail border-l-2 border-black p-1.5 text-center text-xs">
                        {line.months.join(', ')}
                      </div>
                      <div className="fee-receipt-line-amount border-l-2 border-black p-1.5 text-base font-bold">{receiptMoney(line.amount)}</div>
                    </div>
                  ))}
                  <div className="fee-receipt-summary-row grid grid-cols-[1fr_100px] border-b-2 border-black">
                    <div className="fee-receipt-total-label p-1.5 font-extrabold">Total Paid</div>
                    <div className="fee-receipt-total-amount border-l-2 border-black p-1.5 text-base font-extrabold">{receiptMoney(receiptSummary.totalPaid)}</div>
                  </div>
                  <div className="fee-receipt-summary-row grid grid-cols-[1fr_100px] border-b-2 border-black">
                    <div className="fee-receipt-total-label p-1.5 font-extrabold">Dues Amount</div>
                    <div className="fee-receipt-total-amount border-l-2 border-black p-1.5 font-bold">{receiptMoney(receiptSummary.duesAmount)}</div>
                  </div>
                </div>

                <div className="fee-receipt-footer p-1.5">
                  <div>Amount in word: <span className="font-bold">({numberToWords(receiptSummary.totalPaid)})</span></div>
                  <div><span className="font-bold">Mode:</span> {PAYMENT_METHOD_LABELS[receiptSummary.paymentMethod] || receiptSummary.paymentMethod}</div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReceiptSummary(null)}>Close</Button>
                <Button onClick={printReceipt} className="gap-2">
                  <Printer className="size-4" />
                  Print
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ReceiptInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="fee-receipt-info grid grid-cols-[80px_1fr] gap-1">
      <span className="fee-receipt-info-label font-bold">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function DetailRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('grid grid-cols-[120px_1fr] border-b pb-1', className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
