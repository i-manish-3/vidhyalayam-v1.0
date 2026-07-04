'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { LoadingState, EmptyState } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  GraduationCap,
  Search,
  Eye,
  Phone,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
  Users,
  LogOut,
  CalendarDays,
  type LucideIcon,
} from 'lucide-react'

// ── Types ───────────────────────────────────────────────────────────────────
interface Alumnus {
  id: string
  name: string
  firstName: string
  lastName: string
  admissionNumber: string | null
  rollNumber: string | null
  gender: string | null
  admissionStatus: string
  profileImage: string | null
  className: string | null
  sectionName: string | null
  parentName: string | null
  parentPhone: string | null
  leavingType: string // PASSOUT | TC | DROPOUT | TRANSFER | COMPLETED | OTHER
  leavingYear: string | null
  leavingDate: string | null
  leavingNotes: string | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface AlumniStats {
  total: number
  passout: number
  withdrawn: number
}

interface AlumniResponse {
  alumni: Alumnus[]
  stats: AlumniStats
  pagination: Pagination
}

// ── Constants ────────────────────────────────────────────────────────────────
const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All alumni' },
  { value: 'passout', label: 'Passout' },
  { value: 'tc', label: 'TC (Transfer Certificate)' },
  { value: 'dropout', label: 'Dropout' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'completed', label: 'Completed' },
  { value: 'other', label: 'Other' },
]

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'

const LEAVING_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  PASSOUT: { label: 'Passout', variant: 'success' },
  TC: { label: 'TC', variant: 'info' },
  DROPOUT: { label: 'Dropout', variant: 'destructive' },
  TRANSFER: { label: 'Transfer', variant: 'warning' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  OTHER: { label: 'Other', variant: 'secondary' },
}

const PAGE_SIZES = ['10', '20', '50', '100']
const SEARCH_DEBOUNCE_MS = 350

