'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { GradientHero } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Search, Award, Loader2, UserRound, ShieldAlert, Info, UserRoundCheck, Settings2, Eye,
  CheckCircle2, CalendarDays, X, Users, School as SchoolIcon, ListChecks, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CERTIFICATE_TYPES,
  certificateTypeDef,
  type CertificateSnapshot,
} from '../lib/certificate-types'
import { CertificatePreview } from '../components/certificate-preview'

interface StudentRow {
  id: string
  firstName: string
  lastName: string
  admissionNumber: string | null
  rollNumber: string | null
  admissionStatus: string
  class: { id: string; name: string } | null
  section: { id: string; name: string } | null
  parentLinks: Array<{
    isPrimary: boolean
    relation: string
    parent: { fatherName: string | null; motherName: string | null; phone: string | null }
  }>
}

interface TemplateOption {
  id: string
  type: string
  name: string
  numberPrefix: string
  bodyHtml: string
  isDefault: boolean
  isActive: boolean
}

interface ClassOption {
  id: string
  name: string | null
  sections: Array<{ id: string; name: string; _count?: { students: number } }>
}

function studentName(s: StudentRow): string {
  return [s.firstName, s.lastName].filter(Boolean).join(' ')
}

function studentMeta(s: StudentRow): string {
  const parts: string[] = []
  if (s.admissionNumber) parts.push(s.admissionNumber)
  if (s.class) parts.push(`${s.class.name}${s.section ? `-${s.section.name}` : ''}`)
  return parts.join(' · ')
}

function buildPreviewSnapshot(student: StudentRow, academicYear: string): CertificateSnapshot | null {
  if (!student) return null
  const primary = student.parentLinks.find((p) => p.isPrimary) || student.parentLinks[0]
  return {
    issuedAt: new Date().toISOString(),
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      fullName: [student.firstName, student.lastName].filter(Boolean).join(' '),
      admissionNumber: student.admissionNumber,
      rollNumber: student.rollNumber,
      className: student.class?.name || '',
      sectionName: student.section ? `, Section ${student.section.name}` : '',
      academicYear,
      dateOfBirth: '',
      gender: '',
      nationality: 'Indian',
      religion: '',
      category: '',
      motherTongue: '',
      bloodGroup: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      dateOfAdmission: '',
      previousSchool: '',
      previousClass: '',
      fatherName: primary?.parent.fatherName || '',
      motherName: primary?.parent.motherName || '',
      parentPhone: primary?.parent.phone || '',
    },
    school: {
      id: '',
      name: 'School Name',
      address: '',
      city: '',
      state: '',
      pincode: '',
      phone: '',
      email: '',
      website: '',
      board: '',
      registrationNumber: '',
      affiliationNumber: '',
      udiseNumber: '',
      principalName: '',
      trustName: '',
      academicYear,
    },
  }
}

