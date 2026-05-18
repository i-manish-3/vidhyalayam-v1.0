'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, DataTable, type Column, type ActionItem, StatsCard, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  IndianRupee,
  CreditCard,
  TrendingUp,
  PlusCircle,
  Wallet,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID'
type PaymentMethod = 'CASH' | 'ONLINE' | 'CHEQUE' | 'UPI'

interface Student {
  id: string
  firstName: string
  lastName: string
  rollNumber: string
}

interface FeeCollectionItem {
  id: string
  studentId: string
  student?: Student
  feeHeadName?: string
  feeHeadId?: string
  installment?: string
  amount: number
  paidAmount: number
  status: PaymentStatus
  paymentDate?: string
  dueDate?: string
  lateFee?: number
  paymentMethod?: PaymentMethod
  discount?: number
  concession?: number
  scholarship?: number
}

interface DashboardStats {
  totalCollected: number
  totalPending: number
  collectionRate: number
  totalStudents?: number
}

interface StructureItem {
  id: string
  feeHeadId: string
  feeHeadName?: string
  period: string
  amount: number
  dueDate?: string
  lateFee?: number
}

interface FeeStructure {
  id: string
  name: string
  items: StructureItem[]
}

// ── Helpers ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<PaymentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PAID: { label: 'Paid', variant: 'default' },
  PARTIAL: { label: 'Partial', variant: 'secondary' },
  UNPAID: { label: 'Unpaid', variant: 'destructive' },
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  ONLINE: 'Online',
  CHEQUE: 'Cheque',
  UPI: 'UPI',
}

// ── Component ──────────────────────────────────────────────────────────

