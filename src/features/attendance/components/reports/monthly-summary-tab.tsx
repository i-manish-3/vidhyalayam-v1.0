'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, LoadingState } from '@/components/shared'
import { Download, Printer, CalendarRange, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { printReport } from './report-print'
import {
  type SharedReportProps,
  formatRangeLabel,
  classSectionLabel,
  downloadReportCsv,
} from './types'

interface Row {
  studentId: string
  name: string
  rollNumber: string | null
  className: string | null
  sectionName: string | null
  present: number
  absent: number
  leave: number
  late: number
  half_day: number
  total: number
  percent: number
}

const ENDPOINT = '/api/school/attendance/reports/monthly-summary'

function percentColor(p: number): string {
  if (p >= 75) return 'text-emerald-600 dark:text-emerald-400'
  if (p >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export function MonthlySummaryTab({
  filters,
  onViewCalendar,
}: {
  filters: SharedReportProps
  onViewCalendar: (studentId: string) => void
}) {
  const { toast } = useToast()
  const { academicYear, school, classes, sections, dateFrom, dateTo, classId, sectionId } = filters

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const params = useCallback(() => {
    const p: Record<string, string> = { academicYear, dateFrom, dateTo, classId }
    if (sectionId) p.sectionId = sectionId
    return p
  }, [academicYear, dateFrom, dateTo, classId, sectionId])

  const fetchData = useCallback(async () => {
    if (!classId) return
    setLoading(true)
    try {
      const res = await api.get<{ records: Row[] }>(ENDPOINT, params())
      setRows(res.records || [])
    } catch {
      toast({ title: 'Error', description: 'Failed to load monthly summary.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [classId, params, toast])

  useEffect(() => { fetchData() }, [fetchData])

  const handleCsv = async () => {
    setExporting(true)
    try {
      await downloadReportCsv(ENDPOINT, params(), 'attendance-monthly-summary.csv')
      toast({ title: 'Export started', description: 'The CSV download should begin shortly.' })
    } catch {
      toast({ title: 'Export failed', description: 'Could not download CSV.', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const handlePrint = () => {
    printReport({
      school,
      title: 'Monthly Attendance Summary',
      meta: [
        classSectionLabel(classes, sections, classId, sectionId),
        formatRangeLabel(dateFrom, dateTo),
        `Academic Year ${academicYear}`,
      ],
      columns: ['Roll', 'Name', 'Present', 'Absent', 'Leave', 'Total', '%'],
      rows: rows.map((r) => [
        r.rollNumber ?? '', r.name, r.present, r.absent, r.leave, r.total, `${r.percent}%`,
      ]),
    })
  }

  if (!classId) {
    return <EmptyState icon={BarChart3} title="Select a class" description="Choose a class above to see per-student attendance totals." />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-sky-500/15 bg-gradient-to-r from-sky-500/[0.06] via-transparent to-violet-500/[0.06] px-3 py-2">
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarRange className="size-3.5 text-primary" />
          <span className="font-semibold text-foreground">{classSectionLabel(classes, sections, classId, sectionId)}</span>
          <span>·</span>
          <span>{formatRangeLabel(dateFrom, dateTo)}</span>
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleCsv} disabled={exporting || loading || rows.length === 0} className="h-8 gap-1.5 bg-white shadow-sm dark:bg-input/20">
            <Download className="size-4" /> {exporting ? 'Exporting…' : 'CSV'}
          </Button>
          <Button size="sm" variant="outline" onClick={handlePrint} disabled={loading || rows.length === 0} className="h-8 gap-1.5 bg-white shadow-sm dark:bg-input/20">
            <Printer className="size-4" /> Print
          </Button>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState icon={BarChart3} title="No data" description="No attendance records found for this class and date range." />
      ) : (
        <Card className="gap-0 overflow-hidden rounded-xl border-sky-500/15 shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                  <TableRow>
                    <TableHead className="w-14 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Roll</TableHead>
                    <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</TableHead>
                    <TableHead className="py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Present</TableHead>
                    <TableHead className="py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Absent</TableHead>
                    <TableHead className="py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leave</TableHead>
                    <TableHead className="py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</TableHead>
                    <TableHead className="py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">%</TableHead>
                    <TableHead className="w-24 py-2.5 text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.studentId} className="transition-colors hover:bg-sky-500/[0.04]">
                      <TableCell className="py-2.5 font-mono text-xs">{r.rollNumber || '—'}</TableCell>
                      <TableCell className="py-2.5 font-medium">{r.name}</TableCell>
                      <TableCell className="py-2.5 text-center text-emerald-600 dark:text-emerald-400">{r.present}</TableCell>
                      <TableCell className="py-2.5 text-center text-red-600 dark:text-red-400">{r.absent}</TableCell>
                      <TableCell className="py-2.5 text-center text-amber-600 dark:text-amber-400">{r.leave}</TableCell>
                      <TableCell className="py-2.5 text-center text-muted-foreground">{r.total}</TableCell>
                      <TableCell className={cn('py-2.5 text-center font-semibold', percentColor(r.percent))}>{r.percent}%</TableCell>
                      <TableCell className="py-2.5 text-right">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onViewCalendar(r.studentId)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      {rows.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          <Badge variant="secondary" className="mr-1">%</Badge>
          = Present ÷ Total marked. Leave days count toward Total but not Present.
        </p>
      )}
    </div>
  )
}
