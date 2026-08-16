'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState, GradientEmptyState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { AdmitCardRenderer } from '@/features/exams/components/admit-card-renderer'
import type { AdmitCardData } from '@/features/exams/lib/admit-card-generator'
import type { AdmitCardTemplateConfig } from '@/features/exams/lib/admit-card-template'
import { Users, Search, Printer, Eye, TicketCheck, Palette } from 'lucide-react'

interface ExamInfo {
  id: string
  name: string
  academicYear: string
  group: { name: string; paradigm: { name: string } }
  examClasses: { classId: string; sectionIds: string | null }[]
  schedules: unknown[]
}

interface ClassOption {
  id: string
  name: string
  sections?: { id: string; name: string }[]
}

interface StudentRow {
  id: string
  firstName: string
  lastName: string | null
  admissionNumber: string | null
  rollNumber: string | null
  profileImage: string | null
  class: { id: string; name: string } | null
  section: { id: string; name: string } | null
  academicEnrollments: Array<{
    rollNumber: string | null
    class: { id: string; name: string } | null
    section: { id: string; name: string } | null
  }>
}

interface PreviewResponse {
  exam: { id: string; name: string; academicYear: string }
  school: { name: string; academicYear: string }
  template?: AdmitCardTemplateConfig
  cards: Array<{ studentId: string; data: AdmitCardData }>
}

interface Props {
  examId: string
}

const TINTED_CARD =
  'border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10'

