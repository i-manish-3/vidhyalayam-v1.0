'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
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

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return parents
    return parents.filter((p) =>
      [p.fatherName, p.motherName, p.phone, p.email, p.occupation]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    )
  }, [parents, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const paginated = filtered.slice(start, start + pageSize)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setPage(1)
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      {/* Gradient Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-6 py-6 text-white shadow-lg">
        <div aria-hidden className="absolute -right-10 -top-10 size-36 rounded-full border-[20px] border-cyan-200/15" />
        <div aria-hidden className="absolute -bottom-8 right-16 size-20 rounded-full bg-cyan-300/8" />
        <div aria-hidden className="absolute left-12 top-4 size-16 rounded-full bg-white/5 blur-md" />
        <div aria-hidden className="absolute bottom-0 left-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <div className="relative flex items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-md backdrop-blur-sm">
            <Users className="size-6 text-white" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Parents</h1>
            <p className="mt-1 text-sm text-white/75">{parents.length} parent{parents.length !== 1 ? 's' : ''} in the school</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="group relative overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] via-card to-primary/[0.03] p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/30">
          <div aria-hidden className="absolute -right-5 -top-5 size-20 rounded-full border-[14px] border-primary/5 transition-all group-hover:scale-110" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-teal-600 text-white shadow-sm shadow-primary/20 transition-all group-hover:scale-110 group-hover:shadow-md">
              <Users className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Parents</p>
              <p className="mt-0.5 text-2xl font-bold">{parents.length}</p>
            </div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.07] via-card to-violet-500/[0.03] p-4 shadow-sm transition-all hover:shadow-md hover:border-violet-500/40">
          <div aria-hidden className="absolute -right-5 -top-5 size-20 rounded-full border-[14px] border-violet-500/5 transition-all group-hover:scale-110" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/20 transition-all group-hover:scale-110 group-hover:shadow-md">
              <Baby className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Children</p>
              <p className="mt-0.5 text-2xl font-bold text-violet-600 dark:text-violet-400">{totalChildren}</p>
            </div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.07] via-card to-sky-500/[0.03] p-4 shadow-sm transition-all hover:shadow-md hover:border-sky-500/40">
          <div aria-hidden className="absolute -right-5 -top-5 size-20 rounded-full border-[14px] border-sky-500/5 transition-all group-hover:scale-110" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-sm shadow-sky-500/20 transition-all group-hover:scale-110 group-hover:shadow-md">
              <Heart className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Avg. Children</p>
              <p className="mt-0.5 text-2xl font-bold text-sky-600 dark:text-sky-400">
                {parents.length ? (totalChildren / parents.length).toFixed(1) : '0'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Table Card */}
      {parents.length === 0 ? (
        <EmptyState icon={Users} title="No Parents" description="Parent records will appear when students are enrolled." />
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-card via-card to-sky-500/[0.02] shadow-sm">
          <div aria-hidden className="absolute -right-6 -top-6 size-20 rounded-full border-[14px] border-primary/5" />

          {/* Table Header */}
          <div className="relative border-b border-primary/10 bg-gradient-to-r from-primary/[0.06] via-teal-600/[0.04] to-cyan-600/[0.05] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-teal-600 text-white shadow-sm shadow-primary/20">
                  <Users className="size-4" />
                </span>
                <span className="text-sm font-bold">Parent Records</span>
                <Badge variant="secondary" className="h-5 gap-1 border-primary/20 bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                  {filtered.length}
                </Badge>
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">
                {filtered.length} parent{filtered.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative border-b border-primary/5 bg-gradient-to-r from-primary/[0.02] via-background to-cyan-500/[0.02] px-4 py-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by father, mother, phone, email..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-9 border-primary/15 bg-background pl-9 pr-9 text-sm transition-all focus-visible:border-primary/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
              <span className="mb-4 flex size-14 items-center justify-center rounded-2xl border-2 border-primary/15 bg-gradient-to-br from-primary/[0.06] to-cyan-500/[0.06] shadow-sm">
                <Users className="size-7 text-primary/50" />
              </span>
              <h3 className="text-base font-semibold text-foreground">No Parents Found</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {searchQuery ? 'No parents match your search.' : 'No parent records available.'}
              </p>
              {searchQuery && (
                <Button variant="outline" size="sm" onClick={() => handleSearchChange('')} className="mt-3 gap-1.5">
                  <X className="size-3.5" /> Clear search
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-violet-500/[0.06] via-fuchsia-500/[0.04] to-cyan-500/[0.06] hover:from-violet-500/[0.06] hover:via-fuchsia-500/[0.04] hover:to-cyan-500/[0.06]">
                      <TableHead className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Father</TableHead>
                      <TableHead className="w-[180px] py-3 text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">Mother</TableHead>
                      <TableHead className="w-[160px] py-3 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Phone</TableHead>
                      <TableHead className="hidden py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300 lg:table-cell">Email</TableHead>
                      <TableHead className="w-[130px] py-3 text-[11px] font-bold uppercase tracking-wider text-fuchsia-700 dark:text-fuchsia-300">Children</TableHead>
                      <TableHead className="w-12 py-3" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((parent, idx) => (
                      <TableRow
                        key={parent.id}
                        className={cn(
                          'cursor-pointer transition-all duration-150',
                          idx % 2 === 0
                            ? 'bg-gradient-to-br from-background via-background to-primary/[0.01]'
                            : 'bg-gradient-to-br from-violet-500/[0.02] via-background to-rose-500/[0.02]',
                          'hover:shadow-sm hover:brightness-[1.02]'
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
                              <p className="truncate text-sm font-bold text-foreground">{parent.fatherName || '-'}</p>
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
                            <span className="truncate text-sm font-bold text-foreground">{parent.motherName || '-'}</span>
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
                    className="flex items-center gap-3 rounded-xl border border-primary/10 bg-gradient-to-br from-card via-card to-primary/[0.02] p-3 transition-all hover:shadow-md"
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

              {/* Pagination */}
              <div className="flex flex-col items-center justify-between gap-3 border-t border-primary/10 bg-gradient-to-r from-primary/[0.02] via-background to-cyan-500/[0.02] px-4 py-3 sm:flex-row">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Rows per page:</span>
                  <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
                    <SelectTrigger className="h-8 w-[70px] border-primary/15 text-xs font-medium shadow-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 25, 50, 100].map((size) => (
                        <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="ml-2 text-xs font-medium text-muted-foreground">
                    <span className="text-foreground/80">{start + 1}</span>–<span className="text-foreground/80">{Math.min(start + pageSize, filtered.length)}</span>
                    <span className="text-muted-foreground"> of </span>
                    <span className="text-foreground/80">{filtered.length}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8 border-primary/15 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                    onClick={() => setPage(safePage - 1)}
                    disabled={safePage <= 1}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (safePage <= 3) {
                      pageNum = i + 1
                    } else if (safePage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = safePage - 2 + i
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={pageNum === safePage ? 'default' : 'outline'}
                        size="icon"
                        className={cn(
                          'size-8 text-xs font-bold shadow-sm transition-all',
                          pageNum === safePage
                            ? 'bg-gradient-to-br from-primary to-teal-600 text-white shadow-primary/20 hover:from-primary/90 hover:to-teal-600/90'
                            : 'border-primary/15 hover:border-primary/30 hover:shadow-md'
                        )}
                        onClick={() => setPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8 border-primary/15 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                    onClick={() => setPage(safePage + 1)}
                    disabled={safePage >= totalPages}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Children Dialog */}
      <Dialog open={showChildren} onOpenChange={setShowChildren}>
        <DialogContent className="gap-0 overflow-hidden border-0 p-0 shadow-2xl shadow-primary/20 sm:max-w-xl">
          <div className="relative bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-6 py-5 text-white">
            <div aria-hidden className="absolute -right-8 -top-8 size-28 rounded-full border-[18px] border-cyan-200/15" />
            <div aria-hidden className="absolute -bottom-8 right-14 size-20 rounded-full bg-cyan-300/8" />
            <div aria-hidden className="absolute left-10 top-3 size-12 rounded-full bg-white/5 blur-md" />
            <div aria-hidden className="absolute bottom-0 left-1/3 h-px w-28 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            <div className="relative flex items-center gap-4">
              <Avatar className="size-12 shrink-0 border-2 border-white/30 shadow-lg">
                <AvatarFallback className="bg-white/20 text-sm font-bold text-white backdrop-blur-sm">
                  {getInitials(selectedParent?.fatherName || 'P')}
                </AvatarFallback>
              </Avatar>
              <div>
                <DialogTitle className="text-lg font-bold text-white">Children of {selectedParent?.fatherName || 'Parent'}</DialogTitle>
                <DialogDescription className="mt-0.5 text-sm text-white/70">
                  {selectedParent?.children?.length || 0} student{selectedParent?.children?.length !== 1 ? 's' : ''} linked &bull; {selectedParent?.motherName || ''}
                </DialogDescription>
              </div>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.06] p-5">
            {selectedParent?.children && selectedParent.children.length > 0 ? (
              <div className="space-y-3">
                {selectedParent.children.map((link) => {
                  const rel = formatRelation(link.relation)
                  return (
                    <div
                      key={link.id}
                      className="group relative overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-card via-card to-primary/[0.02] p-4 shadow-sm transition-all hover:shadow-md"
                    >
                      <div aria-hidden className="absolute -right-4 -top-4 size-14 rounded-full border-[10px] border-primary/5 transition-all group-hover:scale-150 group-hover:border-primary/10" />
                      <div className="relative flex items-center gap-4">
                        <Avatar className="size-12 shrink-0 border-2 border-primary/15 shadow-sm">
                          <AvatarFallback className="bg-gradient-to-br from-primary to-teal-600 text-xs font-bold text-white">
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
                    </div>
                  )
                })}
              </div>
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
          <div className="border-t border-primary/10 bg-gradient-to-r from-primary/[0.02] via-background to-cyan-500/[0.02] px-5 py-3.5">
            <div className="flex items-center justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowChildren(false)}
                className="gap-2 border-primary/15 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
              >
                <X className="size-3.5" /> Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
