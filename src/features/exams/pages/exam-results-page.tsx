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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PlusCircle, ClipboardList } from 'lucide-react'

interface ExamResult {
  id: string
  studentId: string
  examId: string
  marks: number
  grade: string
  remarks?: string
  student?: { id: string; firstName: string; lastName: string }
  exam?: { id: string; name: string }
}

interface Exam { id: string; name: string }
interface Student { id: string; firstName: string; lastName: string }

const getGrade = (marks: number, total: number): string => {
  const pct = total > 0 ? (marks / total) * 100 : 0
  if (pct >= 90) return 'A+'
  if (pct >= 80) return 'A'
  if (pct >= 70) return 'B+'
  if (pct >= 60) return 'B'
  if (pct >= 50) return 'C'
  if (pct >= 40) return 'D'
  return 'F'
}

const gradeBadge = (grade: string) => {
  const colors: Record<string, string> = {
    'A+': 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
    'A': 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
    'B+': 'bg-teal-100 text-teal-800 hover:bg-teal-100',
    'B': 'bg-teal-100 text-teal-800 hover:bg-teal-100',
    'C': 'bg-amber-100 text-amber-800 hover:bg-amber-100',
    'D': 'bg-orange-100 text-orange-800 hover:bg-orange-100',
    'F': 'bg-red-100 text-red-800 hover:bg-red-100',
  }
  return <Badge className={colors[grade] || ''}>{grade}</Badge>
}

export function ExamResultsPage() {
  const { toast } = useToast()
  const [results, setResults] = useState<ExamResult[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [showEnter, setShowEnter] = useState(false)
  const [selectedExam, setSelectedExam] = useState('')
  const [marksMap, setMarksMap] = useState<Record<string, string>>({})

  const fetchData = useCallback(async () => {
    try {
      const [resRes, examRes, stuRes] = await Promise.all([
        api.get<{ results: ExamResult[] }>('/api/school/exams/results'),
        api.get<{ exams: Exam[] }>('/api/school/exams'),
        api.get<{ students: Student[] }>('/api/school/students'),
      ])
      setResults(resRes.results || [])
      setExams(examRes.exams || [])
      setStudents(stuRes.students || [])
    } catch {
      toast({ title: 'Couldn\'t Load Results', description: 'We couldn\'t load the exam results. Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSaveMarks = async () => {
    try {
      const marks = Object.entries(marksMap)
        .filter(([, m]) => m !== '')
        .map(([studentId, marks]) => ({ studentId, marks: Number(marks) }))
      if (marks.length === 0) { toast({ title: 'Missing Information', description: 'Please enter at least one mark.', variant: 'destructive' }); return }
      await api.post('/api/school/exams/results', { examId: selectedExam, marks })
      toast({ title: 'Success', description: 'Results saved' })
      setShowEnter(false)
      setMarksMap({})
      setSelectedExam('')
      fetchData()
    } catch (err) {
      toast({ title: 'Something Went Wrong', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  const columns: Column<ExamResult>[] = [
    { key: 'student', label: 'Student', render: (r: ExamResult) => r.student ? `${r.student.firstName} ${r.student.lastName}` : '-' },
    { key: 'exam', label: 'Exam', render: (r: ExamResult) => r.exam?.name || '-' },
    { key: 'marks', label: 'Marks', render: (r: ExamResult) => <span className="font-semibold">{r.marks}</span> },
    { key: 'grade', label: 'Grade', render: (r: ExamResult) => gradeBadge(r.grade || getGrade(r.marks, 100)) },
    { key: 'remarks', label: 'Remarks', render: (r: ExamResult) => r.remarks || '-' },
  ]

  const actions = (_r: ExamResult): ActionItem[] => [{ label: 'View Details', onClick: () => {} }]

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader title="Exam Results" description={`${results.length} results`} action={{ label: 'Enter Marks', icon: PlusCircle, onClick: () => setShowEnter(true) }} />

      {results.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No Results" description="Enter marks for exams to see results here." action={{ label: 'Enter Marks', onClick: () => setShowEnter(true) }} />
      ) : (
        <DataTable columns={columns} data={results} searchKey="studentId" searchPlaceholder="Search results..." actions={actions} />
      )}

      <Dialog open={showEnter} onOpenChange={setShowEnter}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader><DialogTitle>Enter Marks</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Exam</Label>
              <Select value={selectedExam} onValueChange={setSelectedExam}>
                <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
                <SelectContent>{exams.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {selectedExam && (
              <ScrollArea className="h-64 rounded-lg border">
                <div className="p-3 space-y-3">
                  {students.map(s => (
                    <div key={s.id} className="flex items-center gap-3">
                      <span className="text-sm min-w-[140px]">{s.firstName} {s.lastName}</span>
                      <Input type="number" placeholder="Marks" value={marksMap[s.id] || ''} onChange={e => setMarksMap(m => ({ ...m, [s.id]: e.target.value }))} className="h-8 w-24" />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEnter(false)}>Cancel</Button>
            <Button onClick={handleSaveMarks} disabled={!selectedExam}>Save Marks</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
