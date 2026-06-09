'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Download, IndianRupee, Wallet, Clock, HandCoins } from 'lucide-react'

interface TypeBreakdown {
  count: number
  gross: number
  net: number
  paidNet: number
  pendingNet: number
}

interface ReportData {
  summary: {
    totalPayslips: number
    totalGross: number
    totalNet: number
    paidNet: number
    pendingNet: number
    advanceOutstanding: number
  }
  byType: Record<string, TypeBreakdown>
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TYPE_LABELS: Record<string, string> = { teacher: 'Teachers', staff: 'Staff', driver: 'Drivers' }
const money = (n: number | undefined) => `₹${(n || 0).toLocaleString('en-IN')}`

export function SalaryReportsPage() {
  const { toast } = useToast()
  const now = new Date()
  const [filters, setFilters] = useState({ year: String(now.getFullYear()), month: 'all', staffType: 'all' })
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  const params = useCallback(() => {
    const p: Record<string, string> = { year: filters.year }
    if (filters.month !== 'all') p.month = filters.month
    if (filters.staffType !== 'all') p.staffType = filters.staffType
    return p
  }, [filters])

  const fetchReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<ReportData>('/api/school/salary/reports', params())
      setData(res)
    } catch {
      toast({ title: "Couldn't Load Report", description: 'Please try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [params, toast])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const handleExport = () => {
    const qs = new URLSearchParams({ ...params(), format: 'csv' }).toString()
    window.open(`/api/school/salary/reports?${qs}`, '_blank')
  }

  const stats = data
    ? [
        { label: 'Total Net Payroll', value: money(data.summary.totalNet), icon: IndianRupee },
        { label: 'Paid', value: money(data.summary.paidNet), icon: Wallet },
        { label: 'Pending', value: money(data.summary.pendingNet), icon: Clock },
        { label: 'Advance Outstanding', value: money(data.summary.advanceOutstanding), icon: HandCoins },
      ]
    : []

  return (
    <div className="space-y-6">
      <PageHeader title="Salary Reports" description="Payroll summary across all staff types" />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-2">
            <Label>Year</Label>
            <Input
              type="number"
              className="w-28"
              value={filters.year}
              onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Month</Label>
            <Select value={filters.month} onValueChange={(v) => setFilters((f) => ({ ...f, month: v }))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Staff Type</Label>
            <Select value={filters.staffType} onValueChange={(v) => setFilters((f) => ({ ...f, staffType: v }))}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="teacher">Teachers</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="driver">Drivers</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={!data || data.summary.totalPayslips === 0}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingState />
      ) : !data ? null : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <Card key={s.label}>
                <CardContent className="flex items-center gap-3 pt-6">
                  <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-lg font-semibold">{s.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Breakdown by Staff Type</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Payslips</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data.byType).map(([type, b]) => (
                    <TableRow key={type}>
                      <TableCell className="font-medium">{TYPE_LABELS[type] || type}</TableCell>
                      <TableCell className="text-right">{b.count}</TableCell>
                      <TableCell className="text-right">{money(b.gross)}</TableCell>
                      <TableCell className="text-right">{money(b.net)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{money(b.paidNet)}</TableCell>
                      <TableCell className="text-right text-amber-700">{money(b.pendingNet)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
