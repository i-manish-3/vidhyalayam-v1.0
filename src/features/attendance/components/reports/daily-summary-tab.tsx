'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, LoadingState } from '@/components/shared'
import { Download, Printer, CalendarRange, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { printReport } from './report-print'
import {
  type SharedReportProps,
  formatRangeLabel,
  classSectionLabel,
  downloadReportCsv,
} from './types'

interface Row {
  date: string
  classId: string | null
  className: string | null
  sectionId: string | null
  sectionName: string | null
  present: number
  absent: number
  leave: number
  late: number
  half_day: number
  total: number
  percent: number
}

const ENDPOINT = '/api/school/attendance/reports/daily-summary'

function percentColor(p: number): string {
  if (p >= 75) return 'text-emerald-600 dark:text-emerald-400'
  if (p >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function formatDate(value: string): string {
  const d = new Date(value + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })
}

export function DailySummaryTab({ filters }: { filters: SharedReportProps }) {
  const { toast } = useToast()
  const { academicYear, school, classes, sections, dateFrom, dateTo, classId, sectionId } = filters

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const params = useCallback(() => {
    const p: Record<string, string> = { academicYear, dateFrom, dateTo }
    if (classId) p.classId = classId
    if (sectionId) p.sectionId = sectionId
    return p
  }, [academicYear, dateFrom, dateTo, classId, sectionId])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ records: Row[] }>(ENDPOINT, params())
      setRows(res.records || [])
    } catch {
      toast({ title: 'Error', description: 'Failed to load daily summary.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [params, toast])

  useEffect(() => { fetchData() }, [fetchData])

  const handleCsv = async () => {
    setExporting(true)
    try {
      await downloadReportCsv(ENDPOINT, params(), 'attendance-daily-summary.csv')
    } catch {
      toast({ title: 'Export failed', description: 'Could not download CSV.', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const handlePrint = () => {
    printReport({
      school,
      title: 'Daily Attendance Summary',
      meta: [
        classSectionLabel(classes, sections, classId, sectionId),
        formatRangeLabel(dateFrom, dateTo),
        `Academic Year ${academicYear}`,
      ],
      columns: ['Date', 'Class', 'Section', 'Present', 'Absent', 'Leave', 'Total', '%'],
      rows: rows.map((r) => [
        r.date, r.className ?? '', r.sectionName ?? '', r.present, r.absent, r.leave, r.total, `${r.percent}%`,
      ]),
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <CalendarRange className="size-3.5" />
          {classSectionLabel(classes, sections, classId, sectionId)} · {formatRangeLabel(dateFrom, dateTo)}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleCsv} disabled={exporting || loading || rows.length === 0} className="h-8 gap-1.5">
            <Download className="size-4" /> {exporting ? 'Exporting…' : 'CSV'}
          </Button>
          <Button size="sm" variant="outline" onClick={handlePrint} disabled={loading || rows.length === 0} className="h-8 gap-1.5">
            <Printer className="size-4" /> Print
          </Button>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No data" description="No attendance records found for this date range." />
      ) : (
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead className="text-center">Present</TableHead>
                  <TableHead className="text-center">Absent</TableHead>
                  <TableHead className="text-center">Leave</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={`${r.date}-${r.classId}-${r.sectionId}-${i}`}>
                    <TableCell className="whitespace-nowrap text-xs font-medium">{formatDate(r.date)}</TableCell>
                    <TableCell>{r.className || '—'}</TableCell>
                    <TableCell>{r.sectionName || '—'}</TableCell>
                    <TableCell className="text-center text-emerald-600 dark:text-emerald-400">{r.present}</TableCell>
                    <TableCell className="text-center text-red-600 dark:text-red-400">{r.absent}</TableCell>
                    <TableCell className="text-center text-amber-600 dark:text-amber-400">{r.leave}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{r.total}</TableCell>
                    <TableCell className={cn('text-center font-semibold', percentColor(r.percent))}>{r.percent}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
