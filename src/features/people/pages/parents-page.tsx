'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  Users,
  GraduationCap,
  Baby,
  Mail,
  MapPin,
  Phone,
  UserRound,
  School,
  Eye,
  Heart,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  List,
  Filter,
  Briefcase,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Student {
  id: string
  firstName: string
  lastName: string
  rollNumber?: string
  class?: { name: string }
  section?: { name: string }
}

interface ChildLink {
  id: string
  relation?: string
  student: Student
}

interface Parent {
  id: string
  fatherName: string
  motherName: string
  phone: string
  email: string
  occupation?: string
  children?: ChildLink[]
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatRelation(relation?: string): string {
  return relation || 'Student'
}

const RELATION_COLORS: Record<string, string> = {
  Father: 'border-sky-500/30 bg-gradient-to-r from-sky-500/10 to-primary/10 text-sky-700 dark:text-sky-300',
  Mother: 'border-rose-500/30 bg-gradient-to-r from-rose-500/10 to-pink-500/10 text-rose-700 dark:text-rose-300',
  Guardian: 'border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 text-violet-700 dark:text-violet-300',
}

const RELATION_DOTS: Record<string, string> = {
  Father: 'bg-sky-500',
  Mother: 'bg-rose-500',
  Guardian: 'bg-violet-500',
}

export function ParentsPage() {
  const { toast } = useToast()
  const [parents, setParents] = useState<Parent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null)
  const [showChildren, setShowChildren] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [quickFilter, setQuickFilter] = useState<'all' | 'phone' | 'email'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ parents: Parent[] }>('/api/school/parents')
      setParents(res.parents || [])
    } catch {
      toast({ title: 'Couldn\'t Load Parents', description: 'We couldn\'t load the parents. Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const totalChildren = parents.reduce((sum, p) => sum + (p.children?.length || 0), 0)

  const relationCounts = useMemo(() => {
    let father = 0
    let mother = 0
    let guardian = 0
    for (const p of parents) {
      for (const c of p.children || []) {
        const rel = formatRelation(c.relation)
        if (rel === 'Father') father++
        else if (rel === 'Mother') mother++
        else guardian++
      }
    }
    return { father, mother, guardian }
  }, [parents])

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return parents.filter((p) => {
      if (quickFilter === 'phone' && !p.phone) return false
      if (quickFilter === 'email' && !p.email) return false
      if (!q) return true
      return [p.fatherName, p.motherName, p.phone, p.email, p.occupation]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    })
  }, [parents, searchQuery, quickFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const paginated = filtered.slice(start, start + pageSize)

  const hasActiveFilters = !!searchQuery || quickFilter !== 'all'

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setPage(1)
  }

  const handleQuickFilter = (value: 'all' | 'phone' | 'email') => {
    setQuickFilter(value)
    setPage(1)
  }

  const clearFilters = () => {
    setSearchQuery('')
    setQuickFilter('all')
    setPage(1)
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      {/* ── Branded Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15">
        <div aria-hidden className="absolute -top-14 right-1/3 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute -bottom-16 right-1/4 size-28 rounded-full bg-amber-300/10 blur-sm" />
        <div aria-hidden className="absolute left-1/3 top-0 h-px w-48 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md shadow-black/10 backdrop-blur-sm">
            <Users className="size-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Parents</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                {parents.length} parent{parents.length !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">
              Parent and guardian records — search, review contact details and linked children.
            </p>
          </div>
        </div>
      </section>

      {/* ── Summary Stats ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {/* Total parents */}
        <div className="flex items-center gap-2.5 rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm">
            <Users className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total parents</p>
            <p className="text-lg font-bold leading-tight text-sky-700 dark:text-sky-300">{parents.length.toLocaleString()}</p>
          </div>
        </div>

        {/* Total children */}
        <div className="flex items-center gap-2.5 rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-fuchsia-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-sm">
            <Baby className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total children</p>
            <p className="text-lg font-bold leading-tight text-violet-700 dark:text-violet-300">{totalChildren.toLocaleString()}</p>
          </div>
        </div>

        {/* Avg children */}
        <div className="col-span-2 flex items-center gap-2.5 rounded-xl border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-teal-500/25 dark:from-teal-500/15 dark:via-card dark:to-cyan-500/10 md:col-span-1">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
            <Heart className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Avg. children</p>
            <p className="text-lg font-bold leading-tight text-teal-700 dark:text-teal-300">
              {parents.length ? (totalChildren / parents.length).toFixed(1) : '0'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Configuration Bar ───────────────────────────────────────── */}
      <Card className="gap-0 overflow-hidden border-teal-200/80 bg-gradient-to-r from-teal-50 via-white to-sky-50 py-0 shadow-sm dark:border-teal-500/25 dark:from-teal-500/12 dark:via-card dark:to-sky-500/10">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* Search */}
            <div className="col-span-2 space-y-1 sm:col-span-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Father, mother, phone, email…"
                  className="h-10 w-full bg-white pl-8 pr-8 text-sm shadow-sm dark:bg-input/30 sm:h-9 sm:text-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => handleSearchChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Page size */}
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rows per page</Label>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
                <SelectTrigger
                  leadingIcon={<List className="size-3.5 text-white" />}
                  leadingIconClassName="from-sky-500 to-cyan-600"
                  className="h-10 w-full border-sky-200 from-sky-50 via-white to-cyan-50 px-2 text-sm shadow-sm focus:border-sky-400 focus:ring-sky-400/20 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-input/30 dark:to-cyan-500/10 sm:h-9 sm:text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64 border-sky-200/80 bg-white shadow-lg dark:border-sky-500/25 dark:bg-popover">
                  {[10, 25, 50, 100].map((size) => (
                    <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quick filters */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Filter className="size-3" />
                Quick:
              </span>
              <QuickFilter active={quickFilter === 'phone'} tone="success" onClick={() => handleQuickFilter(quickFilter === 'phone' ? 'all' : 'phone')}>
                Has phone
              </QuickFilter>
              <QuickFilter active={quickFilter === 'email'} tone="warn" onClick={() => handleQuickFilter(quickFilter === 'email' ? 'all' : 'email')}>
                Has email
              </QuickFilter>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3" />
                  Clear
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Parent Records List Card ────────────────────────────────── */}
      {parents.length === 0 ? (
        <EmptyState icon={Users} title="No Parents" description="Parent records will appear when students are enrolled." />
      ) : (
        <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
          {/* Header band */}
          <div className="border-b border-sky-200/70 bg-gradient-to-r from-sky-100/80 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
                  <Users className="size-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">Parent records</h3>
                  <p className="text-[10px] text-muted-foreground">Click a parent to view their linked children</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="h-5 text-[10px]">
                  {filtered.length.toLocaleString()} parents
                </Badge>
              </div>
            </div>
          </div>

          {paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-3 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-500/20 dark:to-cyan-500/20">
                <Users className="size-5 text-teal-600 dark:text-teal-300" />
              </span>
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold">No parents found</h3>
                <p className="mx-auto max-w-xs text-xs text-muted-foreground">
                  {hasActiveFilters
                    ? 'No parents match the current search or filters. Try widening them.'
                    : 'No parent records are available yet.'}
                </p>
              </div>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="mt-2 h-8 gap-1.5 px-4 text-xs">
                  <X className="size-3.5" /> Clear filters
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-sky-500/[0.06] via-primary/[0.04] to-violet-500/[0.06] hover:from-sky-500/[0.06] hover:via-primary/[0.04] hover:to-violet-500/[0.06]">
                      <TableHead className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Father</TableHead>
                      <TableHead className="w-[180px] py-3 text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">Mother</TableHead>
                      <TableHead className="w-[160px] py-3 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Phone</TableHead>
                      <TableHead className="hidden py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300 lg:table-cell">Email</TableHead>
                      <TableHead className="w-[130px] py-3 text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Children</TableHead>
                      <TableHead className="w-12 py-3" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((parent, idx) => (
                      <TableRow
                        key={parent.id}
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-sky-500/[0.04]',
                          idx % 2 === 0 ? 'bg-transparent' : 'bg-sky-500/[0.02]',
                        )}
                        onClick={() => { setSelectedParent(parent); setShowChildren(true) }}
                      >
                        <TableCell className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="size-9 shrink-0 border-2 border-sky-500/25 shadow-sm">
                              <AvatarFallback className="bg-gradient-to-br from-sky-500 to-primary text-[10px] font-bold text-white">
                                {getInitials(parent.fatherName || 'F')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">{parent.fatherName || '-'}</p>
                              {parent.occupation && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Briefcase className="size-3" />
                                  {parent.occupation}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="size-9 shrink-0 border-2 border-rose-500/25 shadow-sm">
                              <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-500 text-[10px] font-bold text-white">
                                {getInitials(parent.motherName || 'M')}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate text-sm font-semibold text-foreground">{parent.motherName || '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          {parent.phone ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-gradient-to-r from-amber-500/8 to-rose-500/8 px-2.5 py-1 font-mono text-xs font-bold text-amber-700 shadow-sm dark:text-amber-300">
                              <Phone className="size-3.5" />
                              {parent.phone}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40 italic">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden py-3 lg:table-cell">
                          {parent.email ? (
                            <span className="inline-flex items-center gap-1.5 text-sm text-foreground/70">
                              <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-sm shadow-sky-500/20">
                                <Mail className="size-3.5" />
                              </span>
                              <span className="truncate max-w-[200px]">{parent.email}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/40 italic">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/20 bg-gradient-to-r from-violet-500/8 to-fuchsia-500/8 px-2.5 py-1 text-xs font-bold text-violet-700 shadow-sm dark:text-violet-300">
                            <Baby className="size-3.5" />
                            {parent.children?.length || 0}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8 transition-all hover:scale-110 hover:bg-primary/5">
                                <MoreHorizontal className="size-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 border-primary/10 shadow-xl">
                              <DropdownMenuLabel className="text-xs font-bold text-foreground/80">Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => { setSelectedParent(parent); setShowChildren(true) }}
                                className="gap-2.5 text-violet-700 focus:text-violet-700 dark:text-violet-400 dark:focus:text-violet-400"
                              >
                                <Eye className="size-4" /> View Children
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="space-y-2 p-3 md:hidden">
                {paginated.map((parent) => (
                  <div
                    key={parent.id}
                    className="flex items-center gap-3 rounded-xl border border-sky-200/70 bg-gradient-to-br from-white via-white to-sky-50 p-3 shadow-sm transition-all hover:shadow-md dark:border-sky-500/20 dark:from-card dark:via-card dark:to-sky-500/10"
                  >
                    <button
                      onClick={() => { setSelectedParent(parent); setShowChildren(true) }}
                      className="flex flex-1 items-center gap-3 text-left min-w-0"
                    >
                      <Avatar className="size-9 shrink-0 border-2 border-primary/15 shadow-sm">
                        <AvatarFallback className="bg-gradient-to-br from-primary to-teal-600 text-[10px] font-bold text-white">
                          {getInitials(parent.fatherName || 'P')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-bold text-foreground">{parent.fatherName || parent.motherName || 'Parent'}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-gradient-to-r from-amber-500/8 to-rose-500/8 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300">
                            <Phone className="size-2.5" />
                            {parent.phone}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/20 bg-gradient-to-r from-violet-500/8 to-fuchsia-500/8 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300">
                            <Baby className="size-2.5" />
                            {parent.children?.length || 0}
                          </span>
                        </div>
                      </div>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0 transition-all hover:scale-110 hover:bg-primary/5">
                          <MoreHorizontal className="size-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 border-primary/10 shadow-xl">
                        <DropdownMenuLabel className="text-xs font-bold text-foreground/80">Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => { setSelectedParent(parent); setShowChildren(true) }}
                          className="gap-2.5 text-violet-700 focus:text-violet-700 dark:text-violet-400 dark:focus:text-violet-400"
                        >
                          <Eye className="size-4" /> View Children
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>

              {/* Footer legend */}
              <div className="flex flex-col gap-3 border-t border-sky-200/70 bg-gradient-to-r from-sky-100/70 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5 md:flex-row md:items-center md:justify-between">
                <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-[11px] text-muted-foreground sm:flex sm:items-center sm:gap-4">
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-sky-500" />
                    Fathers: <strong className="text-foreground">{relationCounts.father.toLocaleString()}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-rose-500" />
                    Mothers: <strong className="text-foreground">{relationCounts.mother.toLocaleString()}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2 rounded-full bg-violet-500" />
                    Guardians: <strong className="text-foreground">{relationCounts.guardian.toLocaleString()}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-teal-700 dark:text-teal-300">
                  <GraduationCap className="size-3.5" />
                  Click any parent to review their children
                </div>
              </div>

              {/* Pagination */}
              <Pagination
                page={safePage}
                pageSize={pageSize}
                total={filtered.length}
                totalPages={totalPages}
                start={start}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
              />
            </>
          )}
        </Card>
      )}

      {/* ── Children Dialog ─────────────────────────────────────────── */}
      <Dialog open={showChildren} onOpenChange={setShowChildren}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-teal-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <GraduationCap className="size-5 text-white" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold tracking-normal text-white">Children of {selectedParent?.fatherName || 'Parent'}</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  {selectedParent?.children?.length || 0} student{selectedParent?.children?.length !== 1 ? 's' : ''} linked{selectedParent?.motherName ? ` · ${selectedParent.motherName}` : ''}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.055] p-4 sm:p-5">
            {selectedParent?.children && selectedParent.children.length > 0 ? (
              selectedParent.children.map((link) => {
                const rel = formatRelation(link.relation)
                return (
                  <section
                    key={link.id}
                    className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10"
                  >
                    <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
                    <div className="relative flex items-center gap-4">
                      <Avatar className="size-12 shrink-0 border-2 border-sky-500/25 shadow-sm">
                        <AvatarFallback className="bg-gradient-to-br from-sky-500 to-primary text-xs font-bold text-white">
                          {getInitials(link.student.firstName + ' ' + link.student.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-base font-bold text-foreground">
                            {link.student.firstName} {link.student.lastName}
                          </p>
                          <Badge className={cn(
                            'shrink-0 h-5 text-[10px] px-2 font-bold gap-1.5 shadow-sm',
                            RELATION_COLORS[rel] || 'border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 text-violet-700 dark:text-violet-300'
                          )}>
                            <span className={cn('size-1.5 rounded-full', RELATION_DOTS[rel] || 'bg-violet-500')} />
                            {rel}
                          </Badge>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/15 bg-gradient-to-r from-sky-500/5 to-primary/5 px-2 py-0.5 font-medium text-sky-700 dark:text-sky-300">
                            <School className="size-3" />
                            {link.student.class?.name || 'Class -'}
                          </span>
                          {link.student.section && (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/15 bg-gradient-to-r from-amber-500/5 to-rose-500/5 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                              <UserRound className="size-3" />
                              {link.student.section.name}
                            </span>
                          )}
                          {link.student.rollNumber && (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-violet-500/15 bg-gradient-to-r from-violet-500/5 to-fuchsia-500/5 px-2 py-0.5 font-mono font-medium text-violet-700 dark:text-violet-300">
                              <MapPin className="size-3" />
                              Roll: {link.student.rollNumber}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                )
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <span className="mb-4 flex size-16 items-center justify-center rounded-2xl border-2 border-primary/10 bg-gradient-to-br from-primary/[0.06] to-cyan-500/[0.06] shadow-sm">
                  <Baby className="size-8 text-primary/40" />
                </span>
                <h3 className="text-base font-bold text-foreground">No children linked</h3>
                <p className="mt-1 text-sm text-muted-foreground">This parent has no student records linked to their account.</p>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={() => setShowChildren(false)}>
              <X className="size-3.5" /> Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Shared layout primitives ───────────────────────────────────────────────

function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  start,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: number
  total: number
  totalPages: number
  start: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const from = total === 0 ? 0 : start + 1
  const to = Math.min(start + pageSize, total)

  const getPageNumbers = (): (number | 'ellipsis-start' | 'ellipsis-end')[] => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    if (page <= 3) {
      return [1, 2, 3, 4, 'ellipsis-end', totalPages]
    }
    if (page >= totalPages - 2) {
      return [1, 'ellipsis-start', totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    }
    return [1, 'ellipsis-start', page - 1, page, page + 1, 'ellipsis-end', totalPages]
  }

  const pageNumbers = getPageNumbers()

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Rows per page:</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[70px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50, 100].map((size) => (
              <SelectItem key={size} value={String(size)}>{size}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-2">
          Showing {from} to {to} of {total} parents
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="size-4" />
        </Button>
        {pageNumbers.map((p, i) => {
          if (p === 'ellipsis-start' || p === 'ellipsis-end') {
            return (
              <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground">
                ...
              </span>
            )
          }
          return (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="icon"
              className="size-8 text-xs"
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          )
        })}
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function QuickFilter({
  active,
  onClick,
  tone = 'neutral',
  children,
}: {
  active: boolean
  onClick: () => void
  tone?: 'neutral' | 'success' | 'warn' | 'error'
  children: React.ReactNode
}) {
  const activeClasses = {
    neutral: 'bg-primary text-primary-foreground hover:bg-primary/90',
    success: 'bg-emerald-600 text-white hover:bg-emerald-600/90',
    warn: 'bg-amber-500 text-white hover:bg-amber-500/90',
    error: 'bg-rose-500 text-white hover:bg-rose-500/90',
  }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-2 py-0.5 text-[11px] font-medium transition',
        active ? activeClasses : 'border bg-background text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}