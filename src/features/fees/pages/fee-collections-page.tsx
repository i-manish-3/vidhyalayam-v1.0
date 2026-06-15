'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
  Bus,
  CalendarDays,
  ChevronDown,
  Home,
  MessageCircle,
  Printer,
  PlusCircle,
  ReceiptText,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  SLIP_MONTHS as MONTHS,
  PAYMENT_METHOD_LABELS,
  receiptMoney,
  receiptPlainAmount,
  formatReceiptDate,
  formatReceiptTime,
  normalizedPeriod,
  isMonthPeriod,
  periodSortIndex,
  sortPeriods,
  slipLineYearMonth,
  numberToWords,
  buildSlipLines,
  buildSlipHtml,
  type SlipInputLine,
  type SlipBucketedLine,
} from '@/lib/fee-slip-template'

type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID'
type PaymentMethod = 'CASH' | 'ONLINE' | 'CHEQUE' | 'UPI' | 'SPLIT'
type CollectionCategory = 'fees' | 'transport' | 'hostel' | 'inventory'

interface Student {
  id: string
  firstName: string
  lastName: string
  fullName?: string
  rollNumber?: string | null
  admissionNumber?: string | null
  profileImage?: string | null
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
  description?: string | null
  source?: 'fees' | 'transport' | 'hostel' | 'inventory'
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

interface HostelInfo {
  id: string
  hostelId: string
  hostelName: string
  hostelType?: string | null
  wardenName?: string | null
  wardenPhone?: string | null
  roomId: string
  roomNumber?: string | null
  roomType?: string | null
  floor?: string | null
  capacity?: number | null
  bedId: string
  bedNumber?: string | null
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
    paid: number          // paid in this transaction (incl. discount applied to this row)
    discount: number
    due: number           // remaining balance for this row AFTER this transaction
  }>
  totalPaid: number
  discountAmount?: number
  duesAmount: number      // running balance across the whole student
  paymentMethod: PaymentMethod
  splits?: ReceiptSplit[] | null
  collectedBy?: CollectedBy | null
  notes?: string | null
}

interface ReceiptHistoryLine {
  feeHeadName: string
  installmentName: string | null
  academicYear: string | null
  isTransport: boolean
  dueDate: string | null
  paidInReceipt: number
  balanceAfter: number
}

interface ReceiptSplit {
  paymentMethod: string
  amount: number
  transactionRef?: string | null
  remarks?: string | null
}

interface CollectedBy {
  id: string
  name: string
}

interface FeeSpecialComment {
  id: string
  comment: string
  createdAt: string
  createdBy?: CollectedBy | null
}

interface ReceiptHistoryRow {
  id: string
  receiptNumber: string
  studentName: string
  className: string
  feeMonth: string
  transportMonth: string
  hostelMonth: string
  date: string                // business payment date (may be back-dated to 00:00)
  submittedAt?: string | null // actual record-creation timestamp
  discount: number
  paid: number
  dues: number
  paymentMethod?: PaymentMethod | null
  notes?: string | null
  splits?: ReceiptSplit[] | null
  collectedBy?: CollectedBy | null
  session?: string | null
  receiptId?: string | null
  lines?: ReceiptHistoryLine[]
}

const SELECTABLE_PAYMENT_METHODS: Exclude<PaymentMethod, 'SPLIT'>[] = ['CASH', 'ONLINE', 'CHEQUE', 'UPI']

function money(value: number | string | null | undefined) {
  return `Rs ${Number(value || 0).toLocaleString()}`
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
  // Inventory dues have no month/term, so they carry no period label — this
  // keeps them showing as plain "Inventory Purchase" (no "(General)" suffix).
  if (isInventoryItem(item)) return ''
  return item.installment || item.installmentName || 'General'
}

function isTransportItem(item: FeeCollectionItem) {
  return item.source === 'transport' || (item.feeHeadName || '').toLowerCase().includes('transport')
}

function isHostelItem(item: FeeCollectionItem) {
  return item.source === 'hostel' || (item.feeHeadName || '').toLowerCase().includes('hostel')
}

function isInventoryItem(item: FeeCollectionItem) {
  const head = (item.feeHeadName || '').toLowerCase()
  return item.source === 'inventory' || head.includes('inventory purchase') || head.includes('store purchase')
}

function collectionCategory(item: FeeCollectionItem): CollectionCategory {
  if (isInventoryItem(item)) return 'inventory'
  if (isTransportItem(item)) return 'transport'
  if (isHostelItem(item)) return 'hostel'
  return 'fees'
}

function academicYearKey(value?: string | null) {
  return value || 'unassigned'
}