export function AdmitCardPage({ examId }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [loadingOptions, setLoadingOptions] = useState(true)
  const [exam, setExam] = useState<ExamInfo | null>(null)
  const [classes, setClasses] = useState<ClassOption[]>([])

  const [classId, setClassId] = useState('all')
  const [sectionId, setSectionId] = useState('all')
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

  const [students, setStudents] = useState<StudentRow[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'select' | 'preview'>('select')

  // Load exam + classes once.
  useEffect(() => {
    let cancelled = false
    setLoadingOptions(true)
    Promise.all([
      api.get<{ exam: ExamInfo }>(`/api/school/exams/${examId}`),
      api.get<{ classes: ClassOption[] }>('/api/school/classes'),
    ])
      .then(([examRes, classesRes]) => {
        if (cancelled) return
        setExam(examRes.exam)
        setClasses(classesRes.classes || [])
      })
      .catch((err) => {
        if (cancelled) return
        toast({
          variant: 'destructive',
          title: 'Could not load exam',
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false)
      })
    return () => {
      cancelled = true
    }
  }, [examId, toast])

  // Debounce search.
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  // Classes the exam runs for (fall back to all classes when unrestricted).
  const examClassIds = useMemo(() => new Set(exam?.examClasses.map((c) => c.classId) ?? []), [exam])
  const scopedClasses = useMemo(
    () => (examClassIds.size > 0 ? classes.filter((c) => examClassIds.has(c.id)) : classes),
    [classes, examClassIds],
  )
  const sectionOptions = useMemo(
    () => (classId !== 'all' ? scopedClasses.find((c) => c.id === classId)?.sections ?? [] : []),
    [classId, scopedClasses],
  )

  const fetchStudents = useCallback(async () => {
    setLoadingStudents(true)
    try {
      const params: Record<string, string> = {}
      if (classId !== 'all') params.classId = classId
      if (sectionId !== 'all') params.sectionId = sectionId
      if (searchDebounced) params.search = searchDebounced
      const res = await api.get<{ students: StudentRow[] }>(
        `/api/school/exams/${examId}/admit-cards/students`,
        params,
      )
      setStudents(res.students)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load students',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoadingStudents(false)
    }
  }, [examId, classId, sectionId, searchDebounced, toast])

  useEffect(() => {
    if (loadingOptions) return
    void fetchStudents()
  }, [fetchStudents, loadingOptions])

  const allFilteredSelected = students.length > 0 && students.every((s) => selectedIds.includes(s.id))
  const someFilteredSelected = students.some((s) => selectedIds.includes(s.id))

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !students.some((s) => s.id === id)))
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...students.map((s) => s.id)])))
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const clearSelection = () => setSelectedIds([])

  const buildPreview = async () => {
    if (selectedIds.length === 0) {
      toast({ variant: 'destructive', title: 'Please select at least one student.' })
      return
    }
    setPreviewLoading(true)
    try {
      const res = await api.post<PreviewResponse>(
        `/api/school/exams/${examId}/admit-cards/generate`,
        { studentIds: selectedIds, action: 'preview' },
      )
      setPreview(res)
      setActiveTab('preview')
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not build preview',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPreviewLoading(false)
    }
  }

  const openPrintSheet = () => {
    if (selectedIds.length === 0) return
    const ids = selectedIds.join(',')
    window.open(`/print/admit-cards/${examId}?students=${ids}&action=print`, '_blank', 'noopener,noreferrer')
  }

  if (loadingOptions) return <LoadingState />
  if (!exam) return null

  const hasSchedule = (exam.schedules?.length ?? 0) > 0

  return (
    <div className="space-y-4">
      <GradientHero
        icon={TicketCheck}
        title={`Admit Cards: ${exam.name}`}
        description={`${exam.group.paradigm.name} · ${exam.group.name} · ${exam.academicYear}`}
        extraActions={
          <Button variant="outline" onClick={() => router.push('/exams/admit-card-template')} className="gap-2">
            <Palette className="size-4" /> Customize template
          </Button>
        }
        secondaryAction={{
          label: 'Schedule',
          onClick: () => router.push(`/exams/${examId}/schedule`),
        }}
      />

      {!hasSchedule && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          This exam has no datesheet yet. Admit cards will print without a subject schedule until you
          add schedule rows.
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'select' | 'preview')}>
        <TabsList>
          <TabsTrigger value="select">
            <Users className="mr-2 size-4" /> Select Students
            {selectedIds.length > 0 && <Badge variant="secondary" className="ml-2">{selectedIds.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="preview" disabled={!preview}>
            <Eye className="mr-2 size-4" /> Preview & Print
            {preview && <Badge variant="secondary" className="ml-2">{preview.cards.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="select" className="mt-4 space-y-4">
          <Card className={TINTED_CARD}>
            <CardContent className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
              <FilterField label="Class">
                <Select
                  value={classId}
                  onValueChange={(v) => {
                    setClassId(v)
                    setSectionId('all')
                  }}
                >
                  <SelectTrigger className="h-9 bg-white text-sm dark:bg-input/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {scopedClasses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Section">
                <Select value={sectionId} onValueChange={setSectionId} disabled={classId === 'all'}>
                  <SelectTrigger className="h-9 bg-white text-sm dark:bg-input/30"><SelectValue placeholder="All sections" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {sectionOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Search">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, admission no, roll no"
                    className="h-9 bg-white pl-8 text-sm dark:bg-input/30"
                  />
                </div>
              </FilterField>
            </CardContent>
          </Card>

          {/* Selection bar */}
          <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 ${TINTED_CARD}`}>
            <div className="flex items-center gap-3">
              <Checkbox
                checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
                onCheckedChange={toggleAllFiltered}
                disabled={students.length === 0}
              />
              <span className="text-sm font-medium">
                {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select students'}
              </span>
              <span className="text-xs text-muted-foreground">({students.length} shown)</span>
            </div>
            <div className="flex gap-2">
              {selectedIds.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSelection}>Clear</Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={buildPreview}
                disabled={selectedIds.length === 0 || previewLoading}
              >
                <Eye className="mr-1.5 size-4" />
                {previewLoading ? 'Building…' : `Preview ${selectedIds.length || ''}`.trim()}
              </Button>
              <Button
                size="sm"
                onClick={openPrintSheet}
                disabled={selectedIds.length === 0}
              >
                <Printer className="mr-1.5 size-4" /> Print
              </Button>
            </div>
          </div>

          {loadingStudents ? (
            <Card className={TINTED_CARD}><CardContent className="p-8 text-center text-sm text-muted-foreground">Loading students…</CardContent></Card>
          ) : students.length === 0 ? (
            <GradientEmptyState
              icon={Users}
              title="No matching students"
              description="Adjust the class, section, or search filters."
            />
          ) : (
            <Card className={TINTED_CARD}>
              <ScrollArea className="h-[min(600px,calc(100vh-380px))]">
                <ul className="divide-y">
                  {students.map((s) => {
                    const checked = selectedIds.includes(s.id)
                    const enrollment = s.academicEnrollments[0]
                    const cls = enrollment?.class?.name || s.class?.name || '—'
                    const sec = enrollment?.section?.name || s.section?.name || '—'
                    const rollNo = enrollment?.rollNumber || s.rollNumber || '—'
                    return (
                      <li
                        key={s.id}
                        className={`flex items-center gap-3 px-4 py-2.5 transition hover:bg-muted/40 ${checked ? 'bg-primary/5' : ''}`}
                        onClick={() => toggleOne(s.id)}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleOne(s.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs">
                          {s.profileImage ? (
                            <img src={s.profileImage} alt="" className="size-full object-cover" />
                          ) : (
                            <span className="font-medium uppercase">{s.firstName?.[0] || '?'}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {s.firstName} {s.lastName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {s.admissionNumber || '—'} · Class {cls}-{sec} · Roll {rollNo}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="preview" className="mt-4 space-y-4">
          {preview && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">
                    <TicketCheck className="mr-1 size-3.5" /> {preview.cards.length} admit card
                    {preview.cards.length === 1 ? '' : 's'}
                  </Badge>
                  <p className="text-sm text-muted-foreground">A4 portrait · one per page</p>
                </div>
                <Button size="sm" onClick={openPrintSheet}>
                  <Printer className="mr-1.5 size-4" /> Print
                </Button>
              </div>
              <div className={`space-y-6 rounded-xl border p-4 ${TINTED_CARD}`}>
                {preview.cards.map((c) => (
                  <div key={c.studentId} className="bg-white p-3 shadow-sm">
                    <AdmitCardRenderer data={c.data} template={preview.template} />
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
