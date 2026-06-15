'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, User as UserIcon, Printer, FileText, Download } from 'lucide-react'
import { formatCurrency } from '../audit-field-list'
import { KpiCard } from './kpi-card'
import { cn } from '@/lib/utils'

interface StudentLite {
  id: string
  firstName: string
  lastName: string
  admissionNumber: string | null
  class: { name: string } | null
  section: { name: string } | null
}

interface Entry {
  id: string
  date: string
  dueDate: string | null
  academicYear: string | null
  type: string
  sourceType: string | null
  feeHeadName: string | null
  installmentName: string | null
  description: string
  debit: number
  credit: number
  balance: number
  paymentMethod: string | null
  receiptNumber: string | null
  status: string
}

interface FeePayment {
  id: string
  type: string
  amount: number
  receiptNumber: string | null
  paymentMethod: string | null
  date: string
}

interface FeeItem {
  id: string
  type: string
  feeHeadName: string | null
  installmentName: string | null
  description: string
  slipNumber: string | null
  billed: number
  paid: number
  waived: number
  pending: number
  dueDate: string | null
  billedDate: string
  status: 'paid' | 'partial' | 'unpaid' | string
  payments: FeePayment[]
}

interface StatementResponse {
  student: {
    id: string
    name: string
    admissionNumber: string | null
    rollNumber: string | null
    class: { name: string } | null
    section: { name: string } | null
  }
  summary: { billed: number; paid: number; waiver: number; refunded: number; outstanding: number }
  entries: Entry[]
  feeItems: FeeItem[]
}

interface StudentStatementTabProps {
  academicYear?: string
  initialStudentId?: string | null
  onStudentSelected?: (studentId: string) => void
}