function leavingBadge(type: string) {
  return LEAVING_BADGE[type] || { label: type || '—', variant: 'secondary' as BadgeVariant }
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function initials(first: string, last: string): string {
  return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase() || '?'
}

// ── Component ────────────────────────────────────────────────────────────────
export function AlumniPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [alumni, setAlumni] = useState<Alumnus[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [stats, setStats] = useState<AlumniStats>({ total: 0, passout: 0, withdrawn: 0 })
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 })

  const [classes, setClasses] = useState<{ id: string; name: string }[]>([])
  const [years, setYears] = useState<string[]>([])

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [classFilter, setClassFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [pageSize, setPageSize] = useState('20')
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)

  // Debounce the search box so we don't fire a request per keystroke.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  const buildParams = useCallback(
    (overrides?: Record<string, string>): Record<string, string> => {
      const params: Record<string, string> = {
        page: String(page),
        limit: pageSize,
        type: typeFilter,
      }
      if (search) params.search = search
      if (classFilter !== 'all') params.classId = classFilter
      if (yearFilter !== 'all') params.year = yearFilter
      return { ...params, ...overrides }
    },
    [page, pageSize, typeFilter, search, classFilter, yearFilter]
  )

  const fetchAlumni = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<AlumniResponse>('/api/school/alumni', buildParams())
      setAlumni(Array.isArray(data?.alumni) ? data.alumni : [])
      if (data?.stats) setStats(data.stats)
      if (data?.pagination) setPagination(data.pagination)
      setLoadError(false)
    } catch {
      toast({ title: 'Could not load alumni', description: 'Please try again.', variant: 'destructive' })
      setAlumni([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [buildParams, toast])

  useEffect(() => {
    fetchAlumni()
  }, [fetchAlumni])

  // Filter option sources (best-effort; failures are non-fatal).
  useEffect(() => {
    api
      .get<{ classes: { id: string; name: string }[] }>('/api/school/classes', undefined, { skipLogoutOn401: true })
      .then((d) => setClasses(Array.isArray(d?.classes) ? d.classes : []))
      .catch(() => setClasses([]))
    api
      .get<{ academicYears: string[] }>('/api/school/academic-years', undefined, { skipLogoutOn401: true })
      .then((d) => setYears(Array.isArray(d?.academicYears) ? d.academicYears : []))
      .catch(() => setYears([]))
  }, [])

  const hasActiveFilters = useMemo(
    () => Boolean(search) || typeFilter !== 'all' || classFilter !== 'all' || yearFilter !== 'all',
    [search, typeFilter, classFilter, yearFilter]
  )

  const clearFilters = () => {
    setSearchInput('')
    setSearch('')
    setTypeFilter('all')
    setClassFilter('all')
    setYearFilter('all')
    setPage(1)
  }

  // CSV export pulls every matching row (looping pages), not just the page view.
  const handleExport = async () => {
    setExporting(true)
    try {
      const rows: Alumnus[] = []
      let current = 1
      let totalPages = 1
      do {
        const data = await api.get<AlumniResponse>(
          '/api/school/alumni',
          buildParams({ page: String(current), limit: '100' })
        )
        rows.push(...(data?.alumni || []))
        totalPages = data?.pagination?.totalPages || 1
        current += 1
      } while (current <= totalPages && current <= 100) // hard safety cap

      if (rows.length === 0) {
        toast({ title: 'Nothing to export', description: 'No alumni match the current filters.' })
        return
      }

      const truncated = totalPages > 100
      const header = ['Name', 'Admission No', 'Last Class', 'Section', 'Type', 'Batch/Year', 'Leaving Date', 'Parent', 'Phone']
      const escape = (v: string | null) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const csv = [
        header.join(','),
        ...rows.map((r) =>
          [
            r.name,
            r.admissionNumber,
            r.className,
            r.sectionName,
            leavingBadge(r.leavingType).label,
            r.leavingYear,
            r.leavingDate ? formatDate(r.leavingDate) : '',
            r.parentName,
            r.parentPhone,
          ]
            .map(escape)
            .join(',')
        ),
      ].join('\n')

      const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `alumni-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)

      if (truncated) {
        toast({
          title: 'Export truncated',
          description: `Only the first ${rows.length} alumni were exported. Narrow with type/class/year filters.`,
          variant: 'destructive',
        })
      } else {
        toast({ title: 'Export ready', description: `${rows.length} alumni exported.` })
      }
    } catch {
      toast({ title: 'Export failed', description: 'Please try again.', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const totalPages = pagination.totalPages
  const showingFrom = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1
  const showingTo = Math.min(pagination.page * pagination.limit, pagination.total)

  if (loading && alumni.length === 0 && !loadError) return <LoadingState />

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-10 -top-12 size-36 rounded-full border-[18px] border-white/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <GraduationCap className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Alumni</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85">{stats.total.toLocaleString('en-IN')} records</span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">Passed-out students and everyone who left with a TC or withdrawal</p>
          </div>
        </div>
        <Button
          variant="secondary"
          className="relative shrink-0 gap-2 border border-white/60 shadow-md"
          style={{ backgroundColor: 'white', color: 'var(--primary)' }}
          onClick={handleExport}
          disabled={exporting || pagination.total === 0}
        >
          {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-2 sm:grid-cols-3">
        <AlumniStatCard title="Total Alumni" value={stats.total} description="Passout + withdrawals" icon={GraduationCap} tone="violet" />
        <AlumniStatCard title="Passout" value={stats.passout} description="Completed & promoted out" icon={Users} tone="emerald" />
        <AlumniStatCard title="Left (TC / Withdrawal)" value={stats.withdrawn} description="Transfer, dropout & more" icon={LogOut} tone="amber" />
      </div>

      {/* Directory */}
      <Card className="gap-0 overflow-hidden border-cyan-200/80 bg-gradient-to-br from-white via-white to-cyan-50 py-0 shadow-sm dark:border-cyan-500/25 dark:from-card dark:via-card dark:to-cyan-500/10">
        <CardHeader className="border-b border-cyan-500/15 bg-gradient-to-r from-cyan-500/10 via-primary/5 to-violet-500/10 px-4 py-3">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-primary text-white shadow-sm shadow-cyan-500/20">
                <GraduationCap className="size-4" />
              </span>
              Alumni Directory
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  placeholder="Search name, adm no, roll..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="h-9 w-full bg-background/90 pl-9 shadow-sm sm:w-56"
                />
              </div>
              <Button variant="outline" size="sm" className="h-9 gap-1" onClick={() => setShowFilters((v) => !v)}>
                <ChevronDown className={`size-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                Filters
              </Button>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="text-destructive h-9" onClick={clearFilters}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Filter row */}
          {showFilters && (
            <div className="grid grid-cols-2 gap-2 border-b border-cyan-500/10 bg-gradient-to-r from-cyan-500/[0.045] via-transparent to-violet-500/[0.045] px-4 py-3 sm:grid-cols-3">
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setPage(1) }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setPage(1) }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Table */}
          {loadError ? (
            <div className="py-8">
              <EmptyState
                icon={GraduationCap}
                title="Couldn’t load alumni"
                description="Something went wrong while fetching the directory. Please retry."
                action={{ label: 'Retry', onClick: () => fetchAlumni() }}
              />
            </div>
          ) : alumni.length === 0 && !loading ? (
            <div className="py-8">
              <EmptyState
                icon={GraduationCap}
                title="No alumni found"
                description={hasActiveFilters ? 'Try adjusting your filters.' : 'Students appear here once they pass out or leave with a TC/withdrawal.'}
              />
            </div>
          ) : (
            <div className="relative overflow-x-auto">
              {loading && (
                <div className="bg-background/60 absolute inset-0 z-10 grid place-items-center">
                  <Loader2 className="text-muted-foreground size-5 animate-spin" />
                </div>
              )}
              <Table>
                <TableHeader className="bg-gradient-to-r from-cyan-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Last Class</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Batch / Year</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alumni.map((a) => {
                    const badge = leavingBadge(a.leavingType)
                    return (
                      <TableRow key={a.id} className="transition-colors hover:bg-cyan-500/[0.05]">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-semibold">
                              {a.profileImage && /^https?:\/\//.test(a.profileImage) ? (
                                <img src={a.profileImage} alt={a.name} className="size-full object-cover" />
                              ) : (
                                initials(a.firstName, a.lastName)
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium">{a.name}</div>
                              <div className="text-muted-foreground text-xs">
                                {a.admissionNumber ? `Adm #${a.admissionNumber}` : a.rollNumber ? `Roll ${a.rollNumber}` : '—'}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {a.className ? `${a.className}${a.sectionName ? ` · ${a.sectionName}` : ''}` : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant} className="text-[11px]">{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="text-muted-foreground size-3.5" />
                            {a.leavingYear || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {a.parentName || a.parentPhone ? (
                            <div className="min-w-0">
                              <div className="truncate text-sm">{a.parentName || '—'}</div>
                              {a.parentPhone && (
                                <a href={`tel:${a.parentPhone}`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs">
                                  <Phone className="size-3" />{a.parentPhone}
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.push(`/students/${a.id}`)}>
                            <Eye className="size-4" />View
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination footer */}
          {!loadError && pagination.total > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row">
              <div className="flex items-center gap-3">
                <p className="text-muted-foreground text-sm">
                  Showing <span className="text-foreground font-medium">{showingFrom}</span>–
                  <span className="text-foreground font-medium">{showingTo}</span> of{' '}
                  <span className="text-foreground font-medium">{pagination.total}</span>
                </p>
                <Select value={pageSize} onValueChange={(v) => { setPageSize(v); setPage(1) }}>
                  <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((s) => <SelectItem key={s} value={s}>{s} / page</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 gap-1" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft className="size-4" /> Prev
                </Button>
                <span className="px-3 text-sm tabular-nums">Page {pagination.page} / {totalPages}</span>
                <Button variant="outline" size="sm" className="h-8 gap-1" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AlumniStatCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string
  value: number
  description: string
  icon: LucideIcon
  tone: 'violet' | 'emerald' | 'amber'
}) {
  const styles = {
    violet: {
      card: 'border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 dark:border-violet-500/25 dark:from-violet-500/10 dark:via-card dark:to-fuchsia-500/10',
      icon: 'bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-violet-500/20',
      accent: 'from-violet-500 via-fuchsia-400',
      bubble: 'bg-violet-300/20 dark:bg-violet-500/10',
    },
    emerald: {
      card: 'border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:border-emerald-500/25 dark:from-emerald-500/10 dark:via-card dark:to-teal-500/10',
      icon: 'bg-gradient-to-br from-emerald-500 to-teal-500 shadow-emerald-500/20',
      accent: 'from-emerald-500 via-teal-400',
      bubble: 'bg-emerald-300/20 dark:bg-emerald-500/10',
    },
    amber: {
      card: 'border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:border-amber-500/25 dark:from-amber-500/10 dark:via-card dark:to-orange-500/10',
      icon: 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/20',
      accent: 'from-amber-500 via-orange-400',
      bubble: 'bg-amber-300/20 dark:bg-amber-500/10',
    },
  }[tone]

  return (
    <Card className={`group relative overflow-hidden py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${styles.card}`}>
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent ${styles.accent}`} />
      <div aria-hidden className={`absolute -bottom-6 -right-4 size-16 rounded-full transition-transform group-hover:scale-125 ${styles.bubble}`} />
      <CardContent className="relative flex items-center justify-between p-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-muted-foreground">{title}</p>
          <p className="text-xl font-bold tabular-nums">{value}</p>
          <p className="truncate text-[10px] text-muted-foreground">{description}</p>
        </div>
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm ${styles.icon}`}>
          <Icon className="size-4" />
        </span>
      </CardContent>
    </Card>
  )
}
