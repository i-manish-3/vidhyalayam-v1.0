'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear } from '@/lib/academic-years'
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
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { DatePicker } from '@/components/date-picker'
import {
  ArrowLeft,
  Bus,
  CalendarDays,
  ChevronDown,
  MessageCircle,
  Printer,
  PlusCircle,
  ReceiptText,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildPrintHeaderHtml } from '@/lib/print-header'

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

function itemCalendarYearMonth(item: FeeCollectionItem): { year: number; month: number } | null {
  const period = itemPeriod(item)
  const ay = typeof item.academicYear === 'string' ? item.academicYear : ''
  if (!ay) return null
  const monthIdx = MONTHS.findIndex((m) => normalizedPeriod(m) === normalizedPeriod(period))
  if (monthIdx === -1) return null
  const [start] = ay.split('-').map((n) => Number(n))
  if (Number.isNaN(start)) return null
  const calendarMonth = monthIdx <= 8 ? monthIdx + 3 : monthIdx - 9
  const calendarYear = monthIdx <= 8 ? start : start + 1
  return { year: calendarYear, month: calendarMonth }
}

function itemIsBeforeToday(item: FeeCollectionItem): boolean {
  const ym = itemCalendarYearMonth(item)
  if (!ym) return false
  const today = new Date()
  if (ym.year < today.getFullYear()) return true
  if (ym.year > today.getFullYear()) return false
  return ym.month < today.getMonth()
}

