'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, DataTable, type Column, type ActionItem, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DatePicker } from '@/components/date-picker'
import { PlusCircle, BookOpen, ArrowRightLeft } from 'lucide-react'

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

  const bookColumns: Column<Book>[] = [
    { key: 'title', label: 'Title', render: (b: Book) => <span className="font-medium">{b.title}</span> },
    { key: 'author', label: 'Author', render: (b: Book) => b.author },
    { key: 'isbn', label: 'ISBN', render: (b: Book) => <span className="font-mono text-xs">{b.isbn}</span> },
    { key: 'category', label: 'Category', render: (b: Book) => <Badge variant="secondary">{b.category || '-'}</Badge> },
    { key: 'quantity', label: 'Quantity', render: (b: Book) => b.quantity },
    { key: 'available', label: 'Available', render: (b: Book) => (
      <Badge className={b.available > 0 ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100' : 'bg-red-100 text-red-800 hover:bg-red-100'}>
        {b.available}
      </Badge>
    )},
    { key: 'shelf', label: 'Shelf', render: (b: Book) => b.shelf || '-' },
  ]

  const bookActions = (b: Book): ActionItem[] => [
    { label: 'Issue Book', onClick: () => { setIssueForm(f => ({ ...f, bookId: b.id })); setShowIssue(true) } },
  ]

  const issueColumns: Column<IssuedBook>[] = [
    { key: 'book', label: 'Book', render: (i: IssuedBook) => i.book?.title || '-' },
    { key: 'student', label: 'Student', render: (i: IssuedBook) => i.student ? `${i.student.firstName} ${i.student.lastName}` : '-' },
    { key: 'issueDate', label: 'Issue Date', render: (i: IssuedBook) => i.issueDate ? new Date(i.issueDate).toLocaleDateString() : '-' },
    { key: 'dueDate', label: 'Due Date', render: (i: IssuedBook) => i.dueDate ? new Date(i.dueDate).toLocaleDateString() : '-' },
    { key: 'status', label: 'Status', render: (i: IssuedBook) => {
      const colors: Record<string, string> = { ISSUED: 'bg-teal-100 text-teal-800 hover:bg-teal-100', RETURNED: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100', OVERDUE: 'bg-red-100 text-red-800 hover:bg-red-100' }
      return <Badge className={colors[i.status] || ''}>{i.status}</Badge>
    }},
  ]

  const issueActions = (i: IssuedBook): ActionItem[] => {
    const items: ActionItem[] = [{ label: 'View Details', onClick: () => {} }]
    if (i.status === 'ISSUED' || i.status === 'OVERDUE') items.push({ label: 'Return Book', onClick: () => handleReturn(i.id) })
    return items
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader title="Library" description={`${books.length} books`} action={{ label: 'Add Book', icon: PlusCircle, onClick: () => setShowAddBook(true) }} />

      <Tabs defaultValue="books">
        <TabsList>
          <TabsTrigger value="books">Books</TabsTrigger>
          <TabsTrigger value="issued">Issued Books</TabsTrigger>
        </TabsList>
        <TabsContent value="books" className="mt-4">
          {books.length === 0 ? (
            <EmptyState icon={BookOpen} title="No Books" description="Add books to the library catalog." action={{ label: 'Add Book', onClick: () => setShowAddBook(true) }} />
          ) : (
            <DataTable columns={bookColumns} data={books} searchKey="title" searchPlaceholder="Search books..." actions={bookActions} />
          )}
        </TabsContent>
        <TabsContent value="issued" className="mt-4">
          {issues.length === 0 ? (
            <EmptyState icon={ArrowRightLeft} title="No Issued Books" description="Issue books to students from the Books tab." />
          ) : (
            <DataTable columns={issueColumns} data={issues} searchKey="bookId" searchPlaceholder="Search issued books..." actions={issueActions} />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showAddBook} onOpenChange={setShowAddBook}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Book</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label>Title</Label><Input value={bookForm.title} onChange={e => setBookForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Author</Label><Input value={bookForm.author} onChange={e => setBookForm(f => ({ ...f, author: e.target.value }))} /></div>
              <div className="space-y-2"><Label>ISBN</Label><Input value={bookForm.isbn} onChange={e => setBookForm(f => ({ ...f, isbn: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Category</Label><Input value={bookForm.category} onChange={e => setBookForm(f => ({ ...f, category: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Quantity</Label><Input type="number" value={bookForm.quantity} onChange={e => setBookForm(f => ({ ...f, quantity: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Shelf</Label><Input value={bookForm.shelf} onChange={e => setBookForm(f => ({ ...f, shelf: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBook(false)}>Cancel</Button>
            <Button onClick={handleAddBook} disabled={!bookForm.title}>Add Book</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showIssue} onOpenChange={setShowIssue}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Issue Book</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Book</Label>
              <Select value={issueForm.bookId} onValueChange={v => setIssueForm(f => ({ ...f, bookId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select book" /></SelectTrigger>
                <SelectContent>{books.filter(b => b.available > 0).map(b => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Student</Label>
              <Select value={issueForm.studentId} onValueChange={v => setIssueForm(f => ({ ...f, studentId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>{students.map(s => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Due Date</Label><DatePicker value={issueForm.dueDate} onChange={(v) => setIssueForm(f => ({ ...f, dueDate: v }))} disablePast placeholder="Select due date" triggerClassName="w-full" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIssue(false)}>Cancel</Button>
            <Button onClick={handleIssue} disabled={!issueForm.bookId || !issueForm.studentId}>Issue Book</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
