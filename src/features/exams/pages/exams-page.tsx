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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PlusCircle, FileText } from 'lucide-react'
import { ExamResultsPage } from './exam-results-page'

interface Exam {
  id: string
  name: string
  subjectId: string
  classId: string
  examDate: string
  totalMarks: number
  passingMarks: number
  subject?: { id: string; name: string }
  class?: { id: string; name: string }
}

interface ClassOption { id: string; name: string }
interface SubjectOption { id: string; name: string }

export function ExamsPage() {
  const { toast } = useToast()
  const [exams, setExams] = useState<Exam[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [subjects, setSubjects] = useState<SubjectOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', subjectId: '', classId: '', examDate: '', totalMarks: '', passingMarks: '' })

  const fetchData = useCallback(async () => {
    try {
      const [examRes, clsRes, subRes] = await Promise.all([
        api.get<{ exams: Exam[] }>('/api/school/exams'),
        api.get<{ classes: ClassOption[] }>('/api/school/classes'),
        api.get<{ subjects: SubjectOption[] }>('/api/school/subjects'),
      ])
      setExams(examRes.exams || [])
      setClasses(clsRes.classes || [])
      setSubjects(subRes.subjects || [])
    } catch {
      toast({ title: 'Couldn\'t Load Exams', description: 'We couldn\'t load the exams. Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAdd = async () => {
    try {
      await api.post('/api/school/exams', {
        name: form.name, subjectId: form.subjectId, classId: form.classId,
        examDate: form.examDate, totalMarks: Number(form.totalMarks), passingMarks: Number(form.passingMarks),
      })
      toast({ title: 'Success', description: 'Exam created' })
      setShowAdd(false)
      setForm({ name: '', subjectId: '', classId: '', examDate: '', totalMarks: '', passingMarks: '' })
      fetchData()
    } catch (err) {
      toast({ title: 'Something Went Wrong', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  const columns: Column<Exam>[] = [
    { key: 'name', label: 'Exam Name', render: (e: Exam) => <span className="font-medium">{e.name}</span> },
    { key: 'subject', label: 'Subject', render: (e: Exam) => e.subject?.name || '-' },
    { key: 'class', label: 'Class', render: (e: Exam) => e.class?.name || '-' },
    { key: 'examDate', label: 'Date', render: (e: Exam) => e.examDate ? new Date(e.examDate).toLocaleDateString() : '-' },
    { key: 'totalMarks', label: 'Total Marks', render: (e: Exam) => e.totalMarks },
    { key: 'passingMarks', label: 'Passing Marks', render: (e: Exam) => e.passingMarks },
  ]

  const actions = (_e: Exam): ActionItem[] => [
    { label: 'View Details', onClick: () => {} },
    { label: 'Edit', onClick: () => {} },
  ]

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader title="Exams" description={`${exams.length} exams`} action={{ label: 'Add Exam', icon: PlusCircle, onClick: () => setShowAdd(true) }} />

      <Tabs defaultValue="exams">
        <TabsList>
          <TabsTrigger value="exams">Exams List</TabsTrigger>
          <TabsTrigger value="results">Exam Results</TabsTrigger>
        </TabsList>
        <TabsContent value="exams" className="mt-4">
          {exams.length === 0 ? (
            <EmptyState icon={FileText} title="No Exams" description="Create exams to schedule assessments." action={{ label: 'Add Exam', onClick: () => setShowAdd(true) }} />
          ) : (
            <DataTable columns={columns} data={exams} searchKey="name" searchPlaceholder="Search exams..." actions={actions} />
          )}
        </TabsContent>
        <TabsContent value="results" className="mt-4">
          <ExamResultsPage />
        </TabsContent>
      </Tabs>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Exam</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2"><Label>Exam Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Mid-Term Exam" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Select value={form.subjectId} onValueChange={v => setForm(f => ({ ...f, subjectId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>{subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={form.classId} onValueChange={v => setForm(f => ({ ...f, classId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label>Exam Date</Label><Input type="date" value={form.examDate} onChange={e => setForm(f => ({ ...f, examDate: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Total Marks</Label><Input type="number" value={form.totalMarks} onChange={e => setForm(f => ({ ...f, totalMarks: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Passing Marks</Label><Input type="number" value={form.passingMarks} onChange={e => setForm(f => ({ ...f, passingMarks: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!form.name || !form.subjectId || !form.classId}>Create Exam</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
