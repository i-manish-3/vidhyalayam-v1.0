'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DatePicker } from '@/components/date-picker'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertTriangle,
  ArrowRightLeft,
  BookCheck,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  GraduationCap,
  List,
  MoreHorizontal,
  PlusCircle,
  RotateCcw,
  Search,
  Tags,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Book {
  id: string
  title: string
  author: string
  isbn: string
  category: string
  quantity: number
  available: number
  shelf: string
}

interface IssuedBook {
  id: string
  bookId: string
  studentId: string
  issueDate: string
  dueDate: string
  returnDate?: string
  status: 'ISSUED' | 'RETURNED' | 'OVERDUE'
  book?: { id: string; title: string }
  student?: { id: string; firstName: string; lastName: string }
}

interface StudentOption { id: string; firstName: string; lastName: string }

const ALL = '__all__'
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const STATUS_BADGES: Record<string, string> = {
  ISSUED: 'border-teal-500/30 bg-gradient-to-r from-teal-500/10 to-cyan-500/10 text-teal-700 dark:text-teal-300',
  RETURNED: 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-700 dark:text-emerald-300',
  OVERDUE: 'border-red-500/30 bg-gradient-to-r from-red-500/10 to-rose-500/10 text-red-700 dark:text-red-300',
}

const STATUS_DOTS: Record<string, string> = {
  ISSUED: 'bg-teal-500',
  RETURNED: 'bg-emerald-500',
  OVERDUE: 'bg-red-500',
}

function formatDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value || '-'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function LibraryPage() {
  const { toast } = useToast()
  const [books, setBooks] = useState<Book[]>([])
  const [issues, setIssues] = useState<IssuedBook[]>([])
  const [students, setStudents] = useState<StudentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddBook, setShowAddBook] = useState(false)
  const [showIssue, setShowIssue] = useState(false)
  const [bookForm, setBookForm] = useState({ title: '', author: '', isbn: '', category: '', quantity: '', shelf: '' })
  const [issueForm, setIssueForm] = useState({ bookId: '', studentId: '', dueDate: '' })

  // Books tab filters
  const [bookSearch, setBookSearch] = useState('')
  const [bookCategory, setBookCategory] = useState(ALL)
  const [bookQuick, setBookQuick] = useState<'all' | 'available' | 'stockout'>('all')
  const [bookPage, setBookPage] = useState(1)
  const [bookPageSize, setBookPageSize] = useState(10)

  // Issued tab filters
  const [issueSearch, setIssueSearch] = useState('')
  const [issueStatus, setIssueStatus] = useState(ALL)
  const [issuePage, setIssuePage] = useState(1)
  const [issuePageSize, setIssuePageSize] = useState(10)

  const fetchData = useCallback(async () => {
    try {
      const [bookRes, issueRes, stuRes] = await Promise.all([
        api.get<{ books: Book[] }>('/api/school/library/books'),
        api.get<{ issues: IssuedBook[] }>('/api/school/library/issues'),
        api.get<{ students: StudentOption[] }>('/api/school/students'),
      ])
      setBooks(bookRes.books || [])
      setIssues(issueRes.issues || [])
      setStudents(stuRes.students || [])
    } catch {
      toast({ title: 'Couldn\'t Load Library Data', description: 'We couldn\'t load the library data. Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const totalCopies = books.reduce((sum, b) => sum + (b.quantity || 0), 0)
  const availableCopies = books.reduce((sum, b) => sum + (b.available || 0), 0)
  const issuedCount = issues.filter((i) => i.status === 'ISSUED' || i.status === 'OVERDUE').length
  const overdueCount = issues.filter((i) => i.status === 'OVERDUE').length
  const returnedCount = issues.filter((i) => i.status === 'RETURNED').length

  const categoryOptions = useMemo(
    () => Array.from(new Set(books.map((b) => b.category).filter(Boolean))),
    [books],
  )

  const filteredBooks = useMemo(() => {
    const q = bookSearch.trim().toLowerCase()
    return books.filter((b) => {
      if (bookCategory !== ALL && b.category !== bookCategory) return false
      if (bookQuick === 'available' && b.available <= 0) return false
      if (bookQuick === 'stockout' && b.available > 0) return false
      if (!q) return true
      return [b.title, b.author, b.isbn, b.category, b.shelf]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    })
  }, [books, bookSearch, bookCategory, bookQuick])

  const filteredIssues = useMemo(() => {
    const q = issueSearch.trim().toLowerCase()
    return issues.filter((i) => {
      if (issueStatus !== ALL && i.status !== issueStatus) return false
      if (!q) return true
      return [i.book?.title, i.student?.firstName, i.student?.lastName, i.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [issues, issueSearch, issueStatus])

  const bookTotalPages = Math.max(1, Math.ceil(filteredBooks.length / bookPageSize))
  const safeBookPage = Math.min(bookPage, bookTotalPages)
  const bookStart = (safeBookPage - 1) * bookPageSize
  const paginatedBooks = filteredBooks.slice(bookStart, bookStart + bookPageSize)

  const issueTotalPages = Math.max(1, Math.ceil(filteredIssues.length / issuePageSize))
  const safeIssuePage = Math.min(issuePage, issueTotalPages)
  const issueStart = (safeIssuePage - 1) * issuePageSize
  const paginatedIssues = filteredIssues.slice(issueStart, issueStart + issuePageSize)

  const hasBookFilters = !!bookSearch || bookCategory !== ALL || bookQuick !== 'all'
  const hasIssueFilters = !!issueSearch || issueStatus !== ALL

  const clearBookFilters = () => {
    setBookSearch('')
    setBookCategory(ALL)
    setBookQuick('all')
    setBookPage(1)
  }

  const clearIssueFilters = () => {
    setIssueSearch('')
    setIssueStatus(ALL)
    setIssuePage(1)
  }

  const handleAddBook = async () => {
    try {
      await api.post('/api/school/library/books', {
        title: bookForm.title, author: bookForm.author, isbn: bookForm.isbn,
        category: bookForm.category, quantity: Number(bookForm.quantity), shelf: bookForm.shelf,
      })
      toast({ title: 'Success', description: 'Book added' })
      setShowAddBook(false)
      setBookForm({ title: '', author: '', isbn: '', category: '', quantity: '', shelf: '' })
      fetchData()
    } catch (err) {
      toast({ title: 'Something Went Wrong', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  const handleIssue = async () => {
    try {
      await api.post('/api/school/library/issues', {
        bookId: issueForm.bookId, studentId: issueForm.studentId, dueDate: issueForm.dueDate,
      })
      toast({ title: 'Success', description: 'Book issued' })
      setShowIssue(false)
      setIssueForm({ bookId: '', studentId: '', dueDate: '' })
      fetchData()
    } catch (err) {
      toast({ title: 'Something Went Wrong', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  const handleReturn = async (id: string) => {
    try {
      await api.patch(`/api/school/library/issues/${id}`, { returnDate: new Date().toISOString() })
      toast({ title: 'Success', description: 'Book returned' })
      fetchData()
    } catch (err) {
      toast({ title: 'Something Went Wrong', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      {/* ── Branded Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15">
        <div aria-hidden className="absolute -top-14 right-1/3 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute -bottom-16 right-1/4 size-28 rounded-full bg-amber-300/10 blur-sm" />
        <div aria-hidden className="absolute left-1/3 top-0 h-px w-48 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md shadow-black/10 backdrop-blur-sm">
              <BookOpen className="size-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Library</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                  {books.length} book{books.length !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-white/80">
                Book catalog and issue tracking — add books, hand them out and manage returns.
              </p>
            </div>
          </div>
          <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAddBook(true)}
              className="gap-2 border border-white/60 shadow-md transition-transform hover:-translate-y-0.5 hover:shadow-lg"
              style={{ backgroundColor: 'white', color: 'var(--primary)' }}
            >
              <PlusCircle className="size-4" />
              Add Book
            </Button>
          </div>
        </div>
      </section>

      {/* ── Summary Stats ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {/* Books */}
        <div className="flex items-center gap-2.5 rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm">
            <BookOpen className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total books</p>
            <p className="text-lg font-bold leading-tight text-sky-700 dark:text-sky-300">{books.length.toLocaleString()}</p>
          </div>
        </div>

        {/* Copies */}
        <div className="flex items-center gap-2.5 rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-fuchsia-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-sm">
            <Tags className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total copies</p>
            <p className="text-lg font-bold leading-tight text-violet-700 dark:text-violet-300">{totalCopies.toLocaleString()}</p>
          </div>
        </div>

        {/* Available */}
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
            <BookCheck className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Available</p>
            <p className="text-lg font-bold leading-tight text-emerald-700 dark:text-emerald-300">{availableCopies.toLocaleString()}</p>
          </div>
        </div>

        {/* Issued */}
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
            <ArrowRightLeft className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Issued now</p>
            <p className="text-lg font-bold leading-tight text-amber-700 dark:text-amber-300">{issuedCount.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <Tabs defaultValue="books" className="space-y-4">
        <TabsList className="h-9 gap-1 bg-muted/50 p-1">
          <TabsTrigger
            value="books"
            className="h-7 gap-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-600 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <BookOpen className="size-3.5" />
            Books
          </TabsTrigger>
          <TabsTrigger
            value="issued"
            className="h-7 gap-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-600 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <ArrowRightLeft className="size-3.5" />
            Issued Books
          </TabsTrigger>
        </TabsList>

        {/* ── Books tab ─────────────────────────────────────────────── */}
        <TabsContent value="books" className="mt-0">
          <Card className="gap-0 overflow-hidden border-teal-200/80 bg-gradient-to-r from-teal-50 via-white to-sky-50 py-0 shadow-sm dark:border-teal-500/25 dark:from-teal-500/12 dark:via-card dark:to-sky-500/10">
            <CardContent className="p-3">
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                {/* Search */}
                <div className="col-span-2 space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={bookSearch}
                      onChange={(e) => { setBookSearch(e.target.value); setBookPage(1) }}
                      placeholder="Title, author, ISBN…"
                      className="h-10 w-full bg-white pl-8 pr-8 text-sm shadow-sm dark:bg-input/30 sm:h-9 sm:text-xs"
                    />
                    {bookSearch && (
                      <button
                        type="button"
                        onClick={() => setBookSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Category</Label>
                  <Select value={bookCategory} onValueChange={(v) => { setBookCategory(v); setBookPage(1) }}>
                    <SelectTrigger
                      leadingIcon={<Tags className="size-3.5 text-white" />}
                      leadingIconClassName="from-sky-500 to-cyan-600"
                      className="h-10 w-full border-sky-200 from-sky-50 via-white to-cyan-50 px-2 text-sm shadow-sm focus:border-sky-400 focus:ring-sky-400/20 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-input/30 dark:to-cyan-500/10 sm:h-9 sm:text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 border-sky-200/80 bg-white shadow-lg dark:border-sky-500/25 dark:bg-popover">
                      <SelectItem value={ALL}>All categories</SelectItem>
                      {categoryOptions.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Rows per page */}
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rows per page</Label>
                  <Select value={String(bookPageSize)} onValueChange={(v) => { setBookPageSize(Number(v)); setBookPage(1) }}>
                    <SelectTrigger
                      leadingIcon={<List className="size-3.5 text-white" />}
                      leadingIconClassName="from-violet-500 to-purple-600"
                      className="h-10 w-full border-violet-200 from-violet-50 via-white to-purple-50 px-2 text-sm shadow-sm focus:border-violet-400 focus:ring-violet-400/20 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-input/30 dark:to-purple-500/10 sm:h-9 sm:text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 border-violet-200/80 bg-white shadow-lg dark:border-violet-500/25 dark:bg-popover">
                      {PAGE_SIZE_OPTIONS.map((size) => (
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
                  <QuickFilter active={bookQuick === 'available'} tone="success" onClick={() => setBookQuick(bookQuick === 'available' ? 'all' : 'available')}>
                    Available
                  </QuickFilter>
                  <QuickFilter active={bookQuick === 'stockout'} tone="error" onClick={() => setBookQuick(bookQuick === 'stockout' ? 'all' : 'stockout')}>
                    Out of stock
                  </QuickFilter>
                  {hasBookFilters && (
                    <button
                      type="button"
                      onClick={clearBookFilters}
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

          {books.length === 0 ? (
            <EmptyState icon={BookOpen} title="No Books" description="Add books to the library catalog." action={{ label: 'Add Book', onClick: () => setShowAddBook(true) }} />
          ) : (
            <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
              {/* Header band */}
              <div className="border-b border-sky-200/70 bg-gradient-to-r from-sky-100/80 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
                      <BookOpen className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">Book catalog</h3>
                      <p className="text-[10px] text-muted-foreground">Use the row menu to issue a book to a student</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="h-5 text-[10px]">
                      {filteredBooks.length.toLocaleString()} books
                    </Badge>
                  </div>
                </div>
              </div>

              {paginatedBooks.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-3 py-12 text-center">
                  <span className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-500/20 dark:to-cyan-500/20">
                    <BookOpen className="size-5 text-teal-600 dark:text-teal-300" />
                  </span>
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold">No books found</h3>
                    <p className="mx-auto max-w-xs text-xs text-muted-foreground">
                      {hasBookFilters
                        ? 'No books match the current search or filters. Try widening them.'
                        : 'No books are in the catalog yet.'}
                    </p>
                  </div>
                  {hasBookFilters && (
                    <Button variant="outline" size="sm" onClick={clearBookFilters} className="mt-2 h-8 gap-1.5 px-4 text-xs">
                      <X className="size-3.5" /> Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07] hover:from-sky-500/[0.08] hover:via-primary/[0.04] hover:to-violet-500/[0.07]">
                          <TableHead className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Title</TableHead>
                          <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Author</TableHead>
                          <TableHead className="hidden py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">ISBN</TableHead>
                          <TableHead className="hidden py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell">Category</TableHead>
                          <TableHead className="py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Copies</TableHead>
                          <TableHead className="py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Available</TableHead>
                          <TableHead className="hidden py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell">Shelf</TableHead>
                          <TableHead className="w-12 py-2.5" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedBooks.map((b) => (
                          <TableRow key={b.id} className="transition-colors hover:bg-sky-500/[0.04]">
                            <TableCell className="px-4 py-2.5 font-medium">{b.title}</TableCell>
                            <TableCell className="py-2.5">{b.author || '-'}</TableCell>
                            <TableCell className="hidden py-2.5 lg:table-cell"><span className="font-mono text-xs">{b.isbn || '-'}</span></TableCell>
                            <TableCell className="hidden py-2.5 xl:table-cell">
                              {b.category ? <Badge variant="secondary" className="text-[10px]">{b.category}</Badge> : <span className="text-xs text-muted-foreground/40 italic">—</span>}
                            </TableCell>
                            <TableCell className="py-2.5 text-center text-muted-foreground">{b.quantity}</TableCell>
                            <TableCell className="py-2.5 text-center">
                              <Badge className={cn(
                                'gap-1 text-[10px]',
                                b.available > 0
                                  ? 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-700 dark:text-emerald-300'
                                  : 'border-red-500/30 bg-gradient-to-r from-red-500/10 to-rose-500/10 text-red-700 dark:text-red-300',
                              )}>
                                <span className={cn('size-1.5 rounded-full', b.available > 0 ? 'bg-emerald-500' : 'bg-red-500')} />
                                {b.available}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden py-2.5 xl:table-cell">{b.shelf || '-'}</TableCell>
                            <TableCell className="py-2.5 text-right">
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
                                    onClick={() => { setIssueForm(f => ({ ...f, bookId: b.id })); setShowIssue(true) }}
                                    disabled={b.available <= 0}
                                    className="gap-2.5 text-teal-700 focus:text-teal-700 dark:text-teal-400 dark:focus:text-teal-400"
                                  >
                                    <ArrowRightLeft className="size-4" /> Issue Book
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Footer legend */}
                  <div className="flex flex-col gap-3 border-t border-sky-200/70 bg-gradient-to-r from-sky-100/70 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5 md:flex-row md:items-center md:justify-between">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-muted-foreground sm:flex sm:items-center sm:gap-4">
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-full bg-violet-500" />
                        Copies: <strong className="text-foreground">{totalCopies.toLocaleString()}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-full bg-emerald-500" />
                        Available: <strong className="text-foreground">{availableCopies.toLocaleString()}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-full bg-amber-400" />
                        Out now: <strong className="text-foreground">{issuedCount.toLocaleString()}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-teal-700 dark:text-teal-300">
                      <Tags className="size-3.5" />
                      {overdueCount > 0 ? `${overdueCount.toLocaleString()} overdue — check the Issued Books tab` : 'All books are on schedule'}
                    </div>
                  </div>

                  <Pagination
                    page={safeBookPage}
                    pageSize={bookPageSize}
                    total={filteredBooks.length}
                    totalPages={bookTotalPages}
                    start={bookStart}
                    itemLabel="books"
                    onPageChange={setBookPage}
                    onPageSizeChange={(size) => { setBookPageSize(size); setBookPage(1) }}
                  />
                </>
              )}
            </Card>
          )}
        </TabsContent>

        {/* ── Issued Books tab ──────────────────────────────────────── */}
        <TabsContent value="issued" className="mt-0">
          <Card className="gap-0 overflow-hidden border-teal-200/80 bg-gradient-to-r from-teal-50 via-white to-sky-50 py-0 shadow-sm dark:border-teal-500/25 dark:from-teal-500/12 dark:via-card dark:to-sky-500/10">
            <CardContent className="p-3">
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                {/* Search */}
                <div className="col-span-2 space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={issueSearch}
                      onChange={(e) => { setIssueSearch(e.target.value); setIssuePage(1) }}
                      placeholder="Book or student name…"
                      className="h-10 w-full bg-white pl-8 pr-8 text-sm shadow-sm dark:bg-input/30 sm:h-9 sm:text-xs"
                    />
                    {issueSearch && (
                      <button
                        type="button"
                        onClick={() => setIssueSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</Label>
                  <Select value={issueStatus} onValueChange={(v) => { setIssueStatus(v); setIssuePage(1) }}>
                    <SelectTrigger
                      leadingIcon={<CalendarDays className="size-3.5 text-white" />}
                      leadingIconClassName="from-amber-500 to-orange-600"
                      className="h-10 w-full border-amber-200 from-amber-50 via-white to-orange-50 px-2 text-sm shadow-sm focus:border-amber-400 focus:ring-amber-400/20 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-input/30 dark:to-orange-500/10 sm:h-9 sm:text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 border-amber-200/80 bg-white shadow-lg dark:border-amber-500/25 dark:bg-popover">
                      <SelectItem value={ALL}>All statuses</SelectItem>
                      <SelectItem value="ISSUED">Issued</SelectItem>
                      <SelectItem value="RETURNED">Returned</SelectItem>
                      <SelectItem value="OVERDUE">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Rows per page */}
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rows per page</Label>
                  <Select value={String(issuePageSize)} onValueChange={(v) => { setIssuePageSize(Number(v)); setIssuePage(1) }}>
                    <SelectTrigger
                      leadingIcon={<List className="size-3.5 text-white" />}
                      leadingIconClassName="from-violet-500 to-purple-600"
                      className="h-10 w-full border-violet-200 from-violet-50 via-white to-purple-50 px-2 text-sm shadow-sm focus:border-violet-400 focus:ring-violet-400/20 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-input/30 dark:to-purple-500/10 sm:h-9 sm:text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 border-violet-200/80 bg-white shadow-lg dark:border-violet-500/25 dark:bg-popover">
                      {PAGE_SIZE_OPTIONS.map((size) => (
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
                  <QuickFilter active={issueStatus === 'ISSUED'} tone="success" onClick={() => setIssueStatus(issueStatus === 'ISSUED' ? ALL : 'ISSUED')}>
                    Issued
                  </QuickFilter>
                  <QuickFilter active={issueStatus === 'OVERDUE'} tone="error" onClick={() => setIssueStatus(issueStatus === 'OVERDUE' ? ALL : 'OVERDUE')}>
                    Overdue
                  </QuickFilter>
                  <QuickFilter active={issueStatus === 'RETURNED'} tone="neutral" onClick={() => setIssueStatus(issueStatus === 'RETURNED' ? ALL : 'RETURNED')}>
                    Returned
                  </QuickFilter>
                  {hasIssueFilters && (
                    <button
                      type="button"
                      onClick={clearIssueFilters}
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

          {issues.length === 0 ? (
            <EmptyState icon={ArrowRightLeft} title="No Issued Books" description="Issue books to students from the Books tab." />
          ) : (
            <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
              {/* Header band */}
              <div className="border-b border-sky-200/70 bg-gradient-to-r from-sky-100/80 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
                      <ArrowRightLeft className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">Issue history</h3>
                      <p className="text-[10px] text-muted-foreground">Use the row menu to record a return</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="h-5 text-[10px]">
                      {filteredIssues.length.toLocaleString()} issues
                    </Badge>
                  </div>
                </div>
              </div>

              {paginatedIssues.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-3 py-12 text-center">
                  <span className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-500/20 dark:to-cyan-500/20">
                    <ArrowRightLeft className="size-5 text-teal-600 dark:text-teal-300" />
                  </span>
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold">No issues found</h3>
                    <p className="mx-auto max-w-xs text-xs text-muted-foreground">
                      {hasIssueFilters
                        ? 'No issues match the current search or filters. Try widening them.'
                        : 'No books have been issued yet.'}
                    </p>
                  </div>
                  {hasIssueFilters && (
                    <Button variant="outline" size="sm" onClick={clearIssueFilters} className="mt-2 h-8 gap-1.5 px-4 text-xs">
                      <X className="size-3.5" /> Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07] hover:from-sky-500/[0.08] hover:via-primary/[0.04] hover:to-violet-500/[0.07]">
                          <TableHead className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Book</TableHead>
                          <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Student</TableHead>
                          <TableHead className="hidden py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Issue Date</TableHead>
                          <TableHead className="hidden py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Due Date</TableHead>
                          <TableHead className="py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                          <TableHead className="w-12 py-2.5" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedIssues.map((i) => (
                          <TableRow key={i.id} className="transition-colors hover:bg-sky-500/[0.04]">
                            <TableCell className="px-4 py-2.5 font-medium">{i.book?.title || '-'}</TableCell>
                            <TableCell className="py-2.5">
                              <span className="inline-flex items-center gap-1.5">
                                <GraduationCap className="size-3.5 text-muted-foreground" />
                                {i.student ? `${i.student.firstName} ${i.student.lastName}` : '-'}
                              </span>
                            </TableCell>
                            <TableCell className="hidden py-2.5 text-xs md:table-cell">{formatDate(i.issueDate)}</TableCell>
                            <TableCell className={cn('hidden py-2.5 text-xs md:table-cell', i.status === 'OVERDUE' ? 'font-semibold text-red-600 dark:text-red-400' : '')}>
                              {formatDate(i.dueDate)}
                            </TableCell>
                            <TableCell className="py-2.5 text-center">
                              <Badge className={cn('gap-1 text-[10px]', STATUS_BADGES[i.status])}>
                                <span className={cn('size-1.5 rounded-full', STATUS_DOTS[i.status])} />
                                {i.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="size-8 transition-all hover:scale-110 hover:bg-primary/5">
                                    <MoreHorizontal className="size-4 text-muted-foreground" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44 border-primary/10 shadow-xl">
                                  <DropdownMenuLabel className="text-xs font-bold text-foreground/80">Actions</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {(i.status === 'ISSUED' || i.status === 'OVERDUE') && (
                                    <DropdownMenuItem
                                      onClick={() => handleReturn(i.id)}
                                      className="gap-2.5 text-emerald-700 focus:text-emerald-700 dark:text-emerald-400 dark:focus:text-emerald-400"
                                    >
                                      <RotateCcw className="size-4" /> Return Book
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Footer legend */}
                  <div className="flex flex-col gap-3 border-t border-sky-200/70 bg-gradient-to-r from-sky-100/70 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5 md:flex-row md:items-center md:justify-between">
                    <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-[11px] text-muted-foreground sm:flex sm:items-center sm:gap-4">
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-full bg-teal-500" />
                        Issued: <strong className="text-foreground">{(issues.filter((x) => x.status === 'ISSUED').length).toLocaleString()}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-full bg-emerald-500" />
                        Returned: <strong className="text-foreground">{returnedCount.toLocaleString()}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="size-2 rounded-full bg-red-500" />
                        Overdue: <strong className="text-foreground">{overdueCount.toLocaleString()}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-teal-700 dark:text-teal-300">
                      <AlertTriangle className="size-3.5" />
                      Overdue issues need an immediate return
                    </div>
                  </div>

                  <Pagination
                    page={safeIssuePage}
                    pageSize={issuePageSize}
                    total={filteredIssues.length}
                    totalPages={issueTotalPages}
                    start={issueStart}
                    itemLabel="issues"
                    onPageChange={setIssuePage}
                    onPageSizeChange={(size) => { setIssuePageSize(size); setIssuePage(1) }}
                  />
                </>
              )}
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Add Book Dialog ─────────────────────────────────────────── */}
      <Dialog open={showAddBook} onOpenChange={setShowAddBook}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-sky-500/20 bg-card p-0 shadow-2xl shadow-sky-500/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#0284c7_0%,#0d9488_48%,#4f46e5_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-cyan-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-indigo-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <PlusCircle className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">Add Book</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  Add a new title to the library catalog.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-sky-500/[0.04] via-background to-violet-500/[0.05] p-4 sm:p-5">
            <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10 sm:p-5">
              <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
              <div className="relative mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm"><BookOpen className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">Book Details</h3><p className="text-[10px] text-muted-foreground">Title, author and ISBN</p></div>
              </div>
              <div className="relative grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Title <span className="text-destructive">*</span></Label>
                  <Input value={bookForm.title} onChange={e => setBookForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Mathematics for Class 9" className="h-9 bg-white shadow-sm dark:bg-input/30" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Author</Label>
                  <Input value={bookForm.author} onChange={e => setBookForm(f => ({ ...f, author: e.target.value }))} placeholder="Author name" className="h-9 bg-white shadow-sm dark:bg-input/30" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">ISBN</Label>
                  <Input value={bookForm.isbn} onChange={e => setBookForm(f => ({ ...f, isbn: e.target.value }))} placeholder="e.g. 978-81-1234-567-8" className="h-9 bg-white shadow-sm dark:bg-input/30" />
                </div>
              </div>
            </section>

            <section className="relative overflow-hidden rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 p-4 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10 sm:p-5">
              <div className="relative mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm"><Tags className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">Catalog Info</h3><p className="text-[10px] text-muted-foreground">Category, quantity and shelf location</p></div>
              </div>
              <div className="relative grid gap-2 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <Input value={bookForm.category} onChange={e => setBookForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Mathematics" className="h-9 bg-white shadow-sm dark:bg-input/30" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Quantity</Label>
                  <Input type="number" min={1} value={bookForm.quantity} onChange={e => setBookForm(f => ({ ...f, quantity: e.target.value }))} placeholder="e.g. 5" className="h-9 bg-white shadow-sm dark:bg-input/30" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Shelf</Label>
                  <Input value={bookForm.shelf} onChange={e => setBookForm(f => ({ ...f, shelf: e.target.value }))} placeholder="e.g. A-3" className="h-9 bg-white shadow-sm dark:bg-input/30" />
                </div>
              </div>
            </section>
          </div>

          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setShowAddBook(false)}>Cancel</Button>
            <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={handleAddBook} disabled={!bookForm.title}>
              <PlusCircle className="size-3.5" /> Add Book
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Issue Book Dialog ───────────────────────────────────────── */}
      <Dialog open={showIssue} onOpenChange={setShowIssue}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-teal-500/20 bg-card p-0 shadow-2xl shadow-teal-500/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#0d9488_0%,#0e7490_48%,#0284c7_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-teal-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <ArrowRightLeft className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">Issue Book</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  Hand out a book to a student with a due date.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-teal-500/[0.04] via-background to-sky-500/[0.05] p-4 sm:p-5">
            <section className="relative overflow-hidden rounded-xl border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-sky-50 p-4 shadow-sm dark:border-teal-500/25 dark:from-teal-500/15 dark:via-card dark:to-sky-500/10 sm:p-5">
              <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-teal-200/35 blur-xl dark:bg-teal-500/15" />
              <div className="relative mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm"><ArrowRightLeft className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">Issue Details</h3><p className="text-[10px] text-muted-foreground">Choose the book, student and due date</p></div>
              </div>
              <div className="relative space-y-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Book <span className="text-destructive">*</span></Label>
                  <Select value={issueForm.bookId} onValueChange={v => setIssueForm(f => ({ ...f, bookId: v }))}>
                    <SelectTrigger className="h-9 w-full bg-white text-xs shadow-sm dark:bg-input/30">
                      <SelectValue placeholder="Select a book with available copies" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {books.filter(b => b.available > 0).map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.title} ({b.available} available)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Student <span className="text-destructive">*</span></Label>
                  <Select value={issueForm.studentId} onValueChange={v => setIssueForm(f => ({ ...f, studentId: v }))}>
                    <SelectTrigger className="h-9 w-full bg-white text-xs shadow-sm dark:bg-input/30">
                      <SelectValue placeholder="Select a student" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {students.map(s => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Due Date</Label>
                  <DatePicker value={issueForm.dueDate} onChange={(v) => setIssueForm(f => ({ ...f, dueDate: v }))} disablePast placeholder="Select due date" triggerClassName="h-9 w-full justify-start bg-white px-2.5 text-xs shadow-sm dark:bg-input/30" />
                </div>
              </div>
            </section>

            <p className="rounded-md border border-amber-200/80 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-950/30 dark:text-amber-200">
              Issuing reduces the book&apos;s available copies. Overdue issues appear on the Issued Books tab.
            </p>
          </div>

          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setShowIssue(false)}>Cancel</Button>
            <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={handleIssue} disabled={!issueForm.bookId || !issueForm.studentId}>
              <ArrowRightLeft className="size-3.5" /> Issue Book
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
  itemLabel,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: number
  total: number
  totalPages: number
  start: number
  itemLabel: string
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
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>{size}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-2">
          Showing {from} to {to} of {total} {itemLabel}
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