export function CertificateIssuePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const currentSchool = useAppStore((s) => s.currentSchool)

  // Mode — single student or bulk (class/section multi-select)
  const [mode, setMode] = useState<'single' | 'bulk'>('single')

  // Single mode
  const [students, setStudents] = useState<StudentRow[]>([])
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null)

  // Bulk mode
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [classId, setClassId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [bulkStudents, setBulkStudents] = useState<StudentRow[]>([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [selectedBulk, setSelectedBulk] = useState<StudentRow[]>([])

  // Shared certificate details
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [type, setType] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [isTemporary, setIsTemporary] = useState(true)
  const [effectiveDate, setEffectiveDate] = useState('')
  const [purpose, setPurpose] = useState('')
  const [remarks, setRemarks] = useState('')
  const [issuing, setIssuing] = useState(false)

  useEffect(() => {
    api
      .get<{ templates: TemplateOption[] }>('/api/school/certificates/templates')
      .then((res) => {
        setTemplates(res.templates)
        const pre = searchParams.get('templateId')
        if (pre) {
          const target = res.templates.find((t) => t.id === pre && t.isActive)
          if (target) {
            setType(target.type)
            setTemplateId(target.id)
          }
        }
      })
      .catch(() => setTemplates([]))
  }, [])

  useEffect(() => {
    api
      .get<{ classes: ClassOption[] }>('/api/school/classes')
      .then((res) => setClasses(res.classes))
      .catch(() => setClasses([]))
  }, [])

  const typeTemplates = useMemo(() => templates.filter((t) => t.type === type && t.isActive), [templates, type])

  // Auto-select the default template of the chosen type.
  useEffect(() => {
    if (!type) {
      setTemplateId('')
      return
    }
    const list = templates.filter((t) => t.type === type && t.isActive)
    if (!list.some((t) => t.id === templateId)) {
      const preferred = list.find((t) => t.isDefault) || list[0]
      setTemplateId(preferred?.id || '')
    }
  }, [type, templates])

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) || null,
    [templates, templateId],
  )

  const academicYear = currentSchool?.academicYear || ''
  const previewSnapshot = useMemo(
    () => (selectedStudent ? buildPreviewSnapshot(selectedStudent, academicYear) : null),
    [selectedStudent, academicYear],
  )

  const selectedClass = useMemo(() => classes.find((c) => c.id === classId) || null, [classes, classId])

  // Bulk: load students when class/section changes
  const loadBulkStudents = useCallback(async () => {
    if (!classId) {
      setBulkStudents([])
      setSelectedBulk([])
      return
    }
    setBulkLoading(true)
    try {
      const params: Record<string, string> = { classId, limit: '300' }
      if (sectionId) params.sectionId = sectionId
      const res = await api.get<{ students: StudentRow[] }>('/api/school/certificates/students', params)
      setBulkStudents(res.students)
      setSelectedBulk((prev) => prev.filter((s) => res.students.some((x) => x.id === s.id)))
    } catch (err) {
      toast({ title: 'Could not load students', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' })
      setBulkStudents([])
    } finally {
      setBulkLoading(false)
    }
  }, [classId, sectionId, toast])

  useEffect(() => {
    void loadBulkStudents()
  }, [loadBulkStudents])

  const selectedBulkIds = useMemo(() => new Set(selectedBulk.map((s) => s.id)), [selectedBulk])
  const allBulkSelected = useMemo(
    () => bulkStudents.length > 0 && bulkStudents.every((s) => selectedBulkIds.has(s.id)),
    [bulkStudents, selectedBulkIds],
  )

  function toggleBulkStudent(s: StudentRow) {
    setSelectedBulk((prev) => (selectedBulkIds.has(s.id) ? prev.filter((x) => x.id !== s.id) : [...prev, s]))
  }

  function toggleAllBulk() {
    setSelectedBulk((prev) => {
      const base = allBulkSelected ? prev.filter((x) => !bulkStudents.some((r) => r.id === x.id)) : [...prev]
      if (!allBulkSelected) {
        for (const s of bulkStudents) {
          if (!base.some((x) => x.id === s.id)) base.push(s)
        }
      }
      return base
    })
  }

  function removeBulkStudent(id: string) {
    setSelectedBulk((prev) => prev.filter((x) => x.id !== id))
  }

  async function runSearch() {
    const q = search.trim()
    if (!q && !selectedStudent) return
    setSearching(true)
    try {
      const res = await api.get<{ students: StudentRow[] }>('/api/school/certificates/students', {
        search: q,
        limit: '50',
      })
      setStudents(res.students)
    } catch (err) {
      toast({ title: 'Search failed', description: err instanceof Error ? err.message : 'Could not load students.', variant: 'destructive' })
    } finally {
      setSearching(false)
    }
  }

  function pickStudent(s: StudentRow) {
    setSelectedStudent(s)
    setStudents([])
    setSearch('')
  }

  async function handleIssue() {
    if (issuing) return
    if (mode === 'single') {
      if (!selectedStudent) {
        toast({ title: 'Select a student', variant: 'destructive' })
        return
      }
      if (!type) {
        toast({ title: 'Select a certificate type', variant: 'destructive' })
        return
      }
      setIssuing(true)
      try {
        const res = await api.post<{ certificate: { id: string; certificateNumber: string } }>('/api/school/certificates', {
          studentId: selectedStudent.id,
          type,
          templateId: templateId || undefined,
          isTemporary,
          effectiveDate: effectiveDate || undefined,
          purpose: purpose || undefined,
          remarks: remarks || undefined,
        })
        toast({
          title: 'Certificate issued',
          description: `${res.certificate.certificateNumber} recorded. The student record was not modified.`,
        })
        window.open(`/print/certificates/${res.certificate.id}`, '_blank')
        router.push('/certificates/records')
      } catch (err) {
        toast({ title: 'Issue failed', description: err instanceof Error ? err.message : 'Could not issue certificate.', variant: 'destructive' })
      } finally {
        setIssuing(false)
      }
      return
    }

    // Bulk
    if (selectedBulk.length === 0) {
      toast({ title: 'Select at least one student', variant: 'destructive' })
      return
    }
    if (!type) {
      toast({ title: 'Select a certificate type', variant: 'destructive' })
      return
    }
    setIssuing(true)
    try {
      const res = await api.post<{ count: number; certificates: Array<{ id: string; certificateNumber: string }> }>(
        '/api/school/certificates/bulk',
        {
          studentIds: selectedBulk.map((s) => s.id),
          type,
          templateId: templateId || undefined,
          isTemporary,
          effectiveDate: effectiveDate || undefined,
          purpose: purpose || undefined,
          remarks: remarks || undefined,
        },
      )
      const numbers = res.certificates.map((c) => c.certificateNumber)
      toast({
        title: `${res.count} certificate${res.count === 1 ? '' : 's'} issued`,
        description:
          numbers.length > 3
            ? `${numbers[0]} … ${numbers[numbers.length - 1]} — the student records were not modified.`
            : `${numbers.join(', ')} — the student records were not modified.`,
      })
      router.push('/certificates/records')
    } catch (err) {
      toast({ title: 'Bulk issue failed', description: err instanceof Error ? err.message : 'Could not issue certificates.', variant: 'destructive' })
    } finally {
      setIssuing(false)
    }
  }

  const bulkReady = mode === 'bulk' && selectedBulk.length > 0 && !!type
  const singleReady = mode === 'single' && !!selectedStudent && !!type

  return (
    <div className="space-y-4">
      <GradientHero
        icon={Award}
        title="Issue Certificate"
        badge={mode === 'bulk' && selectedBulk.length > 0 ? `${selectedBulk.length} student${selectedBulk.length === 1 ? '' : 's'} selected` : 'Record only'}
        description="Issue a TC, bonafide, character or other certificate. The student stays fully on the rolls — nothing about their record changes."
        primaryAction={{
          label: issuing
            ? 'Issuing…'
            : mode === 'bulk'
              ? `Issue ${selectedBulk.length > 0 ? selectedBulk.length : ''} Certificate${selectedBulk.length === 1 ? '' : 's'}`
              : 'Issue Certificate',
          icon: Award,
          onClick: handleIssue,
          disabled: issuing || !(bulkReady || singleReady),
        }}
        extraActions={
          <div className="flex items-center gap-1 rounded-lg border border-white/25 bg-white/10 p-0.5 shadow-md backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors',
                mode === 'single' ? 'bg-white text-primary shadow-sm' : 'text-white/85 hover:bg-white/15 hover:text-white',
              )}
            >
              <UserRound className="size-3.5" /> Single
            </button>
            <button
              type="button"
              onClick={() => setMode('bulk')}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors',
                mode === 'bulk' ? 'bg-white text-primary shadow-sm' : 'text-white/85 hover:bg-white/15 hover:text-white',
              )}
            >
              <Users className="size-3.5" /> Bulk
            </button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
            <div className="flex items-center gap-3 border-b border-current/10 bg-gradient-to-r from-sky-500/[0.08] via-white/40 to-cyan-500/[0.08] p-3.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm">
                <UserRoundCheck className="size-4 text-white" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold leading-tight">
                  1 · {mode === 'single' ? 'Select student' : 'Select students'}
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  {mode === 'single'
                    ? 'Search by name, admission no. or roll no.'
                    : 'Pick a class (and section) and tick the students to include.'}
                </p>
              </div>
              {mode === 'bulk' && selectedBulk.length > 0 && (
                <Badge
                  variant="outline"
                  className="h-5 shrink-0 rounded-md border-emerald-200 bg-emerald-50 px-1.5 text-[10px] text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                >
                  {selectedBulk.length} selected
                </Badge>
              )}
            </div>

            <CardContent className="space-y-3 p-4">
              {mode === 'single' ? (
                selectedStudent ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-sky-200/80 bg-white/70 p-3 shadow-sm dark:border-sky-500/25 dark:bg-card/60">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium">{studentName(selectedStudent)}</p>
                        <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                          Selected
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{studentMeta(selectedStudent)}</p>
                    </div>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setSelectedStudent(null)}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="h-9 border-sky-200 bg-white pl-9 pr-9 shadow-sm focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-input/30"
                        placeholder="Search by name, admission no. or roll no."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                      />
                      {search && (
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Clear search"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 border-sky-200 bg-sky-50 text-sky-700 text-xs hover:bg-sky-100 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300"
                      onClick={runSearch}
                      disabled={searching}
                    >
                      {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />} Search students
                    </Button>
                    {students.length > 0 && (
                      <ScrollArea className="max-h-64 rounded-md border border-sky-200/80 bg-white/70 dark:border-sky-500/25 dark:bg-card/60">
                        <div className="divide-y divide-sky-100/60 dark:divide-sky-500/10">
                          {students.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => pickStudent(s)}
                              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-sky-50/70 dark:hover:bg-sky-500/10"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{studentName(s)}</p>
                                <p className="text-xs text-muted-foreground">{studentMeta(s)}</p>
                              </div>
                              <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 text-[10px] capitalize">
                                {s.admissionStatus}
                              </Badge>
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </>
                )
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Class</Label>
                      <Select value={classId} onValueChange={(v) => { setClassId(v); setSectionId('') }}>
                        <SelectTrigger
                          leadingIcon={<SchoolIcon className="size-3.5 text-white" />}
                          leadingIconClassName="from-sky-500 to-cyan-600"
                          className="h-9 w-full border-sky-200 bg-white dark:border-sky-500/25 dark:bg-input/30"
                        >
                          <SelectValue placeholder="Select class" />
                        </SelectTrigger>
                        <SelectContent>
                          {classes.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name || 'Unnamed class'}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Section</Label>
                      <Select value={sectionId} onValueChange={setSectionId} disabled={!classId}>
                        <SelectTrigger
                          leadingIcon={<ListChecks className="size-3.5 text-white" />}
                          leadingIconClassName="from-cyan-500 to-teal-600"
                          className="h-9 w-full border-sky-200 bg-white dark:border-sky-500/25 dark:bg-input/30"
                        >
                          <SelectValue placeholder={classId ? 'All sections' : 'Select class first'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All sections</SelectItem>
                          {selectedClass?.sections.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                              {typeof s._count?.students === 'number' ? ` (${s._count.students})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {bulkLoading ? (
                    <div className="flex items-center justify-center gap-2 rounded-lg border border-sky-200/80 bg-white/70 py-6 text-xs text-muted-foreground dark:border-sky-500/25 dark:bg-card/60">
                      <Loader2 className="size-3.5 animate-spin" /> Loading students…
                    </div>
                  ) : classId && bulkStudents.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between rounded-lg border border-sky-200/80 bg-white/70 px-3 py-2 shadow-sm dark:border-sky-500/25 dark:bg-card/60">
                        <p className="text-xs text-muted-foreground">
                          {bulkStudents.length} student{bulkStudents.length === 1 ? '' : 's'} found
                        </p>
                        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={toggleAllBulk}>
                          <ListChecks className="size-3.5" />
                          {allBulkSelected ? 'Remove all' : 'Select all'}
                        </Button>
                      </div>
                      <ScrollArea className="max-h-64 rounded-md border border-sky-200/80 bg-white/70 dark:border-sky-500/25 dark:bg-card/60">
                        <div className="divide-y divide-sky-100/60 dark:divide-sky-500/10">
                          {bulkStudents.map((s) => (
                            <label
                              key={s.id}
                              className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition hover:bg-sky-50/70 dark:hover:bg-sky-500/10"
                            >
                              <Checkbox checked={selectedBulkIds.has(s.id)} onCheckedChange={() => toggleBulkStudent(s)} />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">{studentName(s)}</p>
                                <p className="text-xs text-muted-foreground">{studentMeta(s)}</p>
                              </div>
                              <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 text-[10px] capitalize">
                                {s.admissionStatus}
                              </Badge>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </>
                  ) : classId ? (
                    <p className="rounded-lg border border-sky-200/80 bg-white/70 px-3 py-2 text-xs text-muted-foreground dark:border-sky-500/25 dark:bg-card/60">
                      No admitted students found in this class{sectionId ? ' / section' : ''}.
                    </p>
                  ) : null}

                  {selectedBulk.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground">Selected students</p>
                      <ScrollArea className="max-h-40 rounded-md border border-emerald-200/80 bg-white/70 dark:border-emerald-500/25 dark:bg-card/60">
                        <div className="flex flex-wrap gap-1.5 p-2">
                          {selectedBulk.map((s) => (
                            <Badge
                              key={s.id}
                              variant="outline"
                              className="h-7 gap-1.5 rounded-md border-emerald-200 bg-emerald-50 px-2 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                            >
                              <span className="max-w-40 truncate">{studentName(s)}</span>
                              <button
                                type="button"
                                onClick={() => removeBulkStudent(s.id)}
                                className="rounded-full text-emerald-700/60 transition-colors hover:text-emerald-900 dark:text-emerald-300/60 dark:hover:text-emerald-100"
                                aria-label={`Remove ${studentName(s)}`}
                              >
                                <X className="size-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 py-0 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10">
            <div className="flex items-center gap-3 border-b border-current/10 bg-gradient-to-r from-violet-500/[0.08] via-white/40 to-purple-500/[0.08] p-3.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
                <Settings2 className="size-4 text-white" />
              </span>
              <div>
                <h3 className="text-sm font-semibold leading-tight">2 · Certificate details</h3>
                <p className="text-[10px] text-muted-foreground">
                  {mode === 'bulk' ? 'Applied to every selected student.' : 'Type, template and the printed fields.'}
                </p>
              </div>
            </div>
            <CardContent className="space-y-4 p-4">
              <div className="space-y-2">
                <Label>Certificate type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger
                    leadingIcon={<CheckCircle2 className="size-3.5 text-white" />}
                    leadingIconClassName="from-violet-500 to-purple-600"
                    className="h-9 w-full border-violet-200 bg-white dark:border-violet-500/25 dark:bg-input/30"
                  >
                    <SelectValue placeholder="Select certificate type" />
                  </SelectTrigger>
                  <SelectContent>
                    {CERTIFICATE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {type && (
                  <p className="text-xs text-muted-foreground">{certificateTypeDef(type).description}</p>
                )}
              </div>

              {typeTemplates.length > 0 && (
                <div className="space-y-2">
                  <Label>Template</Label>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger
                      leadingIcon={<Eye className="size-3.5 text-white" />}
                      leadingIconClassName="from-fuchsia-500 to-pink-600"
                      className="h-9 w-full border-violet-200 bg-white dark:border-violet-500/25 dark:bg-input/30"
                    >
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {typeTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                          {t.isDefault ? ' (default)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-start gap-3 rounded-lg border border-amber-300/60 bg-amber-50/70 p-3 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
                <Checkbox
                  id="is-temporary"
                  checked={isTemporary}
                  onCheckedChange={(v) => setIsTemporary(v === true)}
                />
                <div>
                  <Label htmlFor="is-temporary" className="font-medium text-amber-900 dark:text-amber-200">
                    Issue as temporary certificate{type === 'tc' ? ' (Temporary TC)' : ''}
                  </Label>
                  <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/70">
                    Recommended. The certificate{ mode === 'bulk' ? 's' : ''} {mode === 'bulk' ? 'are' : 'is'} recorded and printed,
                    but the student&apos;s enrollment, attendance, fees and status are untouched — no withdrawal is created.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Purpose (shown on certificate)</Label>
                  <Input
                    className="h-9 border-violet-200 bg-white shadow-sm focus-visible:border-violet-400 focus-visible:ring-violet-400/20 dark:border-violet-500/25 dark:bg-input/30"
                    placeholder="e.g. bank loan, passport, higher studies"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                  />
                </div>
                {type === 'tc' && (
                  <div className="space-y-2">
                    <Label>Leaving date (informational only)</Label>
                    <div className="relative">
                      <CalendarDays className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="date"
                        className="h-9 border-violet-200 bg-white pl-8 shadow-sm focus-visible:border-violet-400 focus-visible:ring-violet-400/20 dark:border-violet-500/25 dark:bg-input/30"
                        value={effectiveDate}
                        onChange={(e) => setEffectiveDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Remarks</Label>
                <Textarea
                  rows={2}
                  className="border-violet-200 bg-white shadow-sm focus-visible:border-violet-400 focus-visible:ring-violet-400/20 dark:border-violet-500/25 dark:bg-input/30"
                  placeholder="Internal note (not printed unless you add {{remarks}} to the template)"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {type === 'tc' && !isTemporary && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <p>
                You&apos;re issuing <strong>final TC{mode === 'bulk' ? 's' : ''}</strong> without the temporary flag. These certificate{mode === 'bulk' ? 's are' : ' is'} still{' '}
                <strong>record-only</strong> — no student record is changed by this module. Use the
                student&apos;s <em>Withdraw / Issue TC</em> action for the official permanent withdrawal flow.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="gap-0 overflow-hidden border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 py-0 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
            <div className="flex items-center gap-3 border-b border-current/10 bg-gradient-to-r from-emerald-500/[0.08] via-white/40 to-teal-500/[0.08] p-3.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                {mode === 'bulk' ? <Sparkles className="size-4 text-white" /> : <Eye className="size-4 text-white" />}
              </span>
              <div>
                <h3 className="text-sm font-semibold leading-tight">{mode === 'bulk' ? 'Summary' : 'Preview'}</h3>
                <p className="text-[10px] text-muted-foreground">
                  {mode === 'bulk' ? 'Review the batch before issuing.' : 'What the printed certificate will look like.'}
                </p>
              </div>
            </div>
            <CardContent className="space-y-3 p-4">
              {mode === 'single' ? (
                selectedStudent && selectedTemplate ? (
                  <>
                    <CertificatePreview
                      bodyHtml={selectedTemplate.bodyHtml}
                      snapshot={previewSnapshot}
                      certificateNumber={`${selectedTemplate.numberPrefix}-${new Date().getFullYear()}-0001`}
                      effectiveDate={effectiveDate ? new Date(effectiveDate) : null}
                      purpose={purpose}
                      remarks={remarks}
                    />
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Info className="mt-0.5 size-3.5 shrink-0" />
                      <p>
                        Preview shows sample values for empty fields. The printed certificate uses the exact data
                        captured at issue time.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
                    <span className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
                      <UserRound className="size-6 text-white" />
                    </span>
                    <p className="font-medium text-foreground">Nothing to preview yet</p>
                    <p>Select a student and a certificate type to preview the certificate before issuing.</p>
                  </div>
                )
              ) : selectedBulk.length === 0 ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md">
                    <Users className="size-6 text-white" />
                  </span>
                  <p className="font-medium text-foreground">No students selected</p>
                  <p>Pick a class (and section) and tick the students to include.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-emerald-200/80 bg-white/70 p-2.5 text-center shadow-sm dark:border-emerald-500/25 dark:bg-card/60">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Students</p>
                      <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{selectedBulk.length}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200/80 bg-white/70 p-2.5 text-center shadow-sm dark:border-emerald-500/25 dark:bg-card/60">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</p>
                      <p className="truncate text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                        {type ? certificateTypeDef(type).shortLabel : '—'}
                      </p>
                    </div>
                  </div>

                  <ScrollArea className="max-h-56 rounded-md border border-emerald-200/80 bg-white/70 dark:border-emerald-500/25 dark:bg-card/60">
                    <div className="divide-y divide-emerald-100/60 dark:divide-emerald-500/10">
                      {selectedBulk.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 text-[10px] font-bold text-white">
                            {studentName(s).charAt(0)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{studentName(s)}</p>
                            <p className="truncate text-xs text-muted-foreground">{studentMeta(s)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeBulkStudent(s.id)}
                            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-emerald-50 hover:text-destructive dark:hover:bg-emerald-500/10"
                            aria-label={`Remove ${studentName(s)}`}
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>

                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    <p>
                      One certificate per student, each with its own number (auto-allocated) and a snapshot of the
                      student&apos;s data captured now. Nothing on the student records changes.
                    </p>
                  </div>

                  <Button onClick={handleIssue} disabled={issuing || !bulkReady} className="h-9 w-full gap-1.5">
                    {issuing ? <Loader2 className="size-4 animate-spin" /> : <Award className="size-4" />}
                    {issuing ? 'Issuing…' : `Issue ${selectedBulk.length} certificate${selectedBulk.length === 1 ? '' : 's'}`}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}