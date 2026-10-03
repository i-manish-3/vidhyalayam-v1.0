'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BookOpenCheck,
  Calendar,
  Clock,
  ArrowLeft,
  Upload,
  Plus,
  Trash2,
  FileText,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  GraduationCap,
  Users,
  Bell,
  List,
  FileSpreadsheet,
  Link as LinkIcon,
  Award,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear } from '@/lib/academic-years'

interface SectionItem {
  id: string
  name: string
  teacherId?: string | null
}

interface SubjectItem {
  id: string
  name: string
  code?: string | null
  type?: string
}

interface ClassItem {
  id: string
  name: string
  sections: SectionItem[]
  subjects: SubjectItem[]
}

interface TeacherOption {
  id: string
  name: string
  employeeId?: string | null
}

interface AttachmentItem {
  name: string
  url: string
  type?: string
  size?: number
}

export function HomeworkCreatePage() {
  const router = useRouter()
  const { toast } = useToast()
  const currentSchool = useAppStore((s) => s.currentSchool)
  const user = useAppStore((s) => s.user)
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const academicYear = viewingAcademicYear || currentSchool?.academicYear || getCurrentAcademicYear()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [currentTeacher, setCurrentTeacher] = useState<TeacherOption | null>(null)

  // Form State
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [selectedSectionId, setSelectedSectionId] = useState<string>('all')
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('')
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignedDate, setAssignedDate] = useState(() => new Date().toISOString().split('T')[0])

  // Default due date to tomorrow 5:00 PM
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [dueTime, setDueTime] = useState('17:00')

  const [submissionType, setSubmissionType] = useState<'ONLINE' | 'OFFLINE' | 'BOTH'>('ONLINE')
  const [isGraded, setIsGraded] = useState(true)
  const [maxMarks, setMaxMarks] = useState<string>('20')
  const [notifyStudents, setNotifyStudents] = useState(true)
  const [notifyParents, setNotifyParents] = useState(true)

  // Attachments
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [newLinkName, setNewLinkName] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [showAddLink, setShowAddLink] = useState(false)

  // Load teacher classes & subjects
  const fetchClassesAndSubjects = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{
        isAdmin: boolean
        teacher: TeacherOption | null
        teachers: TeacherOption[]
        classes: ClassItem[]
        academicYear: string
      }>('/api/school/teacher/homework-classes', { academicYear })

      setIsAdmin(res.isAdmin)
      setClasses(res.classes || [])
      setTeachers(res.teachers || [])
      if (res.teacher) {
        setCurrentTeacher(res.teacher)
        setSelectedTeacherId(res.teacher.id)
      } else if (res.teachers?.length > 0) {
        setSelectedTeacherId(res.teachers[0].id)
      }

      if (res.classes?.length > 0) {
        setSelectedClassId(res.classes[0].id)
        if (res.classes[0].subjects?.length > 0) {
          setSelectedSubjectId(res.classes[0].subjects[0].id)
        }
      }
    } catch (err) {
      console.error(err)
      toast({
        title: "Couldn't Load Classes",
        description: 'Failed to load your assigned classes and subjects.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [academicYear, toast])

  useEffect(() => {
    fetchClassesAndSubjects()
  }, [fetchClassesAndSubjects])

  // Current selected class details
  const currentClass = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId) || null
  }, [classes, selectedClassId])

  // Update subjects when class changes
  const availableSubjects = useMemo(() => {
    return currentClass?.subjects || []
  }, [currentClass])

  // Available sections for chosen class
  const availableSections = useMemo(() => {
    return currentClass?.sections || []
  }, [currentClass])

  // When class changes, ensure selected subject is valid
  useEffect(() => {
    if (availableSubjects.length > 0) {
      const exists = availableSubjects.some((s) => s.id === selectedSubjectId)
      if (!exists) {
        setSelectedSubjectId(availableSubjects[0].id)
      }
    } else {
      setSelectedSubjectId('')
    }
    setSelectedSectionId('all')
  }, [selectedClassId, availableSubjects, selectedSubjectId])

  // Quick Due Date Presets
  const setPresetDueDate = (daysFromNow: number, timeStr = '17:00') => {
    const d = new Date()
    d.setDate(d.getDate() + daysFromNow)
    setDueDate(d.toISOString().split('T')[0])
    setDueTime(timeStr)
  }

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File Too Large',
          description: `"${file.name}" exceeds the 10 MB limit.`,
          variant: 'destructive',
        })
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        const base64Url = reader.result as string
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            url: base64Url,
            size: file.size,
            type: file.type,
          },
        ])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const addExternalLink = () => {
    if (!newLinkUrl.trim()) return
    const url = newLinkUrl.trim().startsWith('http')
      ? newLinkUrl.trim()
      : `https://${newLinkUrl.trim()}`
    const name = newLinkName.trim() || url

    setAttachments((prev) => [
      ...prev,
      {
        name,
        url,
        type: 'link',
      },
    ])
    setNewLinkName('')
    setNewLinkUrl('')
    setShowAddLink(false)
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  // Submit Handler
  const handleSubmit = async (publishStatus: 'PUBLISHED' | 'DRAFT') => {
    if (!title.trim()) {
      toast({
        title: 'Title Required',
        description: 'Please provide a clear title for this homework.',
        variant: 'destructive',
      })
      return
    }
    if (!selectedClassId) {
      toast({
        title: 'Class Required',
        description: 'Please select which class should receive this homework.',
        variant: 'destructive',
      })
      return
    }
    if (!selectedSubjectId) {
      toast({
        title: 'Subject Required',
        description: 'Please select the subject for this homework.',
        variant: 'destructive',
      })
      return
    }

    const fullDueDateTime = `${dueDate}T${dueTime}:00`
    if (new Date(fullDueDateTime) < new Date(assignedDate)) {
      toast({
        title: 'Invalid Due Date',
        description: 'Due date cannot be before the assigned date.',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        classId: selectedClassId,
        sectionId: selectedSectionId === 'all' ? null : selectedSectionId,
        subjectId: selectedSubjectId,
        teacherId: selectedTeacherId || undefined,
        academicYear,
        assignedDate: new Date(assignedDate).toISOString(),
        dueDate: new Date(fullDueDateTime).toISOString(),
        submissionType,
        maxMarks: isGraded && maxMarks ? Number(maxMarks) : null,
        attachments,
        status: publishStatus,
        notifyStudents,
        notifyParents,
      }

      const res = await api.post<{ success: boolean; homework: { id: string } }>(
        '/api/school/homework',
        payload
      )

      toast({
        title: publishStatus === 'PUBLISHED' ? 'Homework Assigned!' : 'Draft Saved',
        description:
          publishStatus === 'PUBLISHED'
            ? 'The homework assignment has been published and assigned to students.'
            : 'Homework draft has been saved successfully.',
      })

      router.push(`/homework/${res.homework.id}`)
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Failed to Save Homework',
        description: err.message || 'An error occurred while creating the homework assignment.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 1. Signature Hero Header Banner */}
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15">
        <div aria-hidden className="absolute -right-9 -top-14 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute -bottom-14 right-1/4 size-28 rounded-full bg-violet-300/10 blur-xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
              <BookOpenCheck className="size-5 text-white" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Assign Homework</h1>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85">
                  {academicYear}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-white/80">
                Create and distribute homework to your students with instructions, due dates, and study materials.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => router.push('/homework')}
              className="relative gap-2 border border-white/60 shadow-md"
              style={{ backgroundColor: 'white', color: 'var(--primary)' }}
            >
              <List className="size-4" /> Homework List
            </Button>
          </div>
        </div>
      </section>

      {loading ? (
        <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50/60 via-card to-violet-50/60 p-12 text-center shadow-sm dark:border-sky-500/25">
          <Loader2 className="mx-auto size-8 animate-spin text-primary" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            Loading your assigned classes & subjects...
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Main Form (2 cols) */}
          <div className="space-y-4 lg:col-span-2">
            <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50/60 via-card to-violet-50/60 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10">
              <CardHeader className="gap-1 border-b border-sky-200/70 bg-gradient-to-r from-sky-100/70 via-white/90 to-violet-100/60 px-4 py-3 !pb-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
                    <BookOpenCheck className="size-4 text-white" />
                  </span>
                  <span>Homework Setup</span>
                  {currentClass && (
                    <span className="ml-auto rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300">
                      Target: {currentClass.name}
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure class, subject, assignment details, and instructions
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 p-4">
                {/* Section 1: Target Class & Subject */}
                <section className="space-y-3 rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-3.5 shadow-sm dark:border-violet-500/25 dark:from-violet-500/12 dark:via-card dark:to-sky-500/10">
                  <div className="flex items-center gap-2 border-b border-violet-200/70 pb-2.5 dark:border-violet-500/20">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
                      <GraduationCap className="size-3.5 text-white" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight">1. Target Class & Subject</h3>
                      <p className="text-[10px] text-muted-foreground">Select the classroom and subject curriculum</p>
                    </div>
                  </div>

                  {/* Admin Teacher Selector (only if admin) */}
                  {isAdmin && teachers.length > 0 && (
                    <div className="space-y-1">
                      <Label className="flex items-center gap-1.5 text-xs font-medium">
                        <Users className="size-3 text-violet-600 dark:text-violet-300" /> Assigning Teacher
                      </Label>
                      <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                        <SelectTrigger className="h-9 border-violet-200 bg-white shadow-sm focus-visible:border-violet-400 focus-visible:ring-violet-400/20 dark:border-violet-500/25 dark:bg-input/30">
                          <SelectValue placeholder="Select teacher" />
                        </SelectTrigger>
                        <SelectContent>
                          {teachers.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name} {t.employeeId ? `(${t.employeeId})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Teacher Info Banner if logged in as teacher */}
                  {!isAdmin && currentTeacher && (
                    <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
                      <Users className="size-3.5 shrink-0" />
                      <span>
                        Assigning as <strong>{currentTeacher.name}</strong>
                      </span>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-3">
                    {/* Class Selection */}
                    <div className="space-y-1 sm:col-span-1">
                      <Label className="flex items-center gap-1.5 text-xs font-medium">
                        <GraduationCap className="size-3 text-sky-600 dark:text-sky-300" /> Class <span className="text-destructive">*</span>
                      </Label>
                      <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                        <SelectTrigger className="h-9 border-sky-200 bg-white shadow-sm focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-input/30">
                          <SelectValue placeholder="Choose class" />
                        </SelectTrigger>
                        <SelectContent>
                          {classes.map((cls) => (
                            <SelectItem key={cls.id} value={cls.id}>
                              {cls.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Section Selection */}
                    <div className="space-y-1 sm:col-span-1">
                      <Label className="flex items-center gap-1.5 text-xs font-medium">
                        <Layers className="size-3 text-amber-600 dark:text-amber-300" /> Section
                      </Label>
                      <Select value={selectedSectionId} onValueChange={setSelectedSectionId}>
                        <SelectTrigger className="h-9 border-amber-200 bg-white shadow-sm focus-visible:border-amber-400 focus-visible:ring-amber-400/20 dark:border-amber-500/25 dark:bg-input/30">
                          <SelectValue placeholder="All Sections" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sections</SelectItem>
                          {availableSections.map((sec) => (
                            <SelectItem key={sec.id} value={sec.id}>
                              Section {sec.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Subject Selection */}
                    <div className="space-y-1 sm:col-span-1">
                      <Label className="flex items-center gap-1.5 text-xs font-medium">
                        <Award className="size-3 text-emerald-600 dark:text-emerald-300" /> Subject <span className="text-destructive">*</span>
                      </Label>
                      <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
                        <SelectTrigger className="h-9 border-emerald-200 bg-white shadow-sm focus-visible:border-emerald-400 focus-visible:ring-emerald-400/20 dark:border-emerald-500/25 dark:bg-input/30">
                          <SelectValue placeholder="Choose subject" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableSubjects.map((sub) => (
                            <SelectItem key={sub.id} value={sub.id}>
                              {sub.name} {sub.code ? `(${sub.code})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </section>

                {/* Section 2: Homework Details & Instructions */}
                <section className="space-y-3 rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-3.5 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-cyan-500/10">
                  <div className="flex items-center gap-2 border-b border-sky-200/70 pb-2.5 dark:border-sky-500/20">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm">
                      <FileText className="size-3.5 text-white" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight">2. Assignment Title & Instructions</h3>
                      <p className="text-[10px] text-muted-foreground">Detailed guidelines, exercises, or tasks for students</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="flex items-center gap-1.5 text-xs font-medium">
                      <FileText className="size-3 text-sky-600 dark:text-sky-300" /> Homework Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="e.g. Chapter 4: Quadratic Equations - Exercise 4.2 (Q1 to Q10)"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="h-9 border-sky-200 bg-white shadow-sm focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-input/30"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-1.5 text-xs font-medium">
                        <FileSpreadsheet className="size-3 text-sky-600 dark:text-sky-300" /> Description & Instructions
                      </Label>
                      <span className="text-[11px] text-muted-foreground">Markdown supported</span>
                    </div>
                    <Textarea
                      placeholder="Provide detailed instructions, textbook page numbers, key formulas, or specific questions students need to solve..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      className="border-sky-200 bg-white text-xs leading-relaxed shadow-sm focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-input/30"
                    />
                  </div>

                  {/* Submission Format */}
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs font-medium">Submission Mode</Label>
                    <div className="grid grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setSubmissionType('ONLINE')}
                        className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition-all ${
                          submissionType === 'ONLINE'
                            ? 'border-sky-400 bg-sky-100/60 font-semibold text-sky-800 shadow-sm dark:bg-sky-500/20 dark:text-sky-200'
                            : 'border-border bg-white text-muted-foreground hover:bg-muted/40 dark:bg-card'
                        }`}
                      >
                        <Upload className="mb-1 size-3.5" />
                        <span className="text-xs">Online Upload</span>
                        <span className="mt-0.5 text-[10px] text-muted-foreground">Photos / PDFs</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSubmissionType('OFFLINE')}
                        className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition-all ${
                          submissionType === 'OFFLINE'
                            ? 'border-emerald-400 bg-emerald-100/60 font-semibold text-emerald-800 shadow-sm dark:bg-emerald-500/20 dark:text-emerald-200'
                            : 'border-border bg-white text-muted-foreground hover:bg-muted/40 dark:bg-card'
                        }`}
                      >
                        <BookOpenCheck className="mb-1 size-3.5" />
                        <span className="text-xs">Notebook Check</span>
                        <span className="mt-0.5 text-[10px] text-muted-foreground">In-Class Check</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSubmissionType('BOTH')}
                        className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition-all ${
                          submissionType === 'BOTH'
                            ? 'border-violet-400 bg-violet-100/60 font-semibold text-violet-800 shadow-sm dark:bg-violet-500/20 dark:text-violet-200'
                            : 'border-border bg-white text-muted-foreground hover:bg-muted/40 dark:bg-card'
                        }`}
                      >
                        <Layers className="mb-1 size-3.5" />
                        <span className="text-xs">Hybrid / Either</span>
                        <span className="mt-0.5 text-[10px] text-muted-foreground">Online or Paper</span>
                      </button>
                    </div>
                  </div>
                </section>

                {/* Section 3: Study Materials & Attachments */}
                <section className="space-y-3 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-3.5 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-teal-500/10">
                  <div className="flex items-center justify-between border-b border-emerald-200/70 pb-2.5 dark:border-emerald-500/20">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                        <Paperclip className="size-3.5 text-white" />
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold tracking-tight">3. Study Materials & Attachments</h3>
                        <p className="text-[10px] text-muted-foreground">Attach reference sheets, reading PDFs, or video links</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/30">
                      {attachments.length} Attached
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-emerald-400 bg-emerald-50/70 px-3.5 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100/60 dark:bg-emerald-950/20 dark:text-emerald-300">
                      <Upload className="size-3.5" />
                      Upload File / Image / PDF
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFileUpload}
                        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt"
                      />
                    </label>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 border-emerald-200 bg-white text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/25 dark:bg-card dark:text-emerald-300"
                      onClick={() => setShowAddLink(!showAddLink)}
                    >
                      <LinkIcon className="size-3" />
                      Add Web Link / Video
                    </Button>
                  </div>

                  {/* Add External Link Drawer */}
                  {showAddLink && (
                    <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 sm:flex-row dark:border-emerald-500/20 dark:bg-emerald-950/20">
                      <Input
                        placeholder="Resource Title (e.g. YouTube Video, Wikipedia)"
                        value={newLinkName}
                        onChange={(e) => setNewLinkName(e.target.value)}
                        className="h-8 border-emerald-200 bg-white text-xs dark:bg-card"
                      />
                      <Input
                        placeholder="https://..."
                        value={newLinkUrl}
                        onChange={(e) => setNewLinkUrl(e.target.value)}
                        className="h-8 border-emerald-200 bg-white text-xs dark:bg-card"
                      />
                      <div className="flex gap-1.5">
                        <Button size="sm" className="h-8 px-3 text-xs" onClick={addExternalLink}>
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-3 text-xs"
                          onClick={() => setShowAddLink(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Attachments List */}
                  {attachments.length > 0 && (
                    <div className="space-y-1.5">
                      {attachments.map((att, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-emerald-200/80 bg-white px-3 py-1.5 text-xs shadow-2xs dark:border-emerald-500/20 dark:bg-card"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            {att.type === 'link' ? (
                              <LinkIcon className="size-3.5 shrink-0 text-blue-500" />
                            ) : (
                              <FileSpreadsheet className="size-3.5 shrink-0 text-emerald-600" />
                            )}
                            <span className="truncate font-medium">{att.name}</span>
                            {att.size && (
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                ({(att.size / 1024).toFixed(0)} KB)
                              </span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeAttachment(idx)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Settings (1 col) */}
          <div className="space-y-4">
            {/* Due Date & Deadlines Card */}
            <Card className="gap-0 overflow-hidden border-amber-200/80 bg-gradient-to-br from-amber-50/60 via-card to-orange-50/60 py-0 shadow-sm dark:border-amber-500/25 dark:from-amber-500/10 dark:via-card dark:to-orange-500/10">
              <CardHeader className="gap-1 border-b border-amber-200/70 bg-gradient-to-r from-amber-100/70 via-white/90 to-orange-100/60 px-4 py-3 !pb-3 dark:border-amber-500/20 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
                    <Clock className="size-3.5 text-white" />
                  </span>
                  <span>Timeline & Deadlines</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                <div className="space-y-1">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    <Calendar className="size-3 text-amber-600" /> Assigned Date
                  </Label>
                  <Input
                    type="date"
                    value={assignedDate}
                    onChange={(e) => setAssignedDate(e.target.value)}
                    className="h-8 border-amber-200 bg-white text-xs shadow-sm dark:border-amber-500/25 dark:bg-card"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1.5 text-xs font-medium">
                      <Clock className="size-3 text-amber-600" /> Due Date <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="h-8 border-amber-200 bg-white text-xs shadow-sm dark:border-amber-500/25 dark:bg-card"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1.5 text-xs font-medium">Due Time</Label>
                    <Input
                      type="time"
                      value={dueTime}
                      onChange={(e) => setDueTime(e.target.value)}
                      className="h-8 border-amber-200 bg-white text-xs shadow-sm dark:border-amber-500/25 dark:bg-card"
                    />
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Presets</span>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 border-amber-200 bg-white px-2 text-[11px] hover:bg-amber-50 dark:border-amber-500/25 dark:bg-card"
                      onClick={() => setPresetDueDate(1)}
                    >
                      Tomorrow
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 border-amber-200 bg-white px-2 text-[11px] hover:bg-amber-50 dark:border-amber-500/25 dark:bg-card"
                      onClick={() => setPresetDueDate(2)}
                    >
                      In 2 Days
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 border-amber-200 bg-white px-2 text-[11px] hover:bg-amber-50 dark:border-amber-500/25 dark:bg-card"
                      onClick={() => setPresetDueDate(3)}
                    >
                      In 3 Days
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 border-amber-200 bg-white px-2 text-[11px] hover:bg-amber-50 dark:border-amber-500/25 dark:bg-card"
                      onClick={() => setPresetDueDate(7)}
                    >
                      Next Week
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Grading & Points Card */}
            <Card className="gap-0 overflow-hidden border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 via-card to-teal-50/60 py-0 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/10 dark:via-card dark:to-teal-500/10">
              <CardHeader className="gap-1 border-b border-emerald-200/70 bg-gradient-to-r from-emerald-100/70 via-white/90 to-teal-100/60 px-4 py-3 !pb-3 dark:border-emerald-500/20 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                      <Award className="size-3.5 text-white" />
                    </span>
                    <span>Grading & Points</span>
                  </CardTitle>
                  <Switch checked={isGraded} onCheckedChange={setIsGraded} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {isGraded ? (
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Maximum Score / Marks</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="1000"
                        value={maxMarks}
                        onChange={(e) => setMaxMarks(e.target.value)}
                        className="h-8 border-emerald-200 bg-white text-xs font-semibold shadow-sm dark:border-emerald-500/25 dark:bg-card"
                      />
                      <span className="text-xs text-muted-foreground">Marks</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Ungraded assignment. Students will receive completion status and teacher feedback without marks.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Notifications Card */}
            <Card className="gap-0 overflow-hidden border-violet-200/80 bg-gradient-to-br from-violet-50/60 via-card to-purple-50/60 py-0 shadow-sm dark:border-violet-500/25 dark:from-violet-500/10 dark:via-card dark:to-purple-500/10">
              <CardHeader className="gap-1 border-b border-violet-200/70 bg-gradient-to-r from-violet-100/70 via-white/90 to-purple-100/60 px-4 py-3 !pb-3 dark:border-violet-500/20 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
                    <Bell className="size-3.5 text-white" />
                  </span>
                  <span>Notification Alerts</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold">Notify Students</Label>
                    <p className="text-[10px] text-muted-foreground">Alert in student portal feed</p>
                  </div>
                  <Switch checked={notifyStudents} onCheckedChange={setNotifyStudents} />
                </div>

                <div className="flex items-center justify-between border-t border-violet-200/50 pt-2.5 dark:border-violet-500/20">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold">Notify Parents</Label>
                    <p className="text-[10px] text-muted-foreground">Add to parent daily diary</p>
                  </div>
                  <Switch checked={notifyParents} onCheckedChange={setNotifyParents} />
                </div>
              </CardContent>
            </Card>

            {/* Submit Action Box */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-primary/10 shadow-sm">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <Sparkles className="size-4" />
                  Ready to assign?
                </div>
                <p className="text-xs text-muted-foreground">
                  Publishing will immediately notify students of {currentClass?.name || 'the class'}.
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    className="w-full gap-2 shadow-sm"
                    onClick={() => handleSubmit('PUBLISHED')}
                    disabled={submitting || loading}
                  >
                    {submitting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <BookOpenCheck className="size-4" />
                    )}
                    Publish Homework
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleSubmit('DRAFT')}
                    disabled={submitting || loading}
                  >
                    Save as Draft
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