function matchesPeriod(item: FeeCollectionItem, period: string) {
  return normalizedPeriod(itemPeriod(item)) === normalizedPeriod(period)
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

// Local-time YYYY-MM-DD (NOT toISOString — that returns UTC, which is
// "yesterday" between 12 AM and 5:30 AM IST and breaks the date picker
// default for early-morning cashiers).
function todayLocalIso(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function itemIsCurrentCalendarMonth(item: FeeCollectionItem): boolean {
  const ym = itemCalendarYearMonth(item)
  if (!ym) return false
  const today = new Date()
  return ym.year === today.getFullYear() && ym.month === today.getMonth()
}

// Walks ticked items in engine allocation order (term → month → transport
// before tuition → dueDate tiebreaker) and produces one SlipInputLine per
// item. For backend processing, discount is distributed across items in
// allocation order. For display on the slip, each line shows its full amount
// and discount is shown separately in the totals section.
function buildSlipInputsFromItems(
  collectedItems: FeeCollectionItem[],
  paymentValue: number,
  discountValue: number,
): SlipInputLine[] {
  const sortedItems = [...collectedItems].sort((a, b) => {
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

  let remainingPay = Math.max(0, paymentValue)
  let remainingDisc = Math.max(0, discountValue)
  const slipInputs: SlipInputLine[] = []
  for (const item of sortedItems) {
    const due = remainingAmount(item)
    let paidForRow = 0
    let discountForRow = 0
    let remainingAfter = 0
    if (due > 0) {
      discountForRow = remainingDisc > 0 ? Math.min(remainingDisc, due) : 0
      const payableForRow = Math.max(0, due - discountForRow)
      const paymentForRow = Math.min(payableForRow, Math.max(0, remainingPay))
      remainingPay -= paymentForRow
      remainingDisc -= discountForRow
      // For the slip display: show full amount paid (payment + discount)
      // so each line appears fully settled. Discount is shown separately
      // in the totals section, not distributed per-line on the slip.
      paidForRow = paymentForRow + discountForRow
      remainingAfter = Math.max(0, due - discountForRow - paymentForRow)
    }
    slipInputs.push({
      feeHeadName: item.feeHeadName || 'Fee',
      installmentName: itemPeriod(item) || null,
      academicYear: academicYearKey(item.academicYear) || null,
      isTransport: isTransportItem(item),
      dueDate: item.dueDate || null,
      paid: paidForRow,
      discount: 0, // Don't show per-line discount on slip
      due: remainingAfter,
    })
  }
  return slipInputs
}

function periodSelectionKey(period: string, category: CollectionCategory = 'fees', itemAcademicYear?: string | null) {
  return `${category}:${academicYearKey(itemAcademicYear)}:${normalizedPeriod(period)}`
}

function sameStringSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const bSet = new Set(b)
  return a.every((item) => bSet.has(item))
}

function collectionSelectionKey(item: FeeCollectionItem) {
  // Inventory dues aren't periodic — each store purchase is its own line, so we
  // key it by the ledger entry id rather than a month/term bucket.
  if (collectionCategory(item) === 'inventory') {
    return `inventory:${item.ledgerEntryId || item.id}`
  }
  return periodSelectionKey(itemPeriod(item), collectionCategory(item), item.academicYear)
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

// Date-only comparison so a dueDate of "today" still counts as due, regardless
// of the time component stored on the row. Items with no dueDate are never
// considered due — the cashier must tick them explicitly.
function isDueOnOrBefore(item: FeeCollectionItem, asOfDateStart: Date) {
  if (!item.dueDate) return false
  const due = new Date(item.dueDate)
  if (Number.isNaN(due.getTime())) return false
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  return dueStart.getTime() <= asOfDateStart.getTime()
}

// Allocation order when a partial payment is split across selected items:
//   1. Non-monthly heads first (Admission, Exam, Term, Registration, …) — they
//      carry no month context, so they front-load before any month is touched.
//   2. Then walk monthly items month-by-month (Apr → May → … → Mar).
//   3. Within the same month, service fees are filled before monthly tuition:
//      transport, then hostel, then academic monthly heads.
//   4. Due date is the final tiebreaker.
function allocationSortKey(item: FeeCollectionItem): [number, number, number, string] {
  const period = itemPeriod(item)
  const monthIndex = periodSortIndex(period)
  const isMonthly = monthIndex !== Number.MAX_SAFE_INTEGER
  // Tier 0 = non-monthly head (admission / exam / etc.), Tier 1 = monthly bucket.
  const tier = isMonthly ? 1 : 0
  // Within a month: transport (0), hostel (1), then monthly tuition/other (2).
  const withinMonth = isTransportItem(item) ? 0 : isHostelItem(item) ? 1 : 2
  return [tier, monthIndex, withinMonth, item.dueDate || '']
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

// numberToWords now lives in @/lib/fee-slip-template


// numberToWords now lives in @/lib/fee-slip-template


// numberToWords now lives in @/lib/fee-slip-template


// numberToWords now lives in @/lib/fee-slip-template


interface FeeCollectionsListState {
  search?: string
}

const FEE_COLLECTIONS_LIST_STATE_KEY = 'fees:collections:list'

export function FeeCollectionsPage() {
  const { toast } = useToast()
  const currentSchool = useAppStore((state) => state.currentSchool)
  const currentUser = useAppStore((state) => state.user)
  const savedListState = useAppStore((state) => state.pageState[FEE_COLLECTIONS_LIST_STATE_KEY] as FeeCollectionsListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const currentSchoolAcademicYear = currentSchool?.academicYear
  const viewingAcademicYear = useAppStore((state) => state.viewingAcademicYear)
  const academicYear = viewingAcademicYear || currentSchoolAcademicYear || getCurrentAcademicYear()

  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [allStudentCollections, setAllStudentCollections] = useState<FeeCollectionItem[]>([])
  const [receiptHistory, setReceiptHistory] = useState<ReceiptHistoryRow[]>([])
  const [transportInfo, setTransportInfo] = useState<TransportInfo | null>(null)
  const [transportDetailsOpen, setTransportDetailsOpen] = useState(false)
  const [hostelInfo, setHostelInfo] = useState<HostelInfo | null>(null)
  const [hostelDetailsOpen, setHostelDetailsOpen] = useState(false)
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([])
  const [search, setSearch] = useState(savedListState?.search ?? '')
  const [paymentDate, setPaymentDate] = useState(() => todayLocalIso())
  const [discountAmount, setDiscountAmount] = useState('')
  const [remarks, setRemarks] = useState('')
  const [specialComments, setSpecialComments] = useState<FeeSpecialComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentSaving, setCommentSaving] = useState(false)
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplitRow[]>([
    { id: 'split-1', paymentMethod: 'CASH', amount: '', remarks: '' },
  ])
  // Tracks whether the user has manually edited the first split's amount. While
  // false, we keep the first split (Cash by default) auto-synced to the live
  // total payable, so the cashier can simply hit "Collect" for full payment.
  const [firstSplitEdited, setFirstSplitEdited] = useState(false)
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([])
  const [autoSelectedCollectionIds, setAutoSelectedCollectionIds] = useState<string[]>([])
  const [autoSelectedPeriods, setAutoSelectedPeriods] = useState<string[]>([])
  const [receiptSummary, setReceiptSummary] = useState<ReceiptSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const previewIframeRef = useRef<HTMLIFrameElement>(null)

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

  // Consume one-shot pre-select from the student detail page (Collect Fees
  // button). Reads ?preselect=<id> from the URL, fetches and selects the
  // student, then strips the param so refresh/back doesn't repeat the action.
  const router = useRouter()
  const searchParams = useSearchParams()
  const feesPreselectStudentId = searchParams.get('preselect')
  useEffect(() => {
    if (!feesPreselectStudentId) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.get<Student>(`/api/school/students/${feesPreselectStudentId}`)
        if (cancelled || !data) return
        handleSelectStudent(data)
      } catch {
        toast({
          title: "Couldn't load student",
          description: 'We could not load this student. Please search and select manually.',
          variant: 'destructive',
        })
      } finally {
        if (!cancelled) router.replace('/fees/collections')
      }
    })()
    return () => { cancelled = true }
  }, [feesPreselectStudentId])

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
        api.get<{ collections: FeeCollectionItem[]; receiptHistory?: ReceiptHistoryRow[]; transportInfo?: TransportInfo | null; hostelInfo?: HostelInfo | null }>(
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
      setHostelInfo(currentData.hostelInfo || null)

      // Auto-select rules (cashier can override):
      //   1. Previous-AY dues (any kind, any status except PAID).
      //   2. Current-AY monthly items up to & including the current calendar month.
      //   3. Current-AY non-monthly items (admission / exam / quarterly / term)
      //      whose dueDate has arrived (dueDate <= today, date-only).
      // Skipped: PAID items, future-dated items, items with no dueDate on
      // non-monthly heads.
      const today = new Date()
      const todayMonth = today.getMonth()
      const todayYear = today.getFullYear()
      const todayStart = new Date(todayYear, todayMonth, today.getDate())
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
        if (itemAy !== academicYear) continue
        const period = itemPeriod(item)
        const eligible = isMonthPeriod(period)
          ? monthIsCurrentOrPast(period, itemAy)
          : isDueOnOrBefore(item, todayStart)
        if (eligible) {
          autoIds.push(item.id)
          autoKeys.add(collectionSelectionKey(item))
        }
      }
      setSelectedCollectionIds(autoIds)
      setAutoSelectedCollectionIds(autoIds)
      const nextAutoPeriods = Array.from(autoKeys)
      setSelectedPeriods(nextAutoPeriods)
      setAutoSelectedPeriods(nextAutoPeriods)
      setDiscountAmount('')
      setRemarks('')
      setPaymentSplits([{ id: 'split-1', paymentMethod: 'CASH', amount: '', remarks: '' }])
      setFirstSplitEdited(false)
    } catch {
      setAllStudentCollections([])
      setReceiptHistory([])
      setTransportInfo(null)
      setHostelInfo(null)
      setSelectedCollectionIds([])
      setAutoSelectedCollectionIds([])
      setSelectedPeriods([])
      setAutoSelectedPeriods([])
      setRemarks('')
      setSpecialComments([])
      toast({
        title: "Couldn't Load Student Dues",
        description: 'This student fee assignment may not be generated yet.',
        variant: 'destructive',
      })
    }
  }, [academicYear, toast])

  const fetchSpecialComments = useCallback(async (studentId: string) => {
    setCommentsLoading(true)
    try {
      const data = await api.get<{ comments: FeeSpecialComment[] }>('/api/school/fees/special-comments', { studentId })
      setSpecialComments(data.comments || [])
    } catch {
      setSpecialComments([])
      toast({
        title: "Couldn't Load Comments",
        description: 'Special comments for this student could not be loaded.',
        variant: 'destructive',
      })
    } finally {
      setCommentsLoading(false)
    }
  }, [toast])

  const submitSpecialComment = async () => {
    if (!selectedStudent) {
      toast({ title: 'Missing Student', description: 'Please select a student first.', variant: 'destructive' })
      return
    }
    const comment = remarks.trim()
    if (!comment) {
      toast({ title: 'Missing Comment', description: 'Please enter a comment before submitting.', variant: 'destructive' })
      return
    }

    setCommentSaving(true)
    try {
      const data = await api.post<{ comment: FeeSpecialComment }>('/api/school/fees/special-comments', {
        studentId: selectedStudent.id,
        comment,
      })
      setSpecialComments((current) => [data.comment, ...current])
      setRemarks('')
      toast({ title: 'Comment Added', description: 'Special comment saved for this student.' })
    } catch (error) {
      toast({
        title: 'Comment Failed',
        description: error instanceof Error ? error.message : 'Could not save the special comment.',
        variant: 'destructive',
      })
    } finally {
      setCommentSaving(false)
    }
  }

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
    () => [...receiptHistory].sort((a, b) => new Date(b.submittedAt || b.date).getTime() - new Date(a.submittedAt || a.date).getTime()),
    [receiptHistory]
  )
  const academicItems = useMemo(
    () => studentCollections.filter((item) => collectionCategory(item) === 'fees'),
    [studentCollections]
  )
  const transportItems = useMemo(
    () => studentCollections.filter(isTransportItem),
    [studentCollections]
  )
  const hostelItems = useMemo(
    () => studentCollections.filter(isHostelItem),
    [studentCollections]
  )
  const inventoryItems = useMemo(
    () => studentCollections.filter(isInventoryItem),
    [studentCollections]
  )
  const allAcademicItems = useMemo(
    () => allStudentCollections.filter((item) => collectionCategory(item) === 'fees'),
    [allStudentCollections]
  )
  const allTransportItems = useMemo(
    () => allStudentCollections.filter(isTransportItem),
    [allStudentCollections]
  )
  const allHostelItems = useMemo(
    () => allStudentCollections.filter(isHostelItem),
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
  const currentHostelItems = useMemo(
    () => hostelItems.filter((item) => item.academicYear === academicYear),
    [academicYear, hostelItems]
  )
  const currentAllHostelItems = useMemo(
    () => allHostelItems.filter((item) => item.academicYear === academicYear),
    [academicYear, allHostelItems]
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
  // Previous-session dues are rolled up into ONE row per past academic year
  // instead of one checkbox per month/head. The cashier sees a single
  // "Previous Session Dues" line (with the carried-forward total) that ticks or
  // unticks every arrear for that session at once. Each entry carries the
  // underlying item ids + selection keys so the toggle stays in sync with both
  // selectedCollectionIds and selectedPeriods.
  const previousDueByYear = useMemo(() => {
    const map = new Map<string, { academicYear: string; amount: number; count: number; ids: string[]; keys: string[] }>()
    for (const item of previousDueItems) {
      const ay = typeof item.academicYear === 'string' ? item.academicYear : 'Past'
      const entry = map.get(ay) || { academicYear: ay, amount: 0, count: 0, ids: [], keys: [] }
      entry.amount += remainingAmount(item)
      entry.count += 1
      entry.ids.push(item.id)
      entry.keys.push(collectionSelectionKey(item))
      map.set(ay, entry)
    }
    return Array.from(map.values()).sort((a, b) => a.academicYear.localeCompare(b.academicYear))
  }, [previousDueItems])
  const selectedItems = useMemo(
    () => studentCollections.filter((item) => selectedCollectionIds.includes(item.id)),
    [selectedCollectionIds, studentCollections]
  )
  // collectionItems is exactly what the cashier has ticked. Past-month dues
  // are pre-ticked at load (see fetchStudentCollections auto-select), so any
  // remaining un-ticked past-month items are explicitly the cashier's
  // intent to skip — never silently rolled into the receipt.
  const collectionItems = selectedItems
  const visibleCollectionItems = visibleStudentCollections
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

  // Group selected items into time-aware rows for the Payment Summary:
  //   - Previous Month Dues  (current AY, monthly OR transport, before current calendar month) — amber
  //   - Current month        (current AY, monthly OR transport, current calendar month)
  //   - Future / Advance     (current AY, monthly OR transport, after current calendar month)
  //   - Term / one-off heads (current AY, non-monthly: Admission, Exam Q1, Annual…)
  //   - Previous Session Dues (any AY < current) — amber, pinned last
  // Transport rides the same time buckets so an April transport arrear shows
  // up under "Previous Month Dues" alongside April tuition. Each row is keyed
  // by (bucket, feeHeadName) so multiple months for the same head collapse
  // into one row with the months listed inline.
  const selectedSummaryGroups = useMemo(() => {
    type Bucket = 'prev_session' | 'prev_month' | 'overdue_term' | 'current_month' | 'future_month' | 'term'
    const bucketOrder: Record<Bucket, number> = {
      prev_session: 0,
      prev_month: 1,
      overdue_term: 2,
      current_month: 3,
      term: 4,
      future_month: 5,
    }
    const bucketLabel: Record<Bucket, string> = {
      prev_session: 'Previous Session Dues',
      prev_month: 'Previous Month Dues',
      overdue_term: 'Previous Dues',
      current_month: 'Current Month',
      future_month: 'Future / Advance',
      term: '',
    }
    const accentFor = (bucket: Bucket): 'amber' | 'emerald' | undefined => {
      if (bucket === 'prev_session' || bucket === 'prev_month' || bucket === 'overdue_term') return 'amber'
      // Current-month rows are all emerald. This bucket only ever holds monthly
      // tuition + transport items (term heads are classified into term/
      // overdue_term), so current-month tuition matches current-month transport
      // regardless of what the tuition fee head is actually named.
      if (bucket === 'current_month') return 'emerald'
      return undefined
    }
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const isTermStrictlyOverdue = (item: FeeCollectionItem): boolean => {
      if (!item.dueDate) return false
      const due = new Date(item.dueDate)
      if (Number.isNaN(due.getTime())) return false
      const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate())
      return dueStart.getTime() < todayStart.getTime()
    }
    const classify = (item: FeeCollectionItem): Bucket => {
      const itemAy = academicYearKey(item.academicYear)
      if (itemAy && itemAy < academicYear) return 'prev_session'
      // Non-monthly term heads (admission/exam/annual) get the same
      // overdue treatment as monthly arrears — if dueDate has strictly
      // passed (today's dueDate is still "current"), surface them under
      // "Previous Dues" with amber accent.
      if (!isMonthPeriod(itemPeriod(item)) && !isTransportItem(item)) {
        return isTermStrictlyOverdue(item) ? 'overdue_term' : 'term'
      }
      if (itemIsBeforeToday(item)) return 'prev_month'
      if (itemIsCurrentCalendarMonth(item)) return 'current_month'
      return 'future_month'
    }

    const groups = new Map<string, {
      key: string
      bucket: Bucket
      feeHeadName: string
      academicYear: string
      periods: string[]
      amount: number
      isTransport: boolean
      isHostel: boolean
    }>()
    for (const item of selectedItems) {
      const head = (item.feeHeadName || 'Fee').trim() || 'Fee'
      const itemAy = academicYearKey(item.academicYear)
      const bucket = classify(item)
      const transport = isTransportItem(item)
      const hostel = isHostelItem(item)
      // Term collapses per head; monthly/prev_session keep AY in the key so
      // a "Tuition 2024-2025" row never merges with the current AY.
      const key = `${bucket}|${head}|${transport ? 't' : hostel ? 'h' : 'f'}|${bucket === 'prev_session' ? itemAy : ''}`
      const period = itemPeriod(item)
      const group = groups.get(key) || {
        key,
        bucket,
        feeHeadName: head,
        academicYear: itemAy,
        periods: [],
        amount: 0,
        isTransport: transport,
        isHostel: hostel,
      }
      if (period && !group.periods.includes(period)) group.periods.push(period)
      group.amount += remainingAmount(item)
      groups.set(key, group)
    }

    return Array.from(groups.values())
      .map((group) => ({ ...group, periods: sortPeriods(group.periods) }))
      .sort((a, b) => {
        const bucketCompare = bucketOrder[a.bucket] - bucketOrder[b.bucket]
        if (bucketCompare !== 0) return bucketCompare
        if (a.bucket === 'prev_session' && a.academicYear !== b.academicYear) {
          return b.academicYear.localeCompare(a.academicYear)
        }
        // Within the same bucket, service fees before tuition (matches allocation
        // order so the cashier's eye scan matches the slip).
        const aServiceRank = a.isTransport ? 0 : a.isHostel ? 1 : 2
        const bServiceRank = b.isTransport ? 0 : b.isHostel ? 1 : 2
        if (aServiceRank !== bServiceRank) return aServiceRank - bServiceRank
        const aTuition = /tuition/i.test(a.feeHeadName)
        const bTuition = /tuition/i.test(b.feeHeadName)
        if (aTuition !== bTuition) return aTuition ? -1 : 1
        return a.feeHeadName.localeCompare(b.feeHeadName)
      })
      .map((group) => {
        const periodList = group.periods.length > 0 ? group.periods.join(', ') : ''
        const prefix = bucketLabel[group.bucket]

        // Only show "Previous Dues" labels for Transport, Hostel, and Tuition fees
        const isTuition = /tuition/i.test(group.feeHeadName)
        const shouldShowPreviousLabel = group.isTransport || group.isHostel || isTuition

        let label: string
        if (!prefix) {
          // No prefix for current_month and term buckets
          label = periodList ? `${group.feeHeadName} (${periodList})` : group.feeHeadName
        } else if (group.bucket === 'overdue_term') {
          // Never show "Previous Dues" prefix for term fees, even if overdue
          label = periodList ? `${group.feeHeadName} (${periodList})` : group.feeHeadName
        } else if (!shouldShowPreviousLabel && group.bucket === 'prev_month') {
          // For non-transport/non-tuition fees in prev_month, show without prefix
          label = periodList ? `${group.feeHeadName} (${periodList})` : group.feeHeadName
        } else {
          // Every past-session head (Admission, Annual, Exam Qn included) gets the
          // "Previous Session Dues — Head — Year" label so the slip and this
          // summary both name the session the carried-forward due belongs to.
          const headPart = group.feeHeadName
          const monthPart = periodList ? ` (${periodList})` : ''
          const yearPart =
            group.bucket === 'prev_session' && group.academicYear ? ` — ${group.academicYear}` : ''
          label = `${prefix} — ${headPart}${monthPart}${yearPart}`
        }
        return {
          key: group.key,
          label,
          amount: group.amount,
          periodCount: group.periods.length,
          accent: accentFor(group.bucket),
        }
      })
  }, [selectedItems, academicYear])

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

  // Store dues are individual ledger lines. Toggling one keeps the id-based and
  // key-based selection (used by the receipt/visible list) in sync.
  const toggleInventoryDue = (item: FeeCollectionItem) => {
    const key = collectionSelectionKey(item)
    const selected = selectedCollectionIds.includes(item.id)
    setSelectedCollectionIds((current) =>
      selected ? current.filter((id) => id !== item.id) : [...current, item.id]
    )
    setSelectedPeriods((current) =>
      selected ? current.filter((k) => k !== key) : Array.from(new Set([...current, key]))
    )
  }

  const togglePeriod = (
    period: string,
    category: CollectionCategory = 'fees',
    itemAcademicYear: string | null = academicYear,
  ) => {
    const source =
      category === 'transport'
        ? transportItems
        : category === 'hostel'
          ? hostelItems
          : academicItems
    const ids = source
      .filter((item) => matchesPeriod(item, period) && academicYearKey(item.academicYear) === academicYearKey(itemAcademicYear))
      .map((item) => item.id)
    const periodKey = periodSelectionKey(period, category, itemAcademicYear)
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

  // Tick/untick every arrear of a past session in one shot. Mirrors the
  // (selectedPeriods + selectedCollectionIds) bookkeeping that togglePeriod does
  // for a single period, but across all ids/keys carried by the year entry.
  const togglePreviousDueYear = (ids: string[], keys: string[], allSelected: boolean) => {
    setSelectedPeriods((current) =>
      allSelected
        ? current.filter((key) => !keys.includes(key))
        : Array.from(new Set([...current, ...keys]))
    )
    setSelectedCollectionIds((current) =>
      allSelected
        ? current.filter((id) => !ids.includes(id))
        : Array.from(new Set([...current, ...ids]))
    )
  }

  const selectAllDues = () => {
    setSelectedPeriods(Array.from(new Set(studentCollections.map(collectionSelectionKey))))
    setSelectedCollectionIds(studentCollections.map((item) => item.id))
  }

  const clearAllSelections = () => {
    setSelectedPeriods(autoSelectedPeriods)
    setSelectedCollectionIds(autoSelectedCollectionIds)
  }

  const hasSelectionChanges =
    !sameStringSet(selectedPeriods, autoSelectedPeriods) ||
    !sameStringSet(selectedCollectionIds, autoSelectedCollectionIds)

  const handleSelectStudent = (student: Student) => {
    setSelectedStudent(student)
    setTransportInfo(null)
    setTransportDetailsOpen(false)
    setHostelInfo(null)
    setHostelDetailsOpen(false)
    setSelectedCollectionIds([])
    setAutoSelectedCollectionIds([])
    setSelectedPeriods([])
    setAutoSelectedPeriods([])
    setRemarks('')
    setSpecialComments([])
    const nextSearch = studentName(student)
    setSearch(nextSearch)
    setPageState(FEE_COLLECTIONS_LIST_STATE_KEY, { search: nextSearch })
  }

  const createReceiptSummary = (
    receiptNumber: string,
    collectedItems: FeeCollectionItem[],
    paidTotal: number,
    remainingDue: number,
    method: PaymentMethod,
    paymentValue: number,
    discountValue: number,
    splits: ReceiptSplit[] | null,
    collectedBy: CollectedBy | null,
    notes: string | null,
  ) => {
    if (!selectedStudent) return null

    const slipInputs = buildSlipInputsFromItems(collectedItems, paymentValue, discountValue)
    const lines = buildSlipLines(slipInputs, academicYear, new Date())

    return {
      receiptNumber,
      receiptDate: new Date(),
      student: selectedStudent,
      feeMonths: sortPeriods(Array.from(new Set(collectedItems.map((item) => receiptPeriodLabel(item, academicYear))))),
      lines,
      totalPaid: paidTotal,
      discountAmount: discountValue,
      duesAmount: remainingDue,
      paymentMethod: method,
      splits,
      collectedBy,
      notes,
    }
  }

  const openHistoryReceipt = (row: ReceiptHistoryRow) => {
    if (!selectedStudent) return

    const receiptDate = row.date ? new Date(row.date) : new Date()
    // The API enriches each receipt row with a per-debit `lines[]` array.
    // Use it to build a slip in the same format as freshly-collected
    // receipts (bucketed by Current / Previous / Term / Future / Prev Session,
    // transport before tuition within a bucket). Fallback to the legacy
    // single-line summary if the server is older and didn't ship lines.
    const apiLines = row.lines || []
    let lines: SlipBucketedLine[]
    let feeMonths: string[]
    if (apiLines.length > 0) {
      const slipInputs: SlipInputLine[] = apiLines.map((line) => ({
        feeHeadName: line.feeHeadName,
        installmentName: line.installmentName,
        academicYear: line.academicYear,
        isTransport: line.isTransport,
        dueDate: line.dueDate || null,
        paid: line.paidInReceipt,
        discount: 0, // History lines don't track per-line discount
        due: line.balanceAfter,
      }))
      lines = buildSlipLines(slipInputs, academicYear, receiptDate)
      feeMonths = sortPeriods(
        Array.from(
          new Set(
            apiLines
              .map((line) => line.installmentName)
              .filter((p): p is string => !!p)
          )
        )
      )
    } else {
      const fallbackMonths = [
        row.feeMonth,
        row.transportMonth ? `Transport: ${row.transportMonth}` : '',
        row.hostelMonth ? `Hostel: ${row.hostelMonth}` : '',
      ].filter(Boolean)
      lines = [
        {
          label: 'Fee Payment',
          months: fallbackMonths.length > 0 ? fallbackMonths : ['-'],
          paid: row.paid,
          discount: row.discount || 0,
          due: 0,
        },
      ]
      feeMonths = fallbackMonths.length > 0 ? fallbackMonths : ['-']
    }

    setReceiptSummary({
      receiptNumber: row.receiptId || row.receiptNumber || 'Receipt',
      receiptDate,
      student: selectedStudent,
      feeMonths: feeMonths.length > 0 ? feeMonths : ['-'],
      lines,
      totalPaid: row.paid,
      discountAmount: row.discount || 0,
      duesAmount: row.dues,
      paymentMethod: row.paymentMethod || 'CASH',
      splits: row.splits ?? null,
      collectedBy: row.collectedBy ?? null,
      notes: row.notes || null,
    })
  }

  const buildReceiptHtml = (mode: 'single' | 'office' | 'parent' | 'both' = 'single'): string | null => {
    if (!receiptSummary) return null
    return buildSlipHtml({
      variant: 'receipt',
      mode,
      school: currentSchool,
      student: receiptSummary.student,
      fatherName: father?.fatherName || null,
      phone: contact || null,
      academicYear,
      feeMonths: receiptSummary.feeMonths,
      slipNumber: receiptSummary.receiptNumber,
      slipDate: receiptSummary.receiptDate,
      lines: receiptSummary.lines,
      paymentMethod: receiptSummary.paymentMethod,
      splits: receiptSummary.splits ?? null,
      collectedByName: receiptSummary.collectedBy?.name ?? null,
      totalPaid: receiptSummary.totalPaid,
      discountAmount: receiptSummary.discountAmount,
      duesAmount: receiptSummary.duesAmount,
      notes: receiptSummary.notes,
    })
  }

  const printReceipt = (mode: 'single' | 'office' | 'parent' | 'both' = 'single') => {
    const html = buildReceiptHtml(mode)
    if (!html) return
    const printWindow = window.open('', '_blank', 'width=900,height=1100')
    if (!printWindow) {
      window.print()
      return
    }
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.onafterprint = () => printWindow.close()

    const triggerPrint = () => {
      try {
        printWindow.focus()
        printWindow.print()
      } catch {
        /* noop */
      }
    }
    if (printWindow.document.readyState === 'complete') {
      window.setTimeout(triggerPrint, 50)
    } else {
      printWindow.onload = () => window.setTimeout(triggerPrint, 50)
    }
  }

  useEffect(() => {
    if (selectedStudent) {
      fetchStudentCollections(selectedStudent.id)
      fetchSpecialComments(selectedStudent.id)
    }
  }, [academicYear, fetchSpecialComments, fetchStudentCollections, selectedStudent])

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
      { id: `split-${Date.now()}`, paymentMethod: 'UPI', amount: '', remarks: '' },
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
      const appliedPaymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0)

      const selectedPaymentMethod: PaymentMethod = activePaymentSplits.length > 1
        ? 'SPLIT'
        : activePaymentSplits[0]?.paymentMethod || paymentSplits[0]?.paymentMethod || 'CASH'

      // Snapshot the slip as the cashier sees it now. We compute this once
      // and use it for both the POST body (so the server can reproduce the
      // exact slip later) and the live receipt below. Captures ticked items
      // that received zero allocation — those would otherwise be lost when
      // the history is reconstructed from ledger allocations alone, causing
      // the slip Dues and history Dues to drift apart.
      const slipInputsSnapshot = buildSlipInputsFromItems(collectionItems, paymentValue, discount)

      const collectionResponse = await api.post<{ receiptNumber?: string; appliedAmount?: number }>('/api/school/fees/collections', {
        studentId: selectedStudent.id,
        payments,
        paymentMethod: selectedPaymentMethod,
        paymentDate,
        notes: null,
        // Structured split breakdown for audit. Server stores it as a JSON
        // tail on the ledger entry's `notes` field; the legacy free-text
        // summary above keeps the human-readable form. Both are persisted.
        splits: activePaymentSplits.map((split) => ({
          paymentMethod: split.paymentMethod,
          amount: Number(split.amount || 0),
          remarks: split.remarks || null,
        })),
        // Persist the slip snapshot so the history view can replay it
        // verbatim — including untouched ticked items that the ledger
        // doesn't know about.
        slipLines: slipInputsSnapshot,
      })

      const liveSplits: ReceiptSplit[] = activePaymentSplits.map((split) => ({
        paymentMethod: split.paymentMethod,
        amount: Number(split.amount || 0),
        remarks: split.remarks || null,
      }))
      const liveCollectedBy: CollectedBy | null = currentUser
        ? { id: currentUser.id, name: currentUser.name || currentUser.email || 'Unknown' }
        : null
      const receipt = createReceiptSummary(
        collectionResponse.receiptNumber || 'Pending',
        collectionItems,
        collectionResponse.appliedAmount ?? appliedPaymentTotal,
        balanceDue,
        selectedPaymentMethod,
        paymentValue,
        discount,
        liveSplits.length > 0 ? liveSplits : null,
        liveCollectedBy,
        null,
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
        <div className="flex items-stretch gap-3">
          <span aria-hidden className="bg-brand mt-0.5 w-1 shrink-0 self-stretch rounded-full" />
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
                  setPageState(FEE_COLLECTIONS_LIST_STATE_KEY, { search: event.target.value })
                  setSelectedStudent(null)
                  setAllStudentCollections([])
                  setReceiptHistory([])
                  setTransportInfo(null)
                  setTransportDetailsOpen(false)
                  setHostelInfo(null)
                  setHostelDetailsOpen(false)
                  setSelectedCollectionIds([])
                  setAutoSelectedCollectionIds([])
                  setSelectedPeriods([])
                  setAutoSelectedPeriods([])
                  setRemarks('')
                  setSpecialComments([])
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
                            {(student.profileImage || student.admission?.profileImage) ? (
                              <img src={(student.profileImage || student.admission?.profileImage) as string} alt={studentName(student)} className="h-full w-full object-cover" />
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
              align="end"
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
                  {(selectedStudent.profileImage || selectedStudent.admission?.profileImage) ? (
                    <img src={(selectedStudent.profileImage || selectedStudent.admission?.profileImage) as string} alt={studentName(selectedStudent)} className="h-full w-full object-cover" />
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
                        Select All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={clearAllSelections}
                        disabled={!hasSelectionChanges}
                      >
                        Clear
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 px-3 py-2.5">
                  {previousDueByYear.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50/60 p-2.5 dark:border-red-500/30 dark:bg-red-500/10">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-red-900 dark:text-red-300">
                        <span className="size-2 rounded-full bg-red-500" />
                        Previous Session Dues
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {previousDueByYear.map((entry) => {
                          const checked = entry.keys.length > 0 && entry.keys.every((key) => selectedPeriods.includes(key))
                          return (
                            <label
                              key={entry.academicYear}
                              className={cn(
                                'flex cursor-pointer items-center gap-2 rounded-md border bg-white px-2 py-2 text-xs transition-colors hover:border-red-400 dark:bg-background',
                                checked && 'border-red-400 bg-red-50 dark:bg-red-500/20'
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => togglePreviousDueYear(entry.ids, entry.keys, checked)}
                              />
                              <span className="truncate">
                                {entry.academicYear} · Previous Session Dues
                                <span className="ml-1 text-[10px] font-normal text-red-700/70 dark:text-red-400/70">
                                  ({entry.count} {entry.count === 1 ? 'item' : 'items'})
                                </span>
                              </span>
                              <span className="ml-auto font-semibold tabular-nums text-red-700 dark:text-red-400">{money(entry.amount)}</span>
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
                          const checked = selectedPeriods.includes(periodSelectionKey(option.period, 'fees', option.academicYear))
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
                                onCheckedChange={() => togglePeriod(option.period, 'fees', option.academicYear || null)}
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

                  {inventoryItems.length > 0 && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <ShoppingBag className="size-3.5 text-primary" />
                        Store Dues
                        <span className="text-[10px] font-normal text-muted-foreground">
                          · items taken on due
                        </span>
                      </div>
                      <div className="grid gap-1.5">
                        {inventoryItems.map((item) => {
                          const checked = selectedCollectionIds.includes(item.id)
                          const detail = (item.description || item.feeHeadName || 'Inventory Purchase').replace(/^(Inventory|Store) Purchase\s*/i, '')
                          return (
                            <label
                              key={item.ledgerEntryId || item.id}
                              className={cn(
                                'flex cursor-pointer items-center gap-2 rounded-md border bg-card px-2 py-2 text-xs transition-all hover:border-primary/40 hover:bg-primary/5',
                                checked && 'border-primary bg-primary/10 ring-1 ring-primary/20'
                              )}
                            >
                              <Checkbox checked={checked} onCheckedChange={() => toggleInventoryDue(item)} />
                              <span className="min-w-0 flex-1 truncate" title={detail}>
                                <span className="font-medium">Inventory Purchase</span>
                                {detail && <span className="ml-1 text-muted-foreground">{detail}</span>}
                              </span>
                              <span className="ml-auto shrink-0 font-semibold tabular-nums">{money(remainingAmount(item))}</span>
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
                        const checked = selectedPeriods.includes(periodSelectionKey(month, 'fees', academicYear))
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
                                onCheckedChange={() => togglePeriod(month, 'fees', academicYear)}
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

              {/* Hostel */}
              {currentAllHostelItems.length > 0 && (
                <Card className="!gap-0 overflow-hidden !py-0 shadow-sm">
                  <CardHeader className="border-b bg-muted/30 px-3 !py-2">
                    <CardTitle className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2">
                        <Home className="size-4 text-primary" />
                        Hostel
                      </span>
                      <div className="flex items-center gap-1.5">
                        {(hostelInfo?.fareAmount || currentAllHostelItems[0]?.amount) && (
                          <Badge variant="secondary" className="bg-primary/10 text-[10px] text-primary hover:bg-primary/10">
                            Monthly - {money(hostelInfo?.fareAmount || currentAllHostelItems[0]?.amount || 0)}
                          </Badge>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                          aria-expanded={hostelDetailsOpen}
                          onClick={() => setHostelDetailsOpen((open) => !open)}
                        >
                          Details
                          <ChevronDown className={cn('size-3 transition-transform', hostelDetailsOpen && 'rotate-180')} />
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5 px-3 py-2.5">
                    {hostelDetailsOpen && (
                      <div className="grid gap-2 rounded-md border bg-muted/30 p-2.5 text-xs sm:grid-cols-2">
                        <div>
                          <span className="text-muted-foreground">Hostel:</span>
                          <span className="ml-1 font-medium">
                            {hostelInfo?.hostelName || 'Assigned Hostel'}
                            {hostelInfo?.hostelType ? ` (${hostelInfo.hostelType})` : ''}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Room:</span>
                          <span className="ml-1 font-medium">
                            {hostelInfo?.roomNumber || '-'}
                            {hostelInfo?.roomType ? ` - ${hostelInfo.roomType}` : ''}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Bed:</span>
                          <span className="ml-1 font-medium">{hostelInfo?.bedNumber || '-'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Session:</span>
                          <span className="ml-1 font-medium">{hostelInfo?.academicYear || academicYear}</span>
                        </div>
                        {hostelInfo?.floor && (
                          <div>
                            <span className="text-muted-foreground">Floor:</span>
                            <span className="ml-1 font-medium">{hostelInfo.floor}</span>
                          </div>
                        )}
                        {hostelInfo?.capacity != null && (
                          <div>
                            <span className="text-muted-foreground">Room Capacity:</span>
                            <span className="ml-1 font-medium">{hostelInfo.capacity}</span>
                          </div>
                        )}
                        {hostelInfo?.wardenName && (
                          <div>
                            <span className="text-muted-foreground">Warden:</span>
                            <span className="ml-1 font-medium">{hostelInfo.wardenName}</span>
                          </div>
                        )}
                        {hostelInfo?.wardenPhone && (
                          <div>
                            <span className="text-muted-foreground">Warden Phone:</span>
                            <span className="ml-1 font-medium">{hostelInfo.wardenPhone}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                      {MONTHS.map((month) => {
                        const monthItems = currentHostelItems.filter((item) => matchesPeriod(item, month))
                        const allMonthItems = currentAllHostelItems.filter((item) => matchesPeriod(item, month))
                        const monthState = periodPaymentState(allMonthItems)
                        const monthKey = periodSelectionKey(month, 'hostel', academicYear)
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
                              'flex cursor-pointer flex-col gap-0.5 rounded-md border bg-card px-2 py-1.5 text-xs transition-all hover:border-primary/40 hover:bg-primary/5',
                              checked && 'border-primary bg-primary/10 ring-1 ring-primary/20',
                              isOverdue && !checked && 'border-red-300 bg-red-50/70 text-red-900 hover:border-red-400 hover:bg-red-50 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200',
                              isCurrentCal && !checked && !isOverdue && 'border-primary/40 bg-primary/5',
                              isSettled && 'cursor-default border-emerald-300 bg-emerald-100 text-emerald-900 hover:border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200',
                              !hasFee && 'cursor-default bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted/40'
                            )}
                          >
                            <div className="flex w-full items-center gap-1.5">
                              <Checkbox
                                checked={checked || isSettled}
                                disabled={!hasFee || isSettled}
                                onCheckedChange={() => togglePeriod(month, 'hostel', academicYear)}
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
                                  title={isOverdue ? `Overdue - ${periodStateLabel(monthState)}` : periodStateLabel(monthState)}
                                />
                              )}
                            </div>
                            <div className={cn(
                              'text-[10px] tabular-nums',
                              isOverdue ? 'font-semibold text-red-700 dark:text-red-300' : 'text-muted-foreground'
                            )}>
                              {!hasFee ? 'No fee' : isSettled ? 'Paid' : isOverdue ? `Due - ${money(monthAmount)}` : money(monthAmount)}
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Transport */}
              {currentAllTransportItems.length > 0 && (
                <Card className="!gap-0 overflow-hidden !py-0 shadow-sm">
                  <CardHeader className="border-b bg-muted/30 px-3 !py-2">
                    <CardTitle className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2">
                        <Bus className="size-4 text-primary" />
                        Transport
                      </span>
                      <div className="flex items-center gap-1.5">
                        {(transportInfo?.fareAmount || currentAllTransportItems[0]?.amount) && (
                          <Badge variant="secondary" className="bg-primary/10 text-[10px] text-primary hover:bg-primary/10">
                            Monthly · {money(transportInfo?.fareAmount || currentAllTransportItems[0]?.amount || 0)}
                          </Badge>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                          aria-expanded={transportDetailsOpen}
                          onClick={() => setTransportDetailsOpen((open) => !open)}
                        >
                          Details
                          <ChevronDown className={cn('size-3 transition-transform', transportDetailsOpen && 'rotate-180')} />
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5 px-3 py-2.5">
                    {transportDetailsOpen && (
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
                    )}
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                      {MONTHS.map((month) => {
                        const monthItems = currentTransportItems.filter((item) => matchesPeriod(item, month))
                        const allMonthItems = currentAllTransportItems.filter((item) => matchesPeriod(item, month))
                        const monthState = periodPaymentState(allMonthItems)
                        const monthKey = periodSelectionKey(month, 'transport', academicYear)
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
                              'flex cursor-pointer flex-col gap-0.5 rounded-md border bg-card px-2 py-1.5 text-xs transition-all hover:border-primary/40 hover:bg-primary/5',
                              checked && 'border-primary bg-primary/10 ring-1 ring-primary/20',
                              isOverdue && !checked && 'border-red-300 bg-red-50/70 text-red-900 hover:border-red-400 hover:bg-red-50 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200',
                              isCurrentCal && !checked && !isOverdue && 'border-primary/40 bg-primary/5',
                              isSettled && 'cursor-default border-emerald-300 bg-emerald-100 text-emerald-900 hover:border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200',
                              !hasFee && 'cursor-default bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted/40'
                            )}
                          >
                            <div className="flex w-full items-center gap-1.5">
                              <Checkbox
                                checked={checked || isSettled}
                                disabled={!hasFee || isSettled}
                                onCheckedChange={() => togglePeriod(month, 'transport', academicYear)}
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
                <CardContent className="space-y-1.5 px-3 py-2">
                  {studentCollections.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                      No pending fee rows found. Assign fees during admission or manual assignment first.
                    </div>
                  ) : visibleCollectionItems.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                      Tick a month or term above to show its fee heads here.
                    </div>
                  ) : (
                    <div className="grid gap-0.5 md:grid-cols-2">
                      {visibleCollectionItems.map((item) => {
                        const checked = selectedCollectionIds.includes(item.id)
                        const preview = checked ? allocationPreview.get(item.id) : undefined
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
                              'grid min-h-[52px] grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 transition-colors hover:border-primary/40 hover:bg-primary/5',
                              checked && 'border-primary bg-primary/10 ring-1 ring-primary/20',
                              isFullyPaid && 'border-primary bg-primary/10 dark:bg-primary/10',
                              isPartiallyPaid && 'border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10',
                            )}
                          >
                            <Checkbox checked={checked} onCheckedChange={() => toggleCollection(item.id)} />
                            <div className="min-w-0">
                              <div className="truncate text-[11px] font-semibold leading-tight">{item.feeHeadName || 'Fee'}</div>
                              <div className="mt-px flex flex-nowrap items-center gap-0.5 overflow-hidden">
                                <Badge variant="secondary" className="h-3 px-1 text-[8px] leading-none">{itemPeriod(item)}</Badge>
                                {item.academicYear && item.academicYear !== academicYear && (
                                  <Badge className="h-3 bg-amber-100 px-1 text-[8px] leading-none text-amber-900 hover:bg-amber-100">Past · {item.academicYear}</Badge>
                                )}
                                {isFullyPaid && (
                                  <Badge className="h-3 bg-primary/15 px-1 text-[8px] leading-none text-primary hover:bg-primary/15">Will Be Paid</Badge>
                                )}
                                {isPartiallyPaid && (
                                  <Badge className="h-3 bg-amber-100 px-1 text-[8px] leading-none text-amber-900 hover:bg-amber-100">Partial</Badge>
                                )}
                                {isUnpaid && (
                                  <Badge variant="outline" className="h-3 px-1 text-[8px] leading-none text-muted-foreground">Unpaid</Badge>
                                )}
                                {!hasPaymentInput && (
                                  <span className="text-[8px] leading-none text-muted-foreground">{statusLabel(item.status)}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex min-w-[72px] flex-col items-end text-right">
                              <div className={cn(
                                'text-[11px] font-bold leading-tight tabular-nums',
                                isFullyPaid && 'text-primary',
                                isPartiallyPaid && 'text-amber-700 dark:text-amber-300',
                              )}>
                                {money(due)}
                              </div>
                              {preview && hasPaymentInput && (paying > 0 || previewDiscount > 0) && (
                                <div className="text-[8px] leading-tight tabular-nums text-primary">
                                  Paying {money(paying + previewDiscount)}
                                  {previewDiscount > 0 && ` (incl. ${money(previewDiscount)} disc.)`}
                                </div>
                              )}
                              {preview && hasPaymentInput && remainingAfter > 0 && (
                                <div className="text-[8px] leading-tight tabular-nums text-red-600 dark:text-red-400">
                                  {money(remainingAfter)} due
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
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
                {/* Breakdown — one row per (fee head, time bucket). Past
                    months auto-tick on load (see fetchStudentCollections).
                    Sub Total = sum of ticked items only; nothing is silently
                    rolled in. */}
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-2.5 py-2 text-left font-semibold">Description</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Rate</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="bg-background">
                      {selectedSummaryGroups.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-2.5 py-4 text-center text-muted-foreground">
                            No items selected
                          </td>
                        </tr>
                      ) : (
                        <>
                          {selectedSummaryGroups.map((group) => {
                            const periodCount = group.periodCount || 0
                            const rate = periodCount > 0 ? group.amount / periodCount : group.amount
                            const rateRounded = Math.round((rate + Number.EPSILON) * 100) / 100
                            const rateBreakdown =
                              periodCount > 1 ? `${money(rateRounded)} × ${periodCount}` : ''
                            return (
                              <tr key={group.key} className="border-t">
                                <td
                                  className={cn(
                                    'px-2.5 py-2',
                                    group.accent === 'amber' && 'text-amber-700 dark:text-amber-300',
                                    group.accent === 'emerald' && 'text-emerald-700 dark:text-emerald-300',
                                  )}
                                >
                                  {group.label}
                                </td>
                                <td
                                  className={cn(
                                    'px-2.5 py-2 text-right tabular-nums text-[11px] text-muted-foreground',
                                    group.accent === 'amber' && 'text-amber-600 dark:text-amber-400',
                                    group.accent === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
                                  )}
                                >
                                  {rateBreakdown}
                                </td>
                                <td
                                  className={cn(
                                    'px-2.5 py-2 text-right tabular-nums',
                                    group.accent === 'amber' && 'text-amber-700 dark:text-amber-300',
                                    group.accent === 'emerald' && 'text-emerald-700 dark:text-emerald-300',
                                  )}
                                >
                                  {money(group.amount)}
                                </td>
                              </tr>
                            )
                          })}
                          <tr className="border-t bg-muted/30 font-semibold">
                            <td className="px-2.5 py-2">Sub Total</td>
                            <td className="px-2.5 py-2"></td>
                            <td className="px-2.5 py-2 text-right tabular-nums">{money(selectedTotal)}</td>
                          </tr>
                          {discount > 0 && (
                            <tr className="border-t">
                              <td className="px-2.5 py-2 text-emerald-700 dark:text-emerald-300">Discount</td>
                              <td className="px-2.5 py-2"></td>
                              <td className="px-2.5 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                                - {money(discount)}
                              </td>
                            </tr>
                          )}
                        </>
                      )}
                    </tbody>
                  </table>
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

          {/* ── Tabs: History / Comment ────────── */}
          <Tabs defaultValue="history" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 bg-transparent p-0">
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
                  <table className="w-full min-w-[1180px] border-collapse text-xs">
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
                        <th className="px-2.5 py-2 text-left font-semibold">Payment Mode</th>
                        <th className="px-2.5 py-2 text-left font-semibold">Collected By</th>
                        <th className="px-2.5 py-2 text-left font-semibold">Comment</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Disc.</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Paid</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Dues</th>
                        <th className="px-2.5 py-2 text-center font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-y bg-primary/5">
                        <td colSpan={15} className="px-2.5 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-primary">
                          Session {academicYear}
                        </td>
                      </tr>
                      {paymentHistory.map((row, index) => (
                        <tr key={row.id} className="border-b transition-colors hover:bg-muted/40 align-top">
                          <td className="px-2.5 py-2 text-muted-foreground">{index + 1}</td>
                          <td className="px-2.5 py-2 font-mono text-[11px]">{row.receiptNumber || '-'}</td>
                          <td className="px-2.5 py-2">{row.studentName || studentName(selectedStudent)}</td>
                          <td className="px-2.5 py-2">{row.className || selectedStudent.class?.name || '-'}</td>
                          <td className="px-2.5 py-2">{row.feeMonth || '-'}</td>
                          <td className="px-2.5 py-2">{row.transportMonth || '-'}</td>
                          <td className="px-2.5 py-2">{row.hostelMonth || '-'}</td>
                          <td className="px-2.5 py-2 text-[11px]">{formatHistoryDateTime(row.submittedAt || row.date)}</td>
                          <td className="px-2.5 py-2 text-[11px]">
                            {row.splits && row.splits.length > 0 ? (
                              <div className="space-y-0.5">
                                {row.splits.map((split, splitIdx) => (
                                  <div
                                    key={`${row.id}-split-${splitIdx}`}
                                    className="flex items-center justify-between gap-2 rounded-sm bg-muted/60 px-1.5 py-0.5"
                                  >
                                    <span className="font-medium">{PAYMENT_METHOD_LABELS[split.paymentMethod as PaymentMethod] || split.paymentMethod}</span>
                                    <span className="tabular-nums">{receiptMoney(split.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : row.paymentMethod ? (
                              <span>{PAYMENT_METHOD_LABELS[row.paymentMethod] || row.paymentMethod}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-2.5 py-2 text-[11px]">
                            {row.collectedBy?.name || <span className="text-muted-foreground">-</span>}
                          </td>
                          <td className="max-w-[180px] px-2.5 py-2 text-[11px]">
                            {row.notes ? (
                              <span className="block truncate" title={row.notes}>{row.notes}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
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
              <div className="space-y-2">
                <div>
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add Special Comment</Label>
                  <Textarea
                    value={remarks}
                    onChange={(event) => setRemarks(event.target.value)}
                    placeholder="e.g. Parent promised to clear remaining balance next week."
                    className="mt-1.5 min-h-20 resize-y text-sm"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={submitSpecialComment}
                      disabled={commentSaving || !remarks.trim()}
                    >
                      {commentSaving ? 'Submitting...' : 'Submit Comment'}
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border">
                  <div className="border-b bg-muted/40 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Student Fee Comments
                  </div>
                  {commentsLoading ? (
                    <div className="px-2.5 py-4 text-center text-xs text-muted-foreground">Loading comments...</div>
                  ) : specialComments.length === 0 ? (
                    <div className="px-2.5 py-4 text-center text-xs text-muted-foreground">No special comments yet.</div>
                  ) : (
                    <div className="max-h-56 divide-y overflow-auto">
                      {specialComments.map((comment) => (
                        <div key={comment.id} className="px-2.5 py-2">
                          <p className="whitespace-pre-wrap text-xs leading-relaxed">{comment.comment}</p>
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {formatHistoryDateTime(comment.createdAt)}
                            {comment.createdBy?.name ? ` · ${comment.createdBy.name}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={!!receiptSummary} onOpenChange={(open) => { if (!open) setReceiptSummary(null) }}>
        <DialogContent className="flex max-h-[92vh] max-w-[1024px] flex-col overflow-hidden sm:max-w-[1024px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="size-5" />
              Fee Receipt
            </DialogTitle>
          </DialogHeader>
          {receiptSummary && (
            <div className="flex flex-1 flex-col gap-4 overflow-hidden">
              <div className="flex-1 overflow-y-auto rounded border bg-muted/30">
                <iframe
                  ref={previewIframeRef}
                  srcDoc={buildReceiptHtml('single') || ''}
                  onLoad={() => {
                    const iframe = previewIframeRef.current
                    if (!iframe?.contentDocument) return
                    const h = iframe.contentDocument.documentElement.scrollHeight
                    iframe.style.height = `${h + 4}px`
                  }}
                  className="block w-full bg-white"
                  style={{ border: 'none', minHeight: 600 }}
                  title="Fee receipt preview"
                />
              </div>

              <div className="flex shrink-0 justify-end gap-2">
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
  rateBreakdown,
  accent,
  bold,
}: {
  label: string
  value: string
  rateBreakdown?: string | null
  accent?: 'amber' | 'emerald'
  bold?: boolean
}) {
  return (
    <div
      className={cn(
        'grid items-center gap-2',
        rateBreakdown ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-[1fr_auto]',
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
      {rateBreakdown && (
        <span
          className={cn(
            'text-[11px] tabular-nums text-muted-foreground',
            accent === 'amber' && 'text-amber-600 dark:text-amber-400',
            accent === 'emerald' && 'text-emerald-600 dark:text-emerald-400',
          )}
        >
          {rateBreakdown}
        </span>
      )}
      <span
        className={cn(
          'tabular-nums text-right',
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