export function StudentStatementTab({ academicYear, initialStudentId, onStudentSelected }: StudentStatementTabProps) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<StudentLite[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(initialStudentId ?? null)

  const [statement, setStatement] = useState<StatementResponse | null>(null)
  const [loading, setLoading] = useState(false)

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      return
    }
    let alive = true
    const t = setTimeout(() => {
      if (alive) setSearching(true)
      const params = new URLSearchParams({ q: query, limit: '15' })
      fetch(`/api/school/fees/demand-slips/students/search?${params}`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => { if (alive) setResults(d.students || []) })
        .catch(() => { if (alive) setResults([]) })
        .finally(() => { if (alive) setSearching(false) })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [query])

  // Load statement when student selected
  useEffect(() => {
    if (!selectedId) {
      return
    }
    let alive = true
    const loadStatement = async () => {
      setLoading(true)
      const params = new URLSearchParams({ studentId: selectedId })
      if (academicYear) params.set('academicYear', academicYear)

      fetch(`/api/school/fees/reports/student-statement?${params}`, { credentials: 'include' })
        .then(r => {
          if (!r.ok) throw new Error('Failed to load statement')
          return r.json()
        })
        .then(d => { if (alive) setStatement(d) })
        .catch(() => { if (alive) setStatement(null) })
        .finally(() => { if (alive) setLoading(false) })
    }
    void loadStatement()

    return () => { alive = false }
  }, [selectedId, academicYear])

  const handlePick = (s: StudentLite) => {
    setSelectedId(s.id)
    setQuery('')
    setResults([])
    onStudentSelected?.(s.id)
  }

  const handlePrint = () => window.print()

  const handleExportCsv = () => {
    if (!statement) return
    const headers = ['Fee', 'Installment', 'Demand Slip', 'Due Date', 'Billed', 'Paid', 'Waived', 'Pending', 'Status', 'Paid By']
    const rows = statement.feeItems.map(item => [
      item.feeHeadName || item.description,
      item.installmentName || '',
      item.slipNumber || '',
      item.dueDate ? new Date(item.dueDate).toLocaleDateString('en-IN') : '',
      item.billed,
      item.paid,
      item.waived,
      item.pending,
      item.status,
      item.payments.map(p => `${p.receiptNumber || 'Receipt'}: ${p.amount}`).join(' | '),
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `statement-${statement.student.admissionNumber || statement.student.id}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <UserIcon className="size-4 text-blue-600" />
            Choose a Student
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or admission number (min 2 chars)"
              className="pl-9 h-10"
            />
            {query.length >= 2 && results.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                {results.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handlePick(s)}
                    className="block w-full px-4 py-2 text-left hover:bg-blue-50 text-sm border-b last:border-b-0"
                  >
                    <div className="font-medium text-gray-900">{s.firstName} {s.lastName}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.admissionNumber || '—'}
                      {s.class && ` · Class ${s.class.name}`}
                      {s.section && ` ${s.section.name}`}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searching && (
              <div className="absolute right-3 top-2.5 text-xs text-muted-foreground">Searching…</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Statement */}
      {selectedId ? (
        loading ? (
          <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        ) : statement ? (
          <>
            {/* Student card + summary */}
            <Card>
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{statement.student.name}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium">{statement.student.admissionNumber || 'No admission #'}</span>
                      {statement.student.rollNumber && <><span>·</span><span>Roll {statement.student.rollNumber}</span></>}
                      {statement.student.class && (
                        <><span>·</span><span>Class {statement.student.class.name}</span></>
                      )}
                      {statement.student.section && (
                        <><span>·</span><span>Section {statement.student.section.name}</span></>
                      )}
                      {academicYear && <><span>·</span><Badge variant="outline" className="text-[10px] h-4 px-1.5">AY {academicYear}</Badge></>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={handleExportCsv}>
                      <Download className="size-3.5" /> CSV
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={handlePrint}>
                      <Printer className="size-3.5" /> Print
                    </Button>
                  </div>
                </div>

                {/* Summary row */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiCard label="Total Billed" value={formatCurrency(statement.summary.billed)} tone="muted" icon={FileText} />
                  <KpiCard label="Total Paid" value={formatCurrency(statement.summary.paid)} tone="success" />
                  <KpiCard label="Waivers" value={formatCurrency(statement.summary.waiver)} tone="muted" />
                  <KpiCard label="Outstanding" value={formatCurrency(statement.summary.outstanding)} tone={statement.summary.outstanding > 0 ? 'warning' : 'success'} />
                </div>
              </CardContent>
            </Card>

            <FeeWiseStatusTable items={statement.feeItems || []} />

            {/* Legacy ledger */}
            {false && <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Fee-wise Status</CardTitle>
                <p className="text-xs text-muted-foreground">Demand slip, amount paid, pending balance, and receipt-wise payment split</p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 hover:bg-gray-50">
                        <TableHead className="text-xs min-w-[180px]">Fee</TableHead>
                        <TableHead className="text-xs">Demand Slip</TableHead>
                        <TableHead className="text-xs">Due Date</TableHead>
                        <TableHead className="text-xs text-right">Billed</TableHead>
                        <TableHead className="text-xs text-right">Paid</TableHead>
                        <TableHead className="text-xs text-right">Pending</TableHead>
                        <TableHead className="text-xs min-w-[220px]">Paid By</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statement!.entries.length > 0 ? statement!.entries.map(e => (
                        <TableRow key={e.id} className="text-sm">
                          <TableCell className="py-2 text-xs whitespace-nowrap">
                            {new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline" className={cn('text-[10px] h-5', typeBadge(e.type))}>
                              {e.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2 text-sm">
                            {e.description}
                            {e.paymentMethod && (
                              <span className="text-xs text-muted-foreground"> · {e.paymentMethod}</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-xs font-mono text-muted-foreground">
                            {e.receiptNumber || '—'}
                          </TableCell>
                          <TableCell className="py-2 text-right tabular-nums">
                            {e.debit > 0 ? formatCurrency(e.debit) : <span className="text-gray-300">—</span>}
                          </TableCell>
                          <TableCell className="py-2 text-right tabular-nums text-emerald-700">
                            {e.credit > 0 ? formatCurrency(e.credit) : <span className="text-gray-300">—</span>}
                          </TableCell>
                          <TableCell className="py-2 text-right tabular-nums font-semibold">
                            {formatCurrency(e.balance)}
                          </TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                            No ledger entries for this student
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>}
          </>
        ) : (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Could not load statement for this student
            </CardContent>
          </Card>
        )
      ) : (
        <Card>
          <CardContent className="p-10 text-center">
            <UserIcon className="size-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Search above to view a student&rsquo;s complete fee history
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function FeeWiseStatusTable({ items }: { items: FeeItem[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Fee-wise Status</CardTitle>
        <p className="text-xs text-muted-foreground">
          Demand slip, amount paid, pending balance, and receipt-wise payment split
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 hover:bg-gray-50">
                <TableHead className="text-xs min-w-[180px]">Fee</TableHead>
                <TableHead className="text-xs">Demand Slip</TableHead>
                <TableHead className="text-xs">Due Date</TableHead>
                <TableHead className="text-xs text-right">Billed</TableHead>
                <TableHead className="text-xs text-right">Paid</TableHead>
                <TableHead className="text-xs text-right">Pending</TableHead>
                <TableHead className="text-xs min-w-[220px]">Paid By</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length > 0 ? items.map(item => (
                <TableRow key={item.id} className="text-sm">
                  <TableCell className="py-2">
                    <div className="font-medium text-gray-900">{item.feeHeadName || item.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.installmentName || item.type}
                      {item.waived > 0 ? ` · Waived ${formatCurrency(item.waived)}` : ''}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">
                    {item.slipNumber || '—'}
                  </TableCell>
                  <TableCell className="py-2 text-xs whitespace-nowrap">
                    {item.dueDate
                      ? new Date(item.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
                      : '—'}
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums">
                    {formatCurrency(item.billed)}
                  </TableCell>
                  <TableCell className="py-2 text-right tabular-nums text-emerald-700">
                    {item.paid > 0 ? formatCurrency(item.paid) : <span className="text-gray-300">—</span>}
                  </TableCell>
                  <TableCell className={cn('py-2 text-right tabular-nums font-semibold', item.pending > 0 ? 'text-amber-700' : 'text-emerald-700')}>
                    {item.pending > 0 ? formatCurrency(item.pending) : 'Paid'}
                  </TableCell>
                  <TableCell className="py-2">
                    <PaymentBreakdown payments={item.payments} />
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge variant="outline" className={cn('text-[10px] h-5 capitalize', statusBadge(item.status))}>
                      {item.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-10">
                    No fee items for this student
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function PaymentBreakdown({ payments }: { payments: FeePayment[] }) {
  if (payments.length === 0) {
    return <span className="text-xs text-muted-foreground italic">No payment</span>
  }

  return (
    <div className="space-y-1">
      {payments.map(payment => (
        <div key={payment.id} className="text-xs">
          <span className="font-mono text-gray-700">{payment.receiptNumber || 'Receipt'}</span>
          <span className="text-muted-foreground"> · </span>
          <span className={payment.type === 'CREDIT' ? 'text-emerald-700 font-medium' : 'text-purple-700 font-medium'}>
            {formatCurrency(payment.amount)}
          </span>
          <span className="text-muted-foreground">
            {' '}({payment.type === 'CREDIT' ? (payment.paymentMethod || 'Payment') : payment.type}, {new Date(payment.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})
          </span>
        </div>
      ))}
    </div>
  )
}

function statusBadge(status: string): string {
  switch (status) {
    case 'paid': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'partial': return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'unpaid': return 'bg-red-50 text-red-700 border-red-200'
    default: return 'bg-gray-100 text-gray-700 border-gray-300'
  }
}

function typeBadge(type: string): string {
  switch (type) {
    case 'DEBIT': return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'CREDIT': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'WAIVER': return 'bg-purple-50 text-purple-700 border-purple-200'
    case 'REFUND': return 'bg-red-50 text-red-700 border-red-200'
    case 'FINE': return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'ADJUSTMENT': return 'bg-gray-100 text-gray-700 border-gray-300'
    default: return 'bg-gray-100 text-gray-700 border-gray-300'
  }
}