export function FeeCollectionsPage() {
  const { toast } = useToast()

  // Data
  const [collections, setCollections] = useState<FeeCollectionItem[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL')

  // Dialog state
  const [showRecord, setShowRecord] = useState(false)
  const [saving, setSaving] = useState(false)
  const [students, setStudents] = useState<Student[]>([])
  const [structureItems, setStructureItems] = useState<StructureItem[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentMethod: 'CASH' as PaymentMethod,
    discount: '',
    concession: '',
    scholarship: '',
  })

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [collectionsRes, dashboardRes] = await Promise.all([
        api.get<{ collections: FeeCollectionItem[] }>('/api/school/fees/collections'),
        api.get<DashboardStats>('/api/school/fees/dashboard').catch(() => null),
      ])
      setCollections(collectionsRes.collections || [])
      if (dashboardRes) {
        setStats(dashboardRes)
      }
    } catch {
      toast({ title: 'Couldn\'t Load Fee Collections', description: 'We couldn\'t load the fee collections. Please refresh the page.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Fetch students for dialog
  const fetchStudents = useCallback(async () => {
    try {
      const data = await api.get<{ students: Student[] }>('/api/school/students')
      setStudents(data.students || [])
    } catch {
      /* ignore */
    }
  }, [])

  // Fetch structure items for selected student
  const fetchStructureItems = useCallback(async (studentId: string) => {
    try {
      const data = await api.get<{ structures: FeeStructure[] }>('/api/school/fees/structures')
      const allItems: StructureItem[] = []
      ;(data.structures || []).forEach((s) => {
        ;(s.items || []).forEach((item) => {
          allItems.push({ ...item })
        })
      })
      setStructureItems(allItems)
    } catch {
      setStructureItems([])
    }
  }, [])

  // When dialog opens
  useEffect(() => {
    if (showRecord) {
      fetchStudents()
      setSelectedStudentId('')
      setSelectedItemId('')
      setStructureItems([])
      setPaymentForm({ amount: '', paymentMethod: 'CASH', discount: '', concession: '', scholarship: '' })
      setStudentSearch('')
    }
  }, [showRecord, fetchStudents])

  // When student is selected
  useEffect(() => {
    if (selectedStudentId) {
      fetchStructureItems(selectedStudentId)
    }
  }, [selectedStudentId, fetchStructureItems])

  // Selected item details
  const selectedItem = structureItems.find((item) => item.id === selectedItemId)

  // Filter collections
  const filteredCollections =
    statusFilter === 'ALL'
      ? collections
      : collections.filter((c) => c.status === statusFilter)

  // Filtered students for search
  const filteredStudents = studentSearch
    ? students.filter(
        (s) =>
          `${s.firstName} ${s.lastName}`.toLowerCase().includes(studentSearch.toLowerCase()) ||
          (s.rollNumber || '').toLowerCase().includes(studentSearch.toLowerCase())
      )
    : students.slice(0, 20)

  // Record payment
  const handleRecordPayment = async () => {
    if (!selectedStudentId) {
      toast({ title: 'Missing Information', description: 'Please select a student.', variant: 'destructive' })
      return
    }
    if (!selectedItemId) {
      toast({ title: 'Missing Information', description: 'Please select a fee item.', variant: 'destructive' })
      return
    }
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) {
      toast({ title: 'Missing Information', description: 'Please enter a valid payment amount.', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      await api.post('/api/school/fees/collections', {
        studentId: selectedStudentId,
        structureItemId: selectedItemId,
        amount: Number(paymentForm.amount),
        paymentMethod: paymentForm.paymentMethod,
        discount: paymentForm.discount ? Number(paymentForm.discount) : 0,
        concession: paymentForm.concession ? Number(paymentForm.concession) : 0,
        scholarship: paymentForm.scholarship ? Number(paymentForm.scholarship) : 0,
      })
      toast({ title: 'Success', description: 'Payment recorded successfully' })
      setShowRecord(false)
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

  // Table columns
  const columns: Column<FeeCollectionItem>[] = [
    {
      key: 'student',
      label: 'Student',
      render: (c: FeeCollectionItem) => (
        <div>
          <span className="font-medium">
            {c.student ? `${c.student.firstName} ${c.student.lastName}` : '-'}
          </span>
          {c.student?.rollNumber && (
            <span className="text-xs text-muted-foreground ml-2">
              ({c.student.rollNumber})
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'feeHead',
      label: 'Fee Head',
      render: (c: FeeCollectionItem) => c.feeHeadName || '-',
    },
    {
      key: 'installment',
      label: 'Installment',
      className: 'hidden md:table-cell',
      render: (c: FeeCollectionItem) => c.installment || '-',
    },
    {
      key: 'amount',
      label: 'Amount',
      render: (c: FeeCollectionItem) => (
        <span className="font-medium">₹{Number(c.amount).toLocaleString()}</span>
      ),
    },
    {
      key: 'paid',
      label: 'Paid',
      render: (c: FeeCollectionItem) => (
        <span className="font-medium text-emerald-700">
          ₹{Number(c.paidAmount).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (c: FeeCollectionItem) => (
        <Badge variant={STATUS_BADGE[c.status]?.variant || 'outline'}>
          {STATUS_BADGE[c.status]?.label || c.status}
        </Badge>
      ),
    },
    {
      key: 'paymentDate',
      label: 'Payment Date',
      className: 'hidden lg:table-cell',
      render: (c: FeeCollectionItem) => (
        <span className="text-sm text-muted-foreground">{c.paymentDate || '—'}</span>
      ),
    },
  ]

  const actions = (_item: FeeCollectionItem): ActionItem[] => [
    { label: 'View Details', onClick: () => {} },
    { label: 'Print Receipt', onClick: () => {} },
  ]

  // ── Render ──────────────────────────────────────────────────────────

  if (loading) {
    return <LoadingState />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Collections"
        description="Record and manage fee payments"
        action={{
          label: 'Record Payment',
          icon: PlusCircle,
          onClick: () => setShowRecord(true),
        }}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatsCard
          title="Total Collected"
          value={stats ? `₹${Number(stats.totalCollected).toLocaleString()}` : '—'}
          description="All time collections"
          icon={IndianRupee}
          trend={stats?.collectionRate ? { value: Math.round(stats.collectionRate), isPositive: true } : undefined}
        />
        <StatsCard
          title="Total Pending"
          value={stats ? `₹${Number(stats.totalPending).toLocaleString()}` : '—'}
          description="Outstanding amount"
          icon={CreditCard}
        />
        <StatsCard
          title="Collection Rate"
          value={stats ? `${Math.round(stats.collectionRate)}%` : '—'}
          description="Percentage collected"
          icon={TrendingUp}
        />
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground">Filter by:</span>
            {(['ALL', 'PAID', 'PARTIAL', 'UNPAID'] as const).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className="text-xs"
              >
                {status === 'ALL' ? 'All' : STATUS_BADGE[status].label}
                {status !== 'ALL' && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                    {collections.filter((c) => c.status === status).length}
                  </Badge>
                )}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Collections Table */}
      {filteredCollections.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No Collections"
          description="No fee collections found. Record a payment to get started."
          action={{ label: 'Record Payment', onClick: () => setShowRecord(true) }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filteredCollections as unknown as Record<string, unknown>[]}
          searchKey="student"
          searchPlaceholder="Search collections..."
          actions={(item) => actions(item as unknown as FeeCollectionItem)}
          isLoading={loading}
        />
      )}

      {/* Record Payment Dialog */}
      <Dialog open={showRecord} onOpenChange={setShowRecord}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Student Selection */}
            <div className="space-y-2">
              <Label>Student</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name or roll number..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {studentSearch && (
                <div className="border rounded-lg max-h-32 overflow-y-auto">
                  {filteredStudents.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3 text-center">No students found</p>
                  ) : (
                    filteredStudents.slice(0, 10).map((s) => (
                      <button
                        key={s.id}
                        className={cn(
                          'w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors',
                          selectedStudentId === s.id && 'bg-primary/10 font-medium'
                        )}
                        onClick={() => {
                          setSelectedStudentId(s.id)
                          setStudentSearch(`${s.firstName} ${s.lastName}`)
                        }}
                      >
                        {s.firstName} {s.lastName}
                        <span className="text-xs text-muted-foreground ml-2">({s.rollNumber})</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Fee Item Selection */}
            {selectedStudentId && (
              <div className="space-y-2">
                <Label>Fee Item</Label>
                <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select fee item" />
                  </SelectTrigger>
                  <SelectContent>
                    {structureItems.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No fee items available
                      </SelectItem>
                    ) : (
                      structureItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.feeHeadName || 'Fee'} — {item.period} (₹{Number(item.amount).toLocaleString()})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Amount Details */}
            {selectedItem && (
              <>
                <Card className="bg-muted/30">
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount Due</span>
                      <span className="font-medium">₹{Number(selectedItem.amount).toLocaleString()}</span>
                    </div>
                    {selectedItem.lateFee ? (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Late Fee</span>
                        <span className="font-medium text-red-600">
                          ₹{Number(selectedItem.lateFee).toLocaleString()}
                        </span>
                      </div>
                    ) : null}
                    {selectedItem.dueDate && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Due Date</span>
                        <span className="text-sm">{selectedItem.dueDate}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Separator />

                {/* Payment Details */}
                <div className="space-y-2">
                  <Label>Payment Amount</Label>
                  <Input
                    type="number"
                    placeholder="Enter amount"
                    value={paymentForm.amount}
                    onChange={(e) =>
                      setPaymentForm((f) => ({ ...f, amount: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select
                    value={paymentForm.paymentMethod}
                    onValueChange={(v) =>
                      setPaymentForm((f) => ({ ...f, paymentMethod: v as PaymentMethod }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => (
                        <SelectItem key={method} value={method}>
                          {PAYMENT_METHOD_LABELS[method]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Optional Fields */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Discount</Label>
                    <Input
                      type="number"
                      placeholder="₹0"
                      value={paymentForm.discount}
                      onChange={(e) =>
                        setPaymentForm((f) => ({ ...f, discount: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Concession</Label>
                    <Input
                      type="number"
                      placeholder="₹0"
                      value={paymentForm.concession}
                      onChange={(e) =>
                        setPaymentForm((f) => ({ ...f, concession: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Scholarship</Label>
                    <Input
                      type="number"
                      placeholder="₹0"
                      value={paymentForm.scholarship}
                      onChange={(e) =>
                        setPaymentForm((f) => ({ ...f, scholarship: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecord(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRecordPayment}
              disabled={
                saving ||
                !selectedStudentId ||
                !selectedItemId ||
                !paymentForm.amount ||
                Number(paymentForm.amount) <= 0
              }
            >
              {saving ? 'Recording...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