function itemIsCurrentCalendarMonth(item: FeeCollectionItem): boolean {
  const ym = itemCalendarYearMonth(item)
  if (!ym) return false
  const today = new Date()
  return ym.year === today.getFullYear() && ym.month === today.getMonth()
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

// Allocation order when a partial payment is split across selected items:
//   1. Non-monthly heads first (Admission, Exam, Term, Registration, …) — they
//      carry no month context, so they front-load before any month is touched.
//   2. Then walk monthly items month-by-month (Apr → May → … → Mar).
//   3. Within the same month, transport is filled before monthly tuition.
//   4. Due date is the final tiebreaker.
function allocationSortKey(item: FeeCollectionItem): [number, number, number, string] {
  const period = itemPeriod(item)
  const monthIndex = periodSortIndex(period)
  const isMonthly = monthIndex !== Number.MAX_SAFE_INTEGER
  // Tier 0 = non-monthly head (admission / exam / etc.), Tier 1 = monthly bucket.
  const tier = isMonthly ? 1 : 0
  // Within a month: transport (0) before monthly tuition (1).
  const withinMonth = item.source === 'transport' ? 0 : 1
  return [tier, monthIndex, withinMonth, item.dueDate || '']
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
  const currentSchool = useAppStore((state) => state.currentSchool)
  const currentSchoolAcademicYear = currentSchool?.academicYear
  const viewingAcademicYear = useAppStore((state) => state.viewingAcademicYear)
  const goBack = useAppStore((state) => state.goBack)
  const academicYear = viewingAcademicYear || currentSchoolAcademicYear || getCurrentAcademicYear()

  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [allStudentCollections, setAllStudentCollections] = useState<FeeCollectionItem[]>([])
  const [receiptHistory, setReceiptHistory] = useState<ReceiptHistoryRow[]>([])
  const [transportInfo, setTransportInfo] = useState<TransportInfo | null>(null)
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [discountAmount, setDiscountAmount] = useState('')
  const [remarks, setRemarks] = useState('')
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplitRow[]>([
    { id: 'split-1', paymentMethod: 'CASH', amount: '', remarks: '' },
  ])
  // Tracks whether the user has manually edited the first split's amount. While
  // false, we keep the first split (Cash by default) auto-synced to the live
  // total payable, so the cashier can simply hit "Collect" for full payment.
  const [firstSplitEdited, setFirstSplitEdited] = useState(false)
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([])
  const [receiptSummary, setReceiptSummary] = useState<ReceiptSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const receiptRef = useRef<HTMLDivElement>(null)

  const fetchInitialData = useCallback(async () => {
    try {
      const studentsRes = await api.get<{ students: Student[] }>('/api/school/students', { limit: '25', academicYear })
      setStudents(studentsRes.students || [])
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
      const mergedItems = Array.from(merged.values())
      setAllStudentCollections(mergedItems)
      setReceiptHistory(currentData.receiptHistory || [])
      setTransportInfo(currentData.transportInfo || null)

      // Auto-select previous-AY dues + current-AY monthly fees up to & including the current calendar month.
      // Skip: current-AY non-monthly (admission/term/exam) and future months. Cashier can adjust manually.
      const today = new Date()
      const todayMonth = today.getMonth()
      const todayYear = today.getFullYear()
      const monthIsCurrentOrPast = (periodName: string, ay: string) => {
        const monthIdx = MONTHS.findIndex((m) => normalizedPeriod(m) === normalizedPeriod(periodName))
        if (monthIdx === -1) return false
        const [start] = ay.split('-').map((n) => Number(n))
        if (Number.isNaN(start)) return false
        const calendarMonth = monthIdx <= 8 ? monthIdx + 3 : monthIdx - 9
        const calendarYear = monthIdx <= 8 ? start : start + 1
        if (calendarYear < todayYear) return true
        if (calendarYear > todayYear) return false
        return calendarMonth <= todayMonth
      }
      const autoIds: string[] = []
      const autoKeys = new Set<string>()
      for (const item of mergedItems) {
        if (item.status === 'PAID') continue
        const itemAy = typeof item.academicYear === 'string' ? item.academicYear : ''
        if (itemAy && itemAy < academicYear) {
          autoIds.push(item.id)
          autoKeys.add(collectionSelectionKey(item))
          continue
        }
        if (itemAy === academicYear && isMonthPeriod(itemPeriod(item)) && monthIsCurrentOrPast(itemPeriod(item), itemAy)) {
          autoIds.push(item.id)
          autoKeys.add(collectionSelectionKey(item))
        }
      }
      setSelectedCollectionIds(autoIds)
      setSelectedPeriods(Array.from(autoKeys))
      setDiscountAmount('')
      setPaymentSplits([{ id: 'split-1', paymentMethod: 'CASH', amount: '', remarks: '' }])
      setFirstSplitEdited(false)
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
  const currentAllOtherTermItems = useMemo(
    () => currentAllAcademicItems.filter((item) => !isMonthPeriod(itemPeriod(item))),
    [currentAllAcademicItems]
  )
  const previousDueItems = useMemo(
    () => studentCollections.filter((item) =>
      typeof item.academicYear === 'string' && item.academicYear < academicYear
    ),
    [academicYear, studentCollections]
  )
  const otherTermOptions = useMemo(() => {
    const map = new Map<string, { period: string; academicYear?: string | null; amount: number; total: number; count: number }>()
    for (const item of currentAllOtherTermItems) {
      const key = collectionSelectionKey(item)
      const option = map.get(key) || { period: itemPeriod(item), academicYear: item.academicYear, amount: 0, total: 0, count: 0 }
      option.amount += remainingAmount(item)
      option.total += totalAmount(item)
      option.count += 1
      map.set(key, option)
    }
    return Array.from(map.values()).sort((a, b) => comparePeriods(a.period, b.period))
  }, [currentAllOtherTermItems])
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

  // Live allocation preview: as the cashier types amounts into the payment
  // split rows (or the Discount input), each selected particular shows how
  // much it will receive and how much will remain due. Uses the SAME order as
  // collectNow() → admission/exam → month-by-month (transport then tuition).
  const allocationPreview = useMemo(() => {
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
    const map = new Map<string, { paying: number; discount: number; remaining: number; due: number }>()
    if (collectionItems.length === 0) return map
    const sorted = [...collectionItems].sort((a, b) => {
      const keyA = allocationSortKey(a)
      const keyB = allocationSortKey(b)
      for (let i = 0; i < keyA.length; i++) {
        const va = keyA[i]
        const vb = keyB[i]
        if (typeof va === 'number' && typeof vb === 'number') {
          if (va !== vb) return va - vb
        } else {
          const cmp = String(va).localeCompare(String(vb))
          if (cmp !== 0) return cmp
        }
      }
      return 0
    })
    let remaining = splitTotal
    let remainingDiscount = discount
    for (const item of sorted) {
      const due = remainingAmount(item)
      if (due <= 0) {
        map.set(item.id, { paying: 0, discount: 0, remaining: 0, due: 0 })
        continue
      }
      const discountForRow = remainingDiscount > 0 ? Math.min(remainingDiscount, due) : 0
      const payableForRow = Math.max(0, due - discountForRow)
      const paymentForRow = Math.min(payableForRow, Math.max(0, remaining))
      remaining -= paymentForRow
      remainingDiscount -= discountForRow
      const remainingDue = Math.max(0, due - discountForRow - paymentForRow)
      map.set(item.id, {
        paying: round2(paymentForRow),
        discount: round2(discountForRow),
        remaining: round2(remainingDue),
        due: round2(due),
      })
    }
    return map
  }, [collectionItems, splitTotal, discount])
  const feeGroupName =
    allStudentCollections.find((item) => item.feesGroupName && item.academicYear === academicYear)?.feesGroupName
    || allStudentCollections.find((item) => item.feesGroupName)?.feesGroupName
    || '-'
  const father = selectedStudent?.parentLinks?.find((link) => link.parent?.fatherName)?.parent
  const mother = selectedStudent?.parentLinks?.find((link) => link.parent?.motherName)?.parent
  const contact = father?.phone || mother?.phone || ''
  const previousMonthDueTotal = previousMonthDueItems
    .reduce((sum, item) => sum + remainingAmount(item), 0)
  const selectedPreviousSessionDue = selectedItems
    .filter((item) => item.academicYear !== academicYear)
    .reduce((sum, item) => sum + remainingAmount(item), 0)
  const selectedPreviousMonthDueInAY = selectedItems
    .filter((item) => item.academicYear === academicYear && isMonthPeriod(itemPeriod(item)) && itemIsBeforeToday(item))
    .reduce((sum, item) => sum + remainingAmount(item), 0)
  const selectedCurrentMonthFee = selectedItems
    .filter((item) => item.academicYear === academicYear && isMonthPeriod(itemPeriod(item)) && itemIsCurrentCalendarMonth(item))
    .reduce((sum, item) => sum + remainingAmount(item), 0)
  const selectedFutureMonthFee = selectedItems
    .filter((item) => item.academicYear === academicYear && isMonthPeriod(itemPeriod(item)) && !itemIsBeforeToday(item) && !itemIsCurrentCalendarMonth(item))
    .reduce((sum, item) => sum + remainingAmount(item), 0)
  const selectedAdmissionTermFee = selectedItems
    .filter((item) => item.academicYear === academicYear && !isMonthPeriod(itemPeriod(item)))
    .reduce((sum, item) => sum + remainingAmount(item), 0)
  const selectedTransportFare = selectedItems
    .filter((item) => item.academicYear === academicYear && isTransportItem(item))
    .reduce((sum, item) => sum + remainingAmount(item), 0)

  useEffect(() => {
    if (firstSplitEdited) return
    if (paymentSplits.length !== 1) return
    if (selectedTotal <= 0) return
    const desired = payableTotal > 0 ? String(payableTotal) : ''
    if (paymentSplits[0].amount === desired) return
    setPaymentSplits((current) =>
      current.map((split, index) => (index === 0 ? { ...split, amount: desired } : split))
    )
  }, [firstSplitEdited, payableTotal, paymentSplits, selectedTotal])

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

  const clearAllSelections = () => {
    setSelectedPeriods([])
    setSelectedCollectionIds([])
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

  const printReceipt = (mode: 'single' | 'office' | 'parent' | 'both' = 'single') => {
    if (!receiptRef.current) return
    const printWindow = window.open('', '_blank', 'width=430,height=650')
    if (!printWindow) {
      window.print()
      return
    }

    const headerHtml = buildPrintHeaderHtml(currentSchool, { fallbackToAutoHeader: true })
    const receiptHtml = receiptRef.current.outerHTML

    const renderCopy = (label: string | null) => `
      <section class="receipt-copy">
        ${label ? `<div class="copy-label">${label}</div>` : ''}
        ${headerHtml ? `<div class="receipt-print-header">${headerHtml}</div>` : ''}
        <div class="receipt-print-root">${receiptHtml}</div>
      </section>
    `

    let body = ''
    if (mode === 'single') {
      body = renderCopy(null)
    } else if (mode === 'office') {
      body = renderCopy('OFFICE COPY')
    } else if (mode === 'parent') {
      body = renderCopy('PARENT COPY')
    } else {
      body = `${renderCopy('OFFICE COPY')}<div class="cut-line"><span>✂ &nbsp; cut here &nbsp; ✂</span></div>${renderCopy('PARENT COPY')}`
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
            .receipt-copy { width: 380px; max-width: 100%; margin: 0 auto; }
            .copy-label {
              text-align: center;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 2px;
              padding: 4px 0;
              margin-bottom: 6px;
              border: 1.5px dashed #000;
              text-transform: uppercase;
            }
            .cut-line {
              width: 380px;
              max-width: 100%;
              margin: 12px auto;
              border-top: 1.5px dashed #000;
              position: relative;
              text-align: center;
              font-size: 10px;
              color: #555;
            }
            .cut-line span {
              position: relative;
              top: -8px;
              background: #fff;
              padding: 0 6px;
              letter-spacing: 1px;
            }
            .receipt-print-root { width: 375px; max-width: 100%; }
            .receipt-print-header { width: 375px; max-width: 100%; margin-bottom: 10px; }
            .receipt-print-header img { display: block; width: 100%; }
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
              @page { margin: 10mm; size: A4 portrait; }
              body { padding: 0; }
              .cut-line { page-break-inside: avoid; }
              .receipt-copy { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          ${body}
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
    if (id === 'split-1' && 'amount' in patch) {
      setFirstSplitEdited(true)
    }
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
        const keyA = allocationSortKey(a)
        const keyB = allocationSortKey(b)
        for (let i = 0; i < keyA.length; i++) {
          const va = keyA[i]
          const vb = keyB[i]
          if (typeof va === 'number' && typeof vb === 'number') {
            if (va !== vb) return va - vb
          } else {
            const cmp = String(va).localeCompare(String(vb))
            if (cmp !== 0) return cmp
          }
        }
        return 0
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
    <div className="space-y-4">
      {/* ── Page Header ──────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => goBack('dashboard')} className="size-9 shrink-0">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight leading-tight">Collect Fee</h1>
              <Badge variant="outline" className="gap-1 h-5 px-2 text-[10px] font-semibold uppercase tracking-wider">
                <CalendarDays className="size-3" />
                {academicYear}
              </Badge>
              {currentSchoolAcademicYear && academicYear !== currentSchoolAcademicYear && (
                <Badge variant="outline" className="h-5 border-amber-300 bg-amber-100 px-2 text-[10px] font-semibold uppercase tracking-wider text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  Past session
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Search a student, select dues, split payment, and print the receipt.
            </p>
          </div>
        </div>
        {selectedStudent && selectedTotal > 0 && (
          <div className="flex items-center gap-2">
            <div className="rounded-md border bg-card px-3 py-1.5 shadow-sm">
              <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Selected</div>
              <div className="text-sm font-bold tabular-nums leading-tight">{money(selectedTotal)}</div>
            </div>
            <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 shadow-sm">
              <div className="text-[9px] font-semibold text-primary uppercase tracking-wider">Payable</div>
              <div className="text-sm font-bold text-primary tabular-nums leading-tight">{money(payableTotal)}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Search Bar + Payment Date ───────────────────────── */}
      <Card className="!gap-0 !py-0 shadow-sm">
        <CardContent className="p-2">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name, admission, registration or roll no."
                className="h-9 pl-8 text-sm"
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
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                        onClick={() => handleSelectStudent(student)}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
                            {student.admission?.profileImage ? (
                              <img src={student.admission.profileImage} alt={studentName(student)} className="h-full w-full object-cover" />
                            ) : (
                              <UserRound className="size-3.5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{studentName(student)}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {student.class?.name || '-'}{student.rollNumber ? ` · Roll ${student.rollNumber}` : ''}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <DatePicker
              value={paymentDate}
              onChange={setPaymentDate}
              disableFuture
              placeholder="Payment date"
              triggerClassName="h-9 w-full text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Empty state when no student selected ───────────── */}
      {!selectedStudent && (
        <Card className="!gap-0 border-dashed !py-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserRound className="size-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold">Select a student to begin</h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Search above. You&apos;ll see pending fees, transport dues, and full payment history right here.
            </p>
          </CardContent>
        </Card>
      )}

      {selectedStudent && (
        <>
          {/* ── Student Profile Strip ────────────────────────── */}
          <Card className="!gap-0 overflow-hidden !py-0 shadow-sm">
            <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
              <div className="flex items-center gap-3 border-b bg-muted/30 px-3 py-2 lg:border-b-0 lg:border-r">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                  {selectedStudent.admission?.profileImage ? (
                    <img src={selectedStudent.admission.profileImage} alt={studentName(selectedStudent)} className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="size-8 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold leading-tight">{studentName(selectedStudent)}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="h-5 px-2 text-[10px]">{selectedStudent.class?.name || '-'}</Badge>
                    {selectedStudent.section?.name && (
                      <Badge variant="secondary" className="h-5 px-2 text-[10px]">{selectedStudent.section.name}</Badge>
                    )}
                    {selectedStudent.rollNumber && (
                      <span className="text-[11px] text-muted-foreground">Roll · {selectedStudent.rollNumber}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-2 sm:grid-cols-3 lg:grid-cols-4">
                <ProfileItem label="Adm. No." value={selectedStudent.admissionNumber || '-'} />
                <ProfileItem label="Reg. No." value={selectedStudent.admission?.registrationNumber || '-'} />
                <ProfileItem label="Father" value={father?.fatherName || '-'} />
                <ProfileItem label="Mother" value={mother?.motherName || '-'} />
                <ProfileItem label="Contact" value={contact || '-'} />
                <ProfileItem label="Fee Group" value={feeGroupName} />
                <ProfileItem label="Admission Date" value={formatStudentDate(selectedStudent.admission?.dateOfAdmission)} />
              </div>
            </div>
          </Card>

          {/* ── Collection Grid ─────────────────────────────── */}
          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <div className="space-y-4">
              {/* Select Periods */}
              <Card className="!gap-0 !py-0 shadow-sm">
                <CardHeader className="border-b px-3 !py-2">
                  <CardTitle className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <CalendarDays className="size-4 text-primary" />
                      Select Months / Terms
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllDues}>
                        Select All Pending
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={clearAllSelections}
                        disabled={selectedPeriods.length === 0 && selectedCollectionIds.length === 0}
                      >
                        Clear
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 px-3 py-2.5">
                  {previousDueOptions.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50/60 p-2.5 dark:border-red-500/30 dark:bg-red-500/10">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-red-900 dark:text-red-300">
                        <span className="size-2 rounded-full bg-red-500" />
                        Previous Session Dues
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {previousDueOptions.map((option) => {
                          const checked = selectedPeriods.includes(periodSelectionKey(option.period, option.transport, option.academicYear))
                          return (
                            <label
                              key={`${option.academicYear}-${option.period}-${option.transport}`}
                              className={cn(
                                'flex cursor-pointer items-center gap-2 rounded-md border bg-white px-2 py-1.5 text-xs transition-colors hover:border-red-400 dark:bg-background',
                                checked && 'border-red-400 bg-red-50 dark:bg-red-500/20'
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => togglePeriod(option.period, option.transport, option.academicYear || null)}
                              />
                              <span className="truncate">{option.academicYear || 'Past'} · {option.transport ? 'Transport ' : ''}{option.period}</span>
                              <span className="ml-auto font-semibold tabular-nums text-red-700 dark:text-red-400">{money(option.amount)}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {otherTermOptions.length > 0 && (
                    <div className="rounded-lg border bg-background p-2.5">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <span className="size-2 rounded-full bg-slate-500" />
                        Admission / Term Fees
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {otherTermOptions.map((option) => {
                          const checked = selectedPeriods.includes(periodSelectionKey(option.period, false, option.academicYear))
                          const allItemsForOption = currentAllOtherTermItems.filter(
                            (item) =>
                              matchesPeriod(item, option.period) &&
                              academicYearKey(item.academicYear) === academicYearKey(option.academicYear)
                          )
                          const state = periodPaymentState(allItemsForOption)
                          const isSettled = state === 'paid'
                          return (
                            <label
                              key={`${option.academicYear}-${option.period}`}
                              className={cn(
                                'flex cursor-pointer items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5',
                                checked && 'border-primary/50 bg-primary/10',
                                state === 'partial' && !checked && 'border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10',
                                isSettled && 'cursor-default border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-200 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                              )}
                            >
                              <Checkbox
                                checked={checked || isSettled}
                                disabled={isSettled}
                                onCheckedChange={() => togglePeriod(option.period, false, option.academicYear || null)}
                              />
                              <span className="truncate">{option.period}</span>
                              {state && (
                                <span
                                  className={cn(
                                    'inline-block size-1.5 rounded-full',
                                    state === 'paid' && 'bg-emerald-500',
                                    state === 'partial' && 'bg-amber-500',
                                    state === 'unpaid' && 'bg-slate-400'
                                  )}
                                  title={periodStateLabel(state)}
                                />
                              )}
                              <span
                                className={cn(
                                  'ml-auto font-semibold tabular-nums',
                                  state === 'partial' && 'text-amber-700 dark:text-amber-300',
                                  isSettled && 'text-emerald-700 dark:text-emerald-300'
                                )}
                              >
                                {isSettled
                                  ? `Paid · ${money(option.total)}`
                                  : state === 'partial'
                                  ? `Partial · ${money(option.amount)}`
                                  : money(option.amount)}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                      <span className="size-2 rounded-full bg-primary" />
                      Monthly Fees
                      <span className="text-[10px] font-normal text-muted-foreground">· {academicYear}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                      {MONTHS.map((month) => {
                        const monthItems = currentMonthItems.filter((item) => matchesPeriod(item, month))
                        const allMonthItems = currentAllMonthItems.filter((item) => matchesPeriod(item, month))
                        const monthState = periodPaymentState(allMonthItems)
                        const checked = selectedPeriods.includes(periodSelectionKey(month, false, academicYear))
                        const isSettled = monthState === 'paid'
                        const monthAmount = monthItems.reduce((sum, item) => sum + remainingAmount(item), 0)
                        const hasFee = allMonthItems.length > 0
                        const sampleItem = allMonthItems[0]
                        const isOverdue = !!sampleItem && itemIsBeforeToday(sampleItem) && (monthState === 'unpaid' || monthState === 'partial')
                        const isCurrentCal = !!sampleItem && itemIsCurrentCalendarMonth(sampleItem)
                        return (
                          <label
                            key={month}
                            className={cn(
                              'flex cursor-pointer flex-col gap-0.5 rounded-md border bg-card px-2 py-1.5 text-xs transition-all hover:border-primary/40 hover:bg-primary/5',
                              checked && 'border-primary bg-primary/10 ring-1 ring-primary/20',
                              isOverdue && !checked && 'border-red-300 bg-red-50/70 text-red-900 hover:border-red-400 hover:bg-red-50 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200',
                              isCurrentCal && !checked && !isOverdue && 'border-primary/40 bg-primary/5',
                              isSettled && 'cursor-default border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-200 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
                              !hasFee && 'cursor-default bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted/40'
                            )}
                          >
                            <div className="flex w-full items-center gap-1.5">
                              <Checkbox
                                checked={checked || isSettled}
                                disabled={!hasFee || isSettled}
                                onCheckedChange={() => togglePeriod(month, false, academicYear)}
                              />
                              <span className="font-medium">{month}</span>
                              {isCurrentCal && hasFee && !isSettled && (
                                <span className="rounded bg-primary/15 px-1 py-px text-[9px] font-semibold uppercase leading-none tracking-wide text-primary">Now</span>
                              )}
                              {monthState && (
                                <span
                                  className={cn(
                                    'ml-auto inline-block size-1.5 rounded-full',
                                    monthState === 'paid' && 'bg-emerald-500',
                                    monthState === 'partial' && 'bg-amber-500',
                                    monthState === 'unpaid' && (isOverdue ? 'bg-red-500' : 'bg-slate-400')
                                  )}
                                  title={isOverdue ? `Overdue · ${periodStateLabel(monthState)}` : periodStateLabel(monthState)}
                                />
                              )}
                            </div>
                            <div className={cn(
                              'text-[10px] tabular-nums',
                              isOverdue ? 'font-semibold text-red-700 dark:text-red-300' : 'text-muted-foreground'
                            )}>
                              {!hasFee ? 'No fee' : isSettled ? 'Paid' : isOverdue ? `Due · ${money(monthAmount)}` : money(monthAmount)}
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Transport */}
              {currentAllTransportItems.length > 0 && (
                <Card className="!gap-0 overflow-hidden !py-0 shadow-sm">
                  <CardHeader className="border-b border-emerald-200 bg-emerald-50 px-3 !py-2 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <CardTitle className="flex items-center justify-between gap-3 text-sm text-emerald-900 dark:text-emerald-200">
                      <span className="flex items-center gap-2">
                        <Bus className="size-4" />
                        Transport
                      </span>
                      {(transportInfo?.fareAmount || currentAllTransportItems[0]?.amount) && (
                        <Badge variant="outline" className="border-emerald-300 bg-white text-[10px] text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-200">
                          Monthly · {money(transportInfo?.fareAmount || currentAllTransportItems[0]?.amount || 0)}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5 px-3 py-2.5">
                    <div className="grid gap-2 rounded-md border bg-muted/30 p-2.5 text-xs sm:grid-cols-2">
                      <div>
                        <span className="text-muted-foreground">Route:</span>
                        <span className="ml-1 font-medium">
                          {transportInfo?.routeName || 'Assigned Route'}
                          {transportInfo?.routeNumber ? ` (${transportInfo.routeNumber})` : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Stop:</span>
                        <span className="ml-1 font-medium">{transportInfo?.stopName || transportInfo?.pickupPoint || '-'}</span>
                      </div>
                      {transportInfo?.vehicleNumber && (
                        <div>
                          <span className="text-muted-foreground">Vehicle:</span>
                          <span className="ml-1 font-medium">{transportInfo.vehicleNumber}</span>
                        </div>
                      )}
                      {transportInfo?.startPoint && transportInfo?.endPoint && (
                        <div>
                          <span className="text-muted-foreground">Path:</span>
                          <span className="ml-1 font-medium">{transportInfo.startPoint} → {transportInfo.endPoint}</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                      {MONTHS.map((month) => {
                        const monthItems = currentTransportItems.filter((item) => matchesPeriod(item, month))
                        const allMonthItems = currentAllTransportItems.filter((item) => matchesPeriod(item, month))
                        const monthState = periodPaymentState(allMonthItems)
                        const monthKey = periodSelectionKey(month, true, academicYear)
                        const checked = selectedPeriods.includes(monthKey)
                        const isSettled = monthState === 'paid'
                        const monthAmount = monthItems.reduce((sum, item) => sum + remainingAmount(item), 0)
                        const hasFee = allMonthItems.length > 0
                        const sampleItem = allMonthItems[0]
                        const isOverdue = !!sampleItem && itemIsBeforeToday(sampleItem) && (monthState === 'unpaid' || monthState === 'partial')
                        const isCurrentCal = !!sampleItem && itemIsCurrentCalendarMonth(sampleItem)
                        return (
                          <label
                            key={month}
                            className={cn(
                              'flex cursor-pointer flex-col gap-0.5 rounded-md border bg-white px-2 py-1.5 text-xs transition-all hover:border-emerald-400 dark:bg-background',
                              checked && 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-500/20',
                              isOverdue && !checked && 'border-red-300 bg-red-50/70 text-red-900 hover:border-red-400 hover:bg-red-50 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200',
                              isCurrentCal && !checked && !isOverdue && 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-500/10',
                              isSettled && 'cursor-default border-emerald-300 bg-emerald-100 text-emerald-900 hover:border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200',
                              !hasFee && 'cursor-default bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted/40'
                            )}
                          >
                            <div className="flex w-full items-center gap-1.5">
                              <Checkbox
                                checked={checked || isSettled}
                                disabled={!hasFee || isSettled}
                                onCheckedChange={() => togglePeriod(month, true, academicYear)}
                              />
                              <span className="font-medium">{month}</span>
                              {isCurrentCal && hasFee && !isSettled && (
                                <span className="rounded bg-emerald-500/20 px-1 py-px text-[9px] font-semibold uppercase leading-none tracking-wide text-emerald-700 dark:text-emerald-300">Now</span>
                              )}
                              {monthState && (
                                <span
                                  className={cn(
                                    'ml-auto inline-block size-1.5 rounded-full',
                                    monthState === 'paid' && 'bg-emerald-500',
                                    monthState === 'partial' && 'bg-amber-500',
                                    monthState === 'unpaid' && (isOverdue ? 'bg-red-500' : 'bg-slate-400')
                                  )}
                                  title={isOverdue ? `Overdue · ${periodStateLabel(monthState)}` : periodStateLabel(monthState)}
                                />
                              )}
                            </div>
                            <div className={cn(
                              'text-[10px] tabular-nums',
                              isOverdue ? 'font-semibold text-red-700 dark:text-red-300' : 'text-muted-foreground'
                            )}>
                              {!hasFee ? 'No fee' : isSettled ? 'Paid' : isOverdue ? `Due · ${money(monthAmount)}` : money(monthAmount)}
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Selected Particulars */}
              <Card className="!gap-0 !py-0 shadow-sm">
                <CardHeader className="border-b bg-muted/30 px-3 !py-2">
                  <CardTitle className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <ReceiptText className="size-4 text-primary" />
                      Selected Particulars
                    </span>
                    <Badge variant="secondary" className="bg-primary/10 text-[10px] text-primary hover:bg-primary/10">
                      Grand Total · {money(payableTotal)}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 px-3 py-2.5">
                  {studentCollections.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                      No pending fee rows found. Assign fees during admission or manual assignment first.
                    </div>
                  ) : visibleCollectionItems.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                      Tick a month or term above to show its fee heads here.
                    </div>
                  ) : (
                    visibleCollectionItems.map((item) => {
                      const checked = selectedCollectionIds.includes(item.id)
                      const carriedForward = !checked && previousMonthDueItems.some((due) => due.id === item.id)
                      const preview = checked || carriedForward ? allocationPreview.get(item.id) : undefined
                      const due = preview?.due ?? remainingAmount(item)
                      const paying = preview?.paying ?? 0
                      const previewDiscount = preview?.discount ?? 0
                      const remainingAfter = preview ? preview.remaining : due
                      const hasPaymentInput = splitTotal > 0 || discount > 0
                      const isFullyPaid = preview && hasPaymentInput && remainingAfter <= 0 && (paying > 0 || previewDiscount > 0)
                      const isPartiallyPaid = preview && hasPaymentInput && (paying > 0 || previewDiscount > 0) && remainingAfter > 0
                      const isUnpaid = preview && hasPaymentInput && paying <= 0 && previewDiscount <= 0
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            'grid grid-cols-[24px_1fr_auto] items-center gap-2.5 rounded-md border bg-background p-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5',
                            checked && 'border-primary/50 bg-primary/10',
                            carriedForward && 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10',
                            isFullyPaid && 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10',
                            isPartiallyPaid && 'border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10',
                          )}
                        >
                          <Checkbox checked={checked || carriedForward} disabled={carriedForward} onCheckedChange={() => toggleCollection(item.id)} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium leading-tight">{item.feeHeadName || 'Fee'}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{itemPeriod(item)}</Badge>
                              {carriedForward && (
                                <Badge className="h-4 bg-amber-100 px-1.5 text-[10px] text-amber-900 hover:bg-amber-100">Previous Month Due</Badge>
                              )}
                              {item.academicYear && item.academicYear !== academicYear && (
                                <Badge className="h-4 bg-amber-100 px-1.5 text-[10px] text-amber-900 hover:bg-amber-100">Past · {item.academicYear}</Badge>
                              )}
                              {isFullyPaid && (
                                <Badge className="h-4 bg-emerald-100 px-1.5 text-[10px] text-emerald-900 hover:bg-emerald-100">Will Be Paid</Badge>
                              )}
                              {isPartiallyPaid && (
                                <Badge className="h-4 bg-amber-100 px-1.5 text-[10px] text-amber-900 hover:bg-amber-100">Partial</Badge>
                              )}
                              {isUnpaid && (
                                <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-muted-foreground">Unpaid</Badge>
                              )}
                              {!hasPaymentInput && (
                                <span className="text-[10px] text-muted-foreground">{statusLabel(item.status)}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            <div className={cn(
                              'text-sm font-bold tabular-nums',
                              isFullyPaid && 'text-emerald-700 dark:text-emerald-300',
                              isPartiallyPaid && 'text-amber-700 dark:text-amber-300',
                            )}>
                              {money(due)}
                            </div>
                            {preview && hasPaymentInput && (paying > 0 || previewDiscount > 0) && (
                              <div className="text-[10px] tabular-nums text-emerald-700 dark:text-emerald-300">
                                Paying {money(paying + previewDiscount)}
                                {previewDiscount > 0 && ` (incl. ${money(previewDiscount)} disc.)`}
                              </div>
                            )}
                            {preview && hasPaymentInput && remainingAfter > 0 && (
                              <div className="text-[10px] tabular-nums text-red-600 dark:text-red-400">
                                {money(remainingAfter)} due
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Payment Summary Sidebar ────────────────────── */}
            <Card className="!gap-0 self-start !py-0 shadow-sm xl:sticky xl:top-4">
              <CardHeader className="border-b px-3 !py-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ReceiptText className="size-4 text-primary" />
                  Payment Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 px-3 py-2.5">
                {/* Breakdown */}
                <div className="space-y-1 rounded-md border bg-muted/30 p-2.5 text-xs">
                  {selectedPreviousSessionDue > 0 && (
                    <SummaryRow label="Previous Session Dues" value={money(selectedPreviousSessionDue)} accent="amber" />
                  )}
                  {selectedPreviousMonthDueInAY > 0 && (
                    <SummaryRow label="Previous Month Dues" value={money(selectedPreviousMonthDueInAY)} accent="amber" />
                  )}
                  {previousMonthDueTotal > 0 && (
                    <SummaryRow label="Unselected Past Dues" value={money(previousMonthDueTotal)} accent="amber" />
                  )}
                  {selectedCurrentMonthFee > 0 && (
                    <SummaryRow label="Current Month" value={money(selectedCurrentMonthFee)} />
                  )}
                  {selectedFutureMonthFee > 0 && (
                    <SummaryRow label="Future / Advance Months" value={money(selectedFutureMonthFee)} />
                  )}
                  {selectedAdmissionTermFee > 0 && (
                    <SummaryRow label="Admission / Term Fees" value={money(selectedAdmissionTermFee)} />
                  )}
                  {selectedTransportFare > 0 && (
                    <SummaryRow label="Transport Fare (Total)" value={money(selectedTransportFare)} accent="emerald" />
                  )}
                  <SummaryRow label="Sub Total" value={money(selectedTotal)} bold />
                </div>

                {/* Discount */}
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Discount</Label>
                  <Input
                    type="number"
                    value={discountAmount}
                    onChange={(event) => setDiscountAmount(event.target.value)}
                    placeholder="0"
                    className="h-9 text-sm"
                  />
                </div>

                {/* Total Payable */}
                <div className="rounded-md border-2 border-primary/30 bg-primary/5 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Total Payable</span>
                    <span className="text-lg font-bold tabular-nums text-primary">{money(payableTotal)}</span>
                  </div>
                </div>

                {/* Payment Splits */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Method</Label>
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={addPaymentSplit}>
                      <PlusCircle className="mr-1 size-3" />
                      Split
                    </Button>
                  </div>
                  {paymentSplits.map((split, splitIdx) => (
                    <div key={split.id} className="space-y-1.5 rounded-md border bg-background p-2">
                      <div className="grid grid-cols-[110px_1fr_28px] gap-1.5">
                        <Select
                          value={split.paymentMethod}
                          onValueChange={(value) => updatePaymentSplit(split.id, { paymentMethod: value as Exclude<PaymentMethod, 'SPLIT'> })}
                        >
                          <SelectTrigger className="h-8 text-xs">
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
                          placeholder="Amount"
                          className="h-8 text-xs"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          onClick={() => removePaymentSplit(split.id)}
                          disabled={paymentSplits.length === 1}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <Input
                        value={split.remarks}
                        onChange={(event) => updatePaymentSplit(split.id, { remarks: event.target.value })}
                        placeholder={paymentSplits.length > 1 ? `Remarks for split ${splitIdx + 1} (optional)` : 'Remarks (optional)'}
                        className="h-7 text-xs"
                      />
                    </div>
                  ))}
                  {paymentSplits.length > 1 && (
                    <div className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1 text-[11px]">
                      <span className="text-muted-foreground">Split total</span>
                      <span className="font-semibold tabular-nums">{money(splitTotal)}</span>
                    </div>
                  )}
                </div>

                {/* Balance Due (if any) */}
                {balanceDue > 0 && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs dark:border-red-500/30 dark:bg-red-500/10">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-red-700 dark:text-red-300">Balance Due</span>
                      <span className="font-bold tabular-nums text-red-700 dark:text-red-300">{money(balanceDue)}</span>
                    </div>
                  </div>
                )}

                {/* Collect Button */}
                <Button
                  className="h-11 w-full text-sm font-semibold"
                  onClick={collectNow}
                  disabled={saving || collectionItems.length === 0}
                >
                  {saving ? 'Collecting…' : `Collect ${money(paymentValue)}`}
                </Button>

                <p className="text-center text-[10px] text-muted-foreground">
                  Receipt is generated on successful collection.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* ── Tabs: History / Comment / Expected ────────── */}
          <Tabs defaultValue="history" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1.5 bg-transparent p-0">
              <TabsTrigger
                value="history"
                className="h-10 gap-1.5 rounded-lg border bg-background text-xs font-semibold data-[state=active]:border-primary/50 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm"
              >
                <ReceiptText className="size-3.5" />
                Payment History
              </TabsTrigger>
              <TabsTrigger
                value="comment"
                className="h-10 gap-1.5 rounded-lg border bg-background text-xs font-semibold data-[state=active]:border-primary/50 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm"
              >
                <MessageCircle className="size-3.5" />
                Special Comment
              </TabsTrigger>
              <TabsTrigger
                value="expected"
                className="h-10 gap-1.5 rounded-lg border bg-background text-xs font-semibold data-[state=active]:border-primary/50 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm"
              >
                <CalendarDays className="size-3.5" />
                Expected Payment
              </TabsTrigger>
            </TabsList>
            <TabsContent value="history" className="mt-2 rounded-lg border bg-card p-0 shadow-sm">
              {paymentHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <ReceiptText className="mb-2 size-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium">No payment history</p>
                  <p className="text-xs text-muted-foreground">Payments for {academicYear} will appear here.</p>
                </div>
              ) : (
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full min-w-[920px] border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-muted">
                      <tr>
                        <th className="w-10 px-2.5 py-2 text-left font-semibold">#</th>
                        <th className="px-2.5 py-2 text-left font-semibold">Receipt</th>
                        <th className="px-2.5 py-2 text-left font-semibold">Student</th>
                        <th className="px-2.5 py-2 text-left font-semibold">Class</th>
                        <th className="px-2.5 py-2 text-left font-semibold">Fee Month</th>
                        <th className="px-2.5 py-2 text-left font-semibold">Tr. Month</th>
                        <th className="px-2.5 py-2 text-left font-semibold">Hostel</th>
                        <th className="px-2.5 py-2 text-left font-semibold">Date</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Disc.</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Paid</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Dues</th>
                        <th className="px-2.5 py-2 text-center font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-y bg-primary/5">
                        <td colSpan={12} className="px-2.5 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-primary">
                          Session {academicYear}
                        </td>
                      </tr>
                      {paymentHistory.map((row, index) => (
                        <tr key={row.id} className="border-b transition-colors hover:bg-muted/40">
                          <td className="px-2.5 py-2 text-muted-foreground">{index + 1}</td>
                          <td className="px-2.5 py-2 font-mono text-[11px]">{row.receiptNumber || '-'}</td>
                          <td className="px-2.5 py-2">{row.studentName || studentName(selectedStudent)}</td>
                          <td className="px-2.5 py-2">{row.className || selectedStudent.class?.name || '-'}</td>
                          <td className="px-2.5 py-2">{row.feeMonth || '-'}</td>
                          <td className="px-2.5 py-2">{row.transportMonth || '-'}</td>
                          <td className="px-2.5 py-2">{row.hostelMonth || '-'}</td>
                          <td className="px-2.5 py-2 text-[11px]">{formatHistoryDateTime(row.date)}</td>
                          <td className="px-2.5 py-2 text-right tabular-nums">{row.discount > 0 ? receiptMoney(row.discount) : '-'}</td>
                          <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-emerald-700">{receiptMoney(row.paid)}</td>
                          <td className="px-2.5 py-2 text-right font-semibold tabular-nums text-red-700">{row.dues > 0 ? receiptMoney(row.dues) : '-'}</td>
                          <td className="px-2.5 py-2 text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-2 text-[11px]"
                              onClick={() => openHistoryReceipt(row)}
                            >
                              <Printer className="size-3" />
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
            <TabsContent value="comment" className="mt-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Remarks for cashier / accountant</Label>
              <Input
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder="e.g. Approved by Principal for partial waiver…"
                className="mt-1.5"
              />
            </TabsContent>
            <TabsContent value="expected" className="mt-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm">Expected selected payment</span>
                <span className="text-base font-bold tabular-nums text-primary">{money(payableTotal)}</span>
              </div>
            </TabsContent>
          </Tabs>
        </>
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="gap-2">
                      <Printer className="size-4" />
                      Print
                      <ChevronDown className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="text-xs">Print mode</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => printReceipt('both')} className="gap-2">
                      <Printer className="size-3.5" /> Office + Parent
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => printReceipt('office')} className="gap-2">
                      <Printer className="size-3.5" /> Office Copy
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => printReceipt('parent')} className="gap-2">
                      <Printer className="size-3.5" /> Parent Copy
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => printReceipt('single')} className="gap-2 text-muted-foreground">
                      <Printer className="size-3.5" /> Single (no label)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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

function ProfileItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate text-xs font-medium">{value || '-'}</div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  accent,
  bold,
}: {
  label: string
  value: string
  accent?: 'amber' | 'emerald'
  bold?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3',
        bold && 'border-t pt-1.5 font-semibold',
      )}
    >
      <span
        className={cn(
          'text-muted-foreground',
          accent === 'amber' && 'text-amber-700 dark:text-amber-300',
          accent === 'emerald' && 'text-emerald-700 dark:text-emerald-300',
          bold && 'text-foreground',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums',
          accent === 'amber' && 'text-amber-700 dark:text-amber-300',
          accent === 'emerald' && 'text-emerald-700 dark:text-emerald-300',
          bold && 'text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  )
}
