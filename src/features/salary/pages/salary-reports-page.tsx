'use client'

import { useState, useEffect, useCallback } from 'react'
import { LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  BarChart3,
  Download,
  IndianRupee,
  Wallet,
  Clock,
  HandCoins,
  Users,
  Loader2,
  BadgeCheck,
} from 'lucide-react'
import {
  SalaryHero,
  SalaryStatCard,
  SalaryTableCard,
  LegendItem,
} from '@/features/salary/components/salary-ui'

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
const TYPE_META: Record<string, { dot: string; icon: string }> = {
  teacher: { dot: 'bg-violet-500', icon: 'from-violet-500 to-purple-600' },
  staff: { dot: 'bg-teal-500', icon: 'from-teal-500 to-cyan-600' },
  driver: { dot: 'bg-amber-500', icon: 'from-amber-500 to-orange-600' },
}
const money = (n: number | undefined) => `₹${(n || 0).toLocaleString('en-IN')}`

export function SalaryReportsPage() {
  const { toast } = useToast()
  const now = new Date()
  const [filters, setFilters] = useState({ year: String(now.getFullYear()), month: 'all', staffType: 'all' })
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

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

  const handleExport = async () => {
    setExporting(true)
    try {
      const qs = new URLSearchParams({ ...params(), format: 'csv' }).toString()
      window.open(`/api/school/salary/reports?${qs}`, '_blank')
      toast({ title: 'Export started', description: 'The CSV download should begin shortly.' })
    } catch {
      toast({ title: 'Export failed', description: 'Please try again.', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const periodLabel =
    filters.month === 'all'
      ? `Year ${filters.year}`
      : `${MONTHS[Number(filters.month) - 1] || ''} ${filters.year}`

  return (
    <div className="space-y-4">
      <SalaryHero
        icon={BarChart3}
        title="Salary Reports"
        description="Payroll summary across all staff types"
        badge={periodLabel}
        action={{
          label: 'Export CSV',
          icon: exporting ? Loader2 : Download,
          onClick: handleExport,
        }}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-teal-200/80 bg-gradient-to-r from-teal-50 via-white to-sky-50 px-4 py-3 shadow-sm dark:border-teal-500/25 dark:from-teal-500/10 dark:via-card dark:to-sky-500/10">
        <div className="space-y-1.5">
          <Label className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">Year</Label>
          <Input
            type="number"
            className="h-9 w-28 text-xs"
            value={filters.year}
            onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">Month</Label>
          <Select value={filters.month} onValueChange={(v) => setFilters((f) => ({ ...f, month: v }))}>
            <SelectTrigger className="h-9 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">Staff Type</Label>
          <Select value={filters.staffType} onValueChange={(v) => setFilters((f) => ({ ...f, staffType: v }))}>
            <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="teacher">Teachers</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="driver">Drivers</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : !data ? null : (
        <>
          {/* Stats */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <SalaryStatCard title="Total Net Payroll" value={money(data.summary.totalNet)} description={`${data.summary.totalPayslips} payslips`} icon={IndianRupee} tone="sky" />
            <SalaryStatCard title="Paid" value={money(data.summary.paidNet)} description="Paid out" icon={Wallet} tone="emerald" />
            <SalaryStatCard title="Pending" value={money(data.summary.pendingNet)} description="Awaiting payment" icon={Clock} tone="amber" />
            <SalaryStatCard title="Advance Outstanding" value={money(data.summary.advanceOutstanding)} description="Approved, not yet recovered" icon={HandCoins} tone="violet" />
          </div>

          {/* Breakdown */}
          <SalaryTableCard
            title="Breakdown by Staff Type"
            icon={Users}
            badge={`${data.summary.totalPayslips} payslips`}
            footer={
              <>
                <LegendItem color="bg-violet-500" label="Teachers" />
                <LegendItem color="bg-teal-500" label="Staff" />
                <LegendItem color="bg-amber-500" label="Drivers" />
                <LegendItem color="bg-sky-500" label={`Net ${money(data.summary.totalNet)}`} />
              </>
            }
          >
            <div className="mx-4 mb-4 mt-4 overflow-x-auto rounded-xl border border-sky-500/15 shadow-sm">
              <Table>
                <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                  <TableRow>
                    <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Type</TableHead>
                    <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Payslips</TableHead>
                    <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Gross</TableHead>
                    <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Net</TableHead>
                    <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Paid</TableHead>
                    <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data.byType).map(([type, b], idx) => (
                    <TableRow
                      key={type}
                      className={cn('transition-colors hover:bg-sky-500/[0.04]', idx % 2 === 0 ? 'bg-transparent' : 'bg-sky-500/[0.02]')}
                    >
                      <TableCell className="px-4 py-3">
                        <span className="flex items-center gap-2.5">
                          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm', TYPE_META[type]?.icon || 'from-slate-500 to-slate-600')}>
                            <BadgeCheck className="size-4" />
                          </span>
                          <span className="text-sm font-semibold">{TYPE_LABELS[type] || type}</span>
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-right text-sm tabular-nums">{b.count}</TableCell>
                      <TableCell className="py-3 text-right text-sm tabular-nums">{money(b.gross)}</TableCell>
                      <TableCell className="py-3 text-right text-sm font-semibold tabular-nums">{money(b.net)}</TableCell>
                      <TableCell className="py-3 text-right text-sm tabular-nums text-emerald-700 dark:text-emerald-400">{money(b.paidNet)}</TableCell>
                      <TableCell className="py-3 text-right text-sm tabular-nums text-amber-700 dark:text-amber-400">{money(b.pendingNet)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SalaryTableCard>
        </>
      )}
    </div>
  )
}