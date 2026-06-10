'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader, StatsCard, EmptyState, LoadingState } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { IndianRupee, Receipt, AlertCircle, CheckCircle2 } from 'lucide-react'

interface FeeLine {
  id: string
  feeHead: string
  installment: string
  amount: number
  paid: number
  discount: number
  fine: number
  pending: number
  status: string
  dueDate: string | null
  paymentDate: string | null
  receiptNumber: string | null
}

interface StudentFees {
  studentId: string
  studentName: string
  admissionNumber: string | null
  fees: FeeLine[]
  summary: { total: number; paid: number; pending: number; overdue: number }
}

const inr = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10' },
  partial: { label: 'Partial', className: 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/10' },
  unpaid: { label: 'Unpaid', className: 'bg-red-500/10 text-red-600 hover:bg-red-500/10' },
}

export function ParentFeeDetailsPage() {
  const searchParams = useSearchParams()
  const queryStudentId = searchParams.get('studentId')
  const { toast } = useToast()

  const [data, setData] = useState<StudentFees[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>('')

  const fetchFees = useCallback(async () => {
    try {
      const res = await api.get<{ fees: StudentFees[] }>('/api/parent/fees')
      setData(res?.fees || [])
    } catch {
      toast({
        title: "Couldn't load fee details",
        description: 'Please refresh the page. If this continues, contact the school.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void fetchFees()
  }, [fetchFees])

  // Default the selected child to the query param (from "Fee Details" deep-link)
  // or the first child once data arrives.
  useEffect(() => {
    if (data.length === 0) return
    const valid = queryStudentId && data.some((d) => d.studentId === queryStudentId)
    setSelectedId((prev) => (prev && data.some((d) => d.studentId === prev) ? prev : valid ? queryStudentId! : data[0].studentId))
  }, [data, queryStudentId])

  const selected = useMemo(() => data.find((d) => d.studentId === selectedId), [data, selectedId])

  if (loading) return <LoadingState />

  if (data.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Fee Details" description="Fees for your children" />
        <EmptyState
          icon={Receipt}
          title="No fee records"
          description="There are no fee records for your children yet."
        />
      </div>
    )
  }

  const s = selected?.summary

  return (
    <div className="space-y-6">
      <PageHeader title="Fee Details" description="Fees for your children" />

      {data.length > 1 && (
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue placeholder="Select a child" />
          </SelectTrigger>
          <SelectContent>
            {data.map((d) => (
              <SelectItem key={d.studentId} value={d.studentId}>
                {d.studentName}
                {d.admissionNumber ? ` (${d.admissionNumber})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Total Fees" value={inr(s?.total || 0)} icon={IndianRupee} description="for the year" />
        <StatsCard title="Paid" value={inr(s?.paid || 0)} icon={CheckCircle2} description="received" />
        <StatsCard title="Pending" value={inr(s?.pending || 0)} icon={Receipt} description="outstanding" />
        <StatsCard title="Overdue" value={inr(s?.overdue || 0)} icon={AlertCircle} description="past due date" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selected?.studentName}
            {selected?.admissionNumber ? (
              <span className="ml-2 font-mono text-xs text-muted-foreground">{selected.admissionNumber}</span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selected || selected.fees.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No fee records for this child.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fee Head</TableHead>
                    <TableHead>Installment</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selected.fees.map((f) => {
                    const badge = STATUS_BADGE[f.status] || STATUS_BADGE.unpaid
                    return (
                      <TableRow key={f.id}>
                        <TableCell className="font-medium">{f.feeHead}</TableCell>
                        <TableCell className="text-muted-foreground">{f.installment || '-'}</TableCell>
                        <TableCell className="text-right tabular-nums">{inr(f.amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{inr(f.paid)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{inr(f.pending)}</TableCell>
                        <TableCell className="text-sm">{f.dueDate || '-'}</TableCell>
                        <TableCell>
                          <Badge className={`${badge.className} text-[10px]`}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {f.receiptNumber || '-'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
