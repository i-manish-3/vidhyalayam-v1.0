'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, LoadingState } from '@/components/shared'
import { Download, Printer, AlertTriangle, ShieldCheck } from 'lucide-react'
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
  total: number
  percent: number
  parentPhone: string | null
}

const ENDPOINT = '/api/school/attendance/reports/defaulters'

export function DefaultersTab({
  filters,
  onViewCalendar,
}: {
  filters: SharedReportProps
  onViewCalendar: (studentId: string) => void
}) {
  const { toast } = useToast()
  const { academicYear, school, classes, sections, dateFrom, dateTo, classId, sectionId } = filters

  const [threshold, setThreshold] = useState(75)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const params = useCallback(() => {
    const p: Record<string, string> = { academicYear, dateFrom, dateTo, classId, threshold: String(threshold) }
    if (sectionId) p.sectionId = sectionId
    return p
  }, [academicYear, dateFrom, dateTo, classId, sectionId, threshold])

  const fetchData = useCallback(async () => {
    if (!classId) return
    setLoading(true)
    try {
      const res = await api.get<{ records: Row[] }>(ENDPOINT, params())
      setRows(res.records || [])
    } catch {
      toast({ title: 'Error', description: 'Failed to load defaulters.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [classId, params, toast])

  useEffect(() => {
    const t = setTimeout(fetchData, 300) // debounce threshold typing
    return () => clearTimeout(t)
  }, [fetchData])

  const handleCsv = async () => {
    setExporting(true)
    try {
      await downloadReportCsv(ENDPOINT, params(), 'attendance-defaulters.csv')
    } catch {
      toast({ title: 'Export failed', description: 'Could not download CSV.', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const handlePrint = () => {
    printReport({
      school,
      title: `Attendance Defaulters (below ${threshold}%)`,
      meta: [
        classSectionLabel(classes, sections, classId, sectionId),
        formatRangeLabel(dateFrom, dateTo),
        `Academic Year ${academicYear}`,
      ],
      columns: ['Roll', 'Name', 'Class', 'Section', 'Present', 'Absent', 'Total', '%', 'Parent Phone'],
      rows: rows.map((r) => [
        r.rollNumber ?? '', r.name, r.className ?? '', r.sectionName ?? '', r.present, r.absent, r.total, `${r.percent}%`, r.parentPhone ?? '',
      ]),
    })
  }

  if (!classId) {
    return <EmptyState icon={AlertTriangle} title="Select a class" description="Choose a class above to find students below the attendance threshold." />
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Below</Label>
          <div className="relative">
            <Input
              type="number"
              min={1}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              className="h-8 w-20 pr-6 text-sm"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:inline">· {classSectionLabel(classes, sections, classId, sectionId)} · {formatRangeLabel(dateFrom, dateTo)}</span>
        </div>
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
        <EmptyState icon={ShieldCheck} title="No defaulters" description={`No students are below ${threshold}% for this class and date range.`} />
      ) : (
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Roll</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-center">Present</TableHead>
                  <TableHead className="text-center">Absent</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">%</TableHead>
                  <TableHead>Parent Phone</TableHead>
                  <TableHead className="w-20 text-right">Calendar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.studentId}>
                    <TableCell className="font-mono text-xs">{r.rollNumber || '—'}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-center text-emerald-600 dark:text-emerald-400">{r.present}</TableCell>
                    <TableCell className="text-center text-red-600 dark:text-red-400">{r.absent}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{r.total}</TableCell>
                    <TableCell className="text-center font-semibold text-red-600 dark:text-red-400">{r.percent}%</TableCell>
                    <TableCell className="text-xs">{r.parentPhone || '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onViewCalendar(r.studentId)}>
                        View
                      </Button>
                    </TableCell>
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
