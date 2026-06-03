'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle, Search, ChevronLeft, ChevronRight, FileText, ExternalLink } from 'lucide-react'
import { formatCurrency } from '../audit-field-list'
import { KpiCard } from './kpi-card'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'

interface Row {
  studentId: string
  name: string
  admissionNumber: string | null
  rollNumber: string | null
  class: { id: string; name: string } | null
  section: { id: string; name: string } | null
  totalOutstanding: number
  buckets: {
    notDue: number
    b0_30: number
    b31_60: number
    b61_90: number
    b90_plus: number
  }
  oldestDueDate: string | null
  lastPaymentDate: string | null
}

interface Response {
  rows: Row[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
  totals: {
    studentCount: number
    outstanding: number
    buckets: { notDue: number; b0_30: number; b31_60: number; b61_90: number; b90_plus: number }
  }
}

interface ClassOption { id: string; name: string }
interface SectionOption { id: string; name: string; classId?: string }

interface OutstandingTabProps {
  academicYear?: string
  classes: ClassOption[]
  sections: SectionOption[]
  onOpenStudent?: (studentId: string) => void
}

const ALL = '__all__'
const OUTSTANDING_REPORT_LIST_STATE_KEY = 'fees:reports:outstanding:list'

interface OutstandingReportListState {
  classId?: string
  sectionId?: string
  bucket?: string
  searchInput?: string
  search?: string
  page?: number
}

export function OutstandingTab({ academicYear, classes, sections, onOpenStudent }: OutstandingTabProps) {
  const savedListState = useAppStore((state) => state.pageState[OUTSTANDING_REPORT_LIST_STATE_KEY] as OutstandingReportListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [classId, setClassId] = useState<string>(savedListState?.classId ?? '')
  const [sectionId, setSectionId] = useState<string>(savedListState?.sectionId ?? '')
  const [bucket, setBucket] = useState<string>(savedListState?.bucket ?? 'all')
  const [search, setSearch] = useState(savedListState?.search ?? '')
  const [searchInput, setSearchInput] = useState(savedListState?.searchInput ?? '')
  const [page, setPage] = useState(savedListState?.page ?? 1)

  const filteredSections = useMemo(
    () => sections.filter(s => !classId || s.classId === classId || !s.classId),
    [sections, classId],
  )

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      const nextSearch = searchInput.trim()
      setSearch(nextSearch)
      setPageState(OUTSTANDING_REPORT_LIST_STATE_KEY, {
        classId,
        sectionId,
        bucket,
        searchInput,
        search: nextSearch,
        page: 1,
      })
    }, 300)
    return () => clearTimeout(t)
  }, [bucket, classId, searchInput, sectionId, setPageState])

  useEffect(() => {
    let alive = true

    const loadOutstanding = async () => {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        bucket,
      })
      if (academicYear) params.set('academicYear', academicYear)
      if (classId) params.set('classId', classId)
      if (sectionId) params.set('sectionId', sectionId)
      if (search) params.set('search', search)

      try {
        const response = await fetch(`/api/school/fees/reports/outstanding?${params}`, { credentials: 'include' })
        if (!response.ok) throw new Error('Failed to load')
        const nextData = await response.json()
        if (alive) setData(nextData)
      } catch (error) {
        if (alive) setError(error instanceof Error ? error.message : 'Failed to load')
      } finally {
        if (alive) setLoading(false)
      }
    }

    void loadOutstanding()

    return () => { alive = false }
  }, [academicYear, classId, sectionId, bucket, search, page])

  const t = data?.totals

  const rememberListState = (patch: Partial<OutstandingReportListState>) => {
    setPageState(OUTSTANDING_REPORT_LIST_STATE_KEY, {
      classId,
      sectionId,
      bucket,
      searchInput,
      search,
      page,
      ...patch,
    })
  }

  const handleClassChange = (value: string) => {
    const nextClassId = value === ALL ? '' : value
    setClassId(nextClassId)
    setSectionId('')
    setPage(1)
    rememberListState({ classId: nextClassId, sectionId: '', page: 1 })
  }

  const handleSectionChange = (value: string) => {
    const nextSectionId = value === ALL ? '' : value
    setSectionId(nextSectionId)
    setPage(1)
    rememberListState({ sectionId: nextSectionId, page: 1 })
  }

  const handleBucketChange = (value: string) => {
    setBucket(value)
    setPage(1)
    rememberListState({ bucket: value, page: 1 })
  }

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value)
    setPage(1)
    rememberListState({ searchInput: value, page: 1 })
  }

  const handlePageChange = (value: number) => {
    setPage(value)
    rememberListState({ page: value })
  }

  return (
    <div className="space-y-4">
      {/* Summary band */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Defaulters"
          value={loading ? '—' : t!.studentCount.toLocaleString('en-IN')}
          hint="Students with dues"
          icon={AlertTriangle}
          tone="warning"
          loading={loading}
        />
        <KpiCard
          label="0-30 days"
          value={loading ? '—' : formatCurrency(t!.buckets.b0_30)}
          tone="muted"
          loading={loading}
        />
        <KpiCard
          label="31-60 days"
          value={loading ? '—' : formatCurrency(t!.buckets.b31_60)}
          tone="warning"
          loading={loading}
        />
        <KpiCard
          label="61-90 days"
          value={loading ? '—' : formatCurrency(t!.buckets.b61_90)}
          tone="warning"
          loading={loading}
        />
        <KpiCard
          label="90+ days"
          value={loading ? '—' : formatCurrency(t!.buckets.b90_plus)}
          tone="danger"
          loading={loading}
        />
      </div>

      {/* Filters + Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="size-4 text-amber-600" />
              Outstanding by Student
              {data && (
                <Badge variant="secondary" className="ml-1 font-normal">
                  Total: {formatCurrency(t!.outstanding)}
                </Badge>
              )}
            </CardTitle>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={e => handleSearchInputChange(e.target.value)}
                placeholder="Search name or admission #"
                className="pl-8 h-9"
              />
            </div>

            <Select value={classId || ALL} onValueChange={handleClassChange}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="All classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All classes</SelectItem>
                {classes.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sectionId || ALL} onValueChange={handleSectionChange} disabled={!classId}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="All sections" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sections</SelectItem>
                {filteredSections.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={bucket} onValueChange={handleBucketChange}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any aging</SelectItem>
                <SelectItem value="b0_30">0-30 days</SelectItem>
                <SelectItem value="b31_60">31-60 days</SelectItem>
                <SelectItem value="b61_90">61-90 days</SelectItem>
                <SelectItem value="b90_plus">90+ days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
                  <TableHead className="text-xs">Student</TableHead>
                  <TableHead className="text-xs">Class</TableHead>
                  <TableHead className="text-xs text-right">Total Due</TableHead>
                  <TableHead className="text-xs text-right">0-30</TableHead>
                  <TableHead className="text-xs text-right">31-60</TableHead>
                  <TableHead className="text-xs text-right">61-90</TableHead>
                  <TableHead className="text-xs text-right">90+</TableHead>
                  <TableHead className="text-xs">Last Payment</TableHead>
                  <TableHead className="text-xs w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-red-600 py-8">
                      {error}
                    </TableCell>
                  </TableRow>
                ) : data && data.rows.length > 0 ? (
                  data.rows.map(r => (
                    <TableRow key={r.studentId} className="text-sm hover:bg-blue-50/40">
                      <TableCell className="py-2">
                        <div className="font-medium text-gray-900">{r.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.admissionNumber}
                          {r.rollNumber && ` · Roll ${r.rollNumber}`}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-xs">
                        {r.class?.name ?? '—'}
                        {r.section && <span className="text-muted-foreground"> · {r.section.name}</span>}
                      </TableCell>
                      <TableCell className="py-2 text-right font-semibold tabular-nums">
                        {formatCurrency(r.totalOutstanding)}
                      </TableCell>
                      <BucketCell value={r.buckets.b0_30} tone="muted" />
                      <BucketCell value={r.buckets.b31_60} tone="warning" />
                      <BucketCell value={r.buckets.b61_90} tone="warning" />
                      <BucketCell value={r.buckets.b90_plus} tone="danger" />
                      <TableCell className="py-2 text-xs text-muted-foreground">
                        {r.lastPaymentDate
                          ? new Date(r.lastPaymentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                          : <span className="italic">Never</span>}
                      </TableCell>
                      <TableCell className="py-2">
                        {onOpenStudent && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => onOpenStudent(r.studentId)}
                            title="Open statement"
                          >
                            <ExternalLink className="size-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-12">
                      No outstanding dues match these filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t text-xs">
              <div className="text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} students
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => handlePageChange(Math.max(1, page - 1))}
                  disabled={page === 1 || loading}
                >
                  <ChevronLeft className="size-3.5" /> Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => handlePageChange(Math.min(data.pagination.totalPages, page + 1))}
                  disabled={page === data.pagination.totalPages || loading}
                >
                  Next <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BucketCell({ value, tone }: { value: number; tone: 'muted' | 'warning' | 'danger' }) {
  const colorClass =
    value === 0 ? 'text-gray-300'
    : tone === 'danger' ? 'text-red-700 font-semibold'
    : tone === 'warning' ? 'text-amber-700 font-medium'
    : 'text-gray-700'
  return (
    <TableCell className={cn('py-2 text-right tabular-nums text-sm', colorClass)}>
      {value === 0 ? '—' : formatCurrency(value)}
    </TableCell>
  )
}
