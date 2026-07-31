'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { GradientHero, LoadingState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Save, Eye, AlertCircle, FileText } from 'lucide-react'
import { ReportCardRenderer } from '@/features/exams/components/report-card-renderer'
import {
  buildExamReportCard,
  type ReportCardData,
  type TemplateDef,
  type StudentFieldKey,
} from '@/features/exams/lib/report-card-generator'

interface ReportCardTemplate {
  id: string
  name: string
  description: string | null
  format: string
  appliesToParadigmId: string | null
  layoutJson: string
  includeAttendance: boolean
  includeRank: boolean
  includeCoScholastic: boolean
  showPrincipalRemarks: boolean
  showTeacherRemarks: boolean
  isDefault: boolean
  isActive: boolean
}

interface ParadigmOption {
  id: string
  name: string
  academicYear: string
}

const FORMATS = [
  { value: 'cbse', label: 'CBSE' },
  { value: 'simple', label: 'Simple' },
  { value: 'term_wise', label: 'Term-wise' },
  { value: 'grade_only', label: 'Grade-only' },
  { value: 'coaching', label: 'Coaching' },
]

const STUDENT_FIELD_OPTIONS: ReadonlyArray<{ key: StudentFieldKey; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'admissionNumber', label: 'Admission No.' },
  { key: 'rollNumber', label: 'Roll No.' },
  { key: 'class', label: 'Class' },
  { key: 'section', label: 'Section' },
  { key: 'fatherName', label: "Father's Name" },
  { key: 'motherName', label: "Mother's Name" },
  { key: 'dateOfBirth', label: 'Date of Birth' },
  { key: 'gender', label: 'Gender' },
  { key: 'academicYear', label: 'Academic Year' },
  { key: 'admissionDate', label: 'Admission Date' },
  { key: 'parentPhone', label: 'Parent Phone' },
]

interface LayoutShape {
  header: { showLogo: boolean; showAddress: boolean; showAffiliation: boolean; title: string }
  studentBlock: StudentFieldKey[]
  subjectTable: {
    showComponents: boolean
    showGrade: boolean
    showRank: boolean
    showMaxMarks: boolean
    showPercentage: boolean
  }
  footer: { showAttendance: boolean; showRemarks: boolean; signatures: string[] }
}

const DEFAULT_LAYOUT: LayoutShape = {
  header: { showLogo: true, showAddress: true, showAffiliation: false, title: '' },
  studentBlock: ['name', 'admissionNumber', 'rollNumber', 'class', 'section', 'fatherName', 'motherName'],
  subjectTable: { showComponents: true, showGrade: true, showRank: false, showMaxMarks: true, showPercentage: true },
  footer: { showAttendance: true, showRemarks: true, signatures: ['Class Teacher', 'Principal'] },
}

function parseLayoutSafe(json: string): LayoutShape {
  try {
    const parsed = JSON.parse(json) as Partial<LayoutShape>
    return {
      header: {
        showLogo: parsed.header?.showLogo ?? true,
        showAddress: parsed.header?.showAddress ?? true,
        showAffiliation: parsed.header?.showAffiliation ?? false,
        title: parsed.header?.title ?? '',
      },
      studentBlock: Array.isArray(parsed.studentBlock) && parsed.studentBlock.length > 0
        ? (parsed.studentBlock as StudentFieldKey[])
        : DEFAULT_LAYOUT.studentBlock,
      subjectTable: {
        showComponents: parsed.subjectTable?.showComponents ?? true,
        showGrade: parsed.subjectTable?.showGrade ?? true,
        showRank: parsed.subjectTable?.showRank ?? false,
        showMaxMarks: parsed.subjectTable?.showMaxMarks ?? true,
        showPercentage: parsed.subjectTable?.showPercentage ?? true,
      },
      footer: {
        showAttendance: parsed.footer?.showAttendance ?? true,
        showRemarks: parsed.footer?.showRemarks ?? true,
        signatures: Array.isArray(parsed.footer?.signatures) && parsed.footer.signatures.length > 0
          ? (parsed.footer.signatures as string[])
          : ['Class Teacher', 'Principal'],
      },
    }
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function ReportCardTemplateEditPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [template, setTemplate] = useState<ReportCardTemplate | null>(null)
  const [paradigms, setParadigms] = useState<ParadigmOption[]>([])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [format, setFormat] = useState('cbse')
  const [paradigmId, setParadigmId] = useState<string>('')
  const [includeAttendance, setIncludeAttendance] = useState(true)
  const [includeRank, setIncludeRank] = useState(true)
  const [includeCoScholastic, setIncludeCoScholastic] = useState(true)
  const [showPrincipalRemarks, setShowPrincipalRemarks] = useState(true)
  const [showTeacherRemarks, setShowTeacherRemarks] = useState(true)
  const [isActive, setIsActive] = useState(true)
  const [layout, setLayout] = useState<LayoutShape>(DEFAULT_LAYOUT)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [tplRes, parRes] = await Promise.all([
        api.get<{ template: ReportCardTemplate }>(`/api/school/exams/report-card-templates/${id}`),
        api.get<{ paradigms: ParadigmOption[] }>('/api/school/exams/paradigms'),
      ])
      setTemplate(tplRes.template)
      setName(tplRes.template.name)
      setDescription(tplRes.template.description ?? '')
      setFormat(tplRes.template.format)
      setParadigmId(tplRes.template.appliesToParadigmId ?? '')
      setIncludeAttendance(tplRes.template.includeAttendance)
      setIncludeRank(tplRes.template.includeRank)
      setIncludeCoScholastic(tplRes.template.includeCoScholastic)
      setShowPrincipalRemarks(tplRes.template.showPrincipalRemarks)
      setShowTeacherRemarks(tplRes.template.showTeacherRemarks)
      setIsActive(tplRes.template.isActive)
      setLayout(parseLayoutSafe(tplRes.template.layoutJson))
      setParadigms(parRes.paradigms ?? [])
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load template',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [id, toast])

  useEffect(() => {
    void load()
  }, [load])

  function toggleField(key: StudentFieldKey) {
    setLayout((prev) => ({
      ...prev,
      studentBlock: prev.studentBlock.includes(key)
        ? prev.studentBlock.filter((k) => k !== key)
        : [...prev.studentBlock, key],
    }))
  }

  function updateSignature(idx: number, value: string) {
    setLayout((prev) => {
      const next = [...prev.footer.signatures]
      next[idx] = value
      return { ...prev, footer: { ...prev.footer, signatures: next } }
    })
  }

  function addSignature() {
    setLayout((prev) => ({
      ...prev,
      footer: { ...prev.footer, signatures: [...prev.footer.signatures, ''] },
    }))
  }

  function removeSignature(idx: number) {
    setLayout((prev) => ({
      ...prev,
      footer: {
        ...prev.footer,
        signatures: prev.footer.signatures.filter((_, i) => i !== idx),
      },
    }))
  }

  async function handleSave() {
    if (!name.trim()) {
      toast({ variant: 'destructive', title: 'Name is required' })
      return
    }
    setSaving(true)
    try {
      const cleanSignatures = layout.footer.signatures.map((s) => s.trim()).filter(Boolean)
      const layoutJson = JSON.stringify({
        ...layout,
        footer: { ...layout.footer, signatures: cleanSignatures },
      })
      await api.patch(`/api/school/exams/report-card-templates/${id}`, {
        name: name.trim(),
        description: description.trim() || null,
        format,
        appliesToParadigmId: paradigmId || null,
        includeAttendance,
        includeRank,
        includeCoScholastic,
        showPrincipalRemarks,
        showTeacherRemarks,
        isActive,
        layoutJson,
      })
      toast({ title: 'Template saved' })
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not save',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  // Live preview using a mocked student + result.
  const previewData = useMemo<ReportCardData | null>(() => {
    if (!template) return null
    const cleanSignatures = layout.footer.signatures.map((s) => s.trim()).filter(Boolean)
    const layoutJson = JSON.stringify({
      ...layout,
      footer: { ...layout.footer, signatures: cleanSignatures },
    })
    const tpl: TemplateDef = {
      id: template.id,
      name,
      format,
      layoutJson,
      includeAttendance,
      includeRank,
      includeCoScholastic,
      showPrincipalRemarks,
      showTeacherRemarks,
    }
    return buildExamReportCard({
      template: tpl,
      school: {
        name: 'Demo Public School',
        logo: null,
        address: '123 Education Lane, New Delhi',
        phone: '011-12345678',
        email: 'info@demo.edu',
        website: 'demo.edu',
        affiliationNumber: 'CBSE/1234567',
        registrationNumber: null,
        udiseNumber: '0712345678',
        principalSignature: null,
        academicYear: '2026-2027',
      },
      student: {
        id: 'preview-student',
        firstName: 'Arjun',
        lastName: 'Sharma',
        admissionNumber: 'ADM-2025-001',
        rollNumber: '12',
        dateOfBirth: new Date('2010-04-15'),
        gender: 'Male',
        className: 'Class 10',
        sectionName: 'A',
        fatherName: 'Rakesh Sharma',
        motherName: 'Anita Sharma',
        parentPhone: '+91 98765 43210',
        admissionDate: new Date('2018-04-01'),
      },
      result: {
        examId: 'preview-exam',
        examName: 'Half-Yearly Examination',
        examGroupName: 'Term 1',
        paradigmName: 'CBSE Term Pattern 2026-27',
        academicYear: '2026-2027',
        totalMarks: 500,
        obtainedMarks: 432,
        percentage: 86.4,
        grade: 'A2',
        gradePoint: 9,
        rankInClass: 3,
        rankInSection: 1,
        status: 'pass',
        failedSubjects: null,
        publishedAt: new Date(),
        subjectSummaries: [
          {
            subjectId: 's1',
            subjectName: 'Mathematics',
            totalMarks: 100,
            obtainedMarks: 92,
            percentage: 92,
            grade: 'A1',
            gradePoint: 10,
            status: 'pass',
            componentsJson: JSON.stringify({ Theory: { obtained: 75, max: 80 }, Internal: { obtained: 17, max: 20 } }),
          },
          {
            subjectId: 's2',
            subjectName: 'Science',
            totalMarks: 100,
            obtainedMarks: 88,
            percentage: 88,
            grade: 'A2',
            gradePoint: 9,
            status: 'pass',
            componentsJson: JSON.stringify({ Theory: { obtained: 71, max: 80 }, Practical: { obtained: 17, max: 20 } }),
          },
          {
            subjectId: 's3',
            subjectName: 'English',
            totalMarks: 100,
            obtainedMarks: 84,
            percentage: 84,
            grade: 'A2',
            gradePoint: 9,
            status: 'pass',
            componentsJson: JSON.stringify({ Theory: { obtained: 84, max: 100 } }),
          },
          {
            subjectId: 's4',
            subjectName: 'Social Science',
            totalMarks: 100,
            obtainedMarks: 79,
            percentage: 79,
            grade: 'B1',
            gradePoint: 8,
            status: 'pass',
            componentsJson: JSON.stringify({ Theory: { obtained: 79, max: 100 } }),
          },
          {
            subjectId: 's5',
            subjectName: 'Hindi',
            totalMarks: 100,
            obtainedMarks: 89,
            percentage: 89,
            grade: 'A2',
            gradePoint: 9,
            status: 'pass',
            componentsJson: JSON.stringify({ Theory: { obtained: 89, max: 100 } }),
          },
        ],
      },
      attendance: { totalDays: 120, presentDays: 114, percentage: 95 },
    })
  }, [
    template,
    name,
    format,
    layout,
    includeAttendance,
    includeRank,
    includeCoScholastic,
    showPrincipalRemarks,
    showTeacherRemarks,
  ])

  if (loading) return <LoadingState />
  if (!template) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="size-4" /> Template not found.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <GradientHero
        icon={FileText}
        title={template.name || 'Edit template'}
        description="Tweak the layout below and watch the preview update live. Changes save when you click Save."
        primaryAction={{
          label: saving ? 'Saving…' : 'Save changes',
          icon: Save,
          onClick: () => void handleSave(),
        }}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="gap-0 overflow-hidden rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
            <CardHeader className="border-b border-current/10 pb-3">
              <CardTitle className="text-sm">Basic info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  className="h-9"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Format</Label>
                  <Select value={format} onValueChange={setFormat}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FORMATS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Applies to exam pattern</Label>
                  <Select
                    value={paradigmId || '__any'}
                    onValueChange={(v) => setParadigmId(v === '__any' ? '' : v)}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="Any pattern" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__any">Any pattern</SelectItem>
                      {paradigms.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 pt-2 text-sm">
                <SwitchRow checked={isActive} onChange={setIsActive} label="Active" />
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
            <CardHeader className="border-b border-current/10 pb-3">
              <CardTitle className="text-sm">Sections to include</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <SwitchRow
                checked={includeAttendance}
                onChange={setIncludeAttendance}
                label="Show attendance"
              />
              <SwitchRow
                checked={includeRank}
                onChange={setIncludeRank}
                label="Show rank"
              />
              <SwitchRow
                checked={includeCoScholastic}
                onChange={setIncludeCoScholastic}
                label="Include co-scholastic subjects"
              />
              <SwitchRow
                checked={showPrincipalRemarks}
                onChange={setShowPrincipalRemarks}
                label="Principal remarks block"
              />
              <SwitchRow
                checked={showTeacherRemarks}
                onChange={setShowTeacherRemarks}
                label="Teacher remarks block"
              />
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
            <CardHeader className="border-b border-current/10 pb-3">
              <CardTitle className="text-sm">Header</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <Label className="text-xs">Override title (optional)</Label>
                <Input
                  className="h-9"
                  placeholder="Report Card"
                  value={layout.header.title}
                  onChange={(e) =>
                    setLayout((p) => ({ ...p, header: { ...p.header, title: e.target.value } }))
                  }
                />
              </div>
              <SwitchRow
                checked={layout.header.showLogo}
                onChange={(v) => setLayout((p) => ({ ...p, header: { ...p.header, showLogo: v } }))}
                label="Show school logo"
              />
              <SwitchRow
                checked={layout.header.showAddress}
                onChange={(v) => setLayout((p) => ({ ...p, header: { ...p.header, showAddress: v } }))}
                label="Show school address"
              />
              <SwitchRow
                checked={layout.header.showAffiliation}
                onChange={(v) => setLayout((p) => ({ ...p, header: { ...p.header, showAffiliation: v } }))}
                label="Show affiliation / UDISE"
              />
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
            <CardHeader className="border-b border-current/10 pb-3">
              <CardTitle className="text-sm">Student block</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {STUDENT_FIELD_OPTIONS.map((f) => {
                  const active = layout.studentBlock.includes(f.key)
                  return (
                    <Badge
                      key={f.key}
                      variant={active ? 'default' : 'outline'}
                      className="cursor-pointer select-none"
                      onClick={() => toggleField(f.key)}
                    >
                      {f.label}
                    </Badge>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
            <CardHeader className="border-b border-current/10 pb-3">
              <CardTitle className="text-sm">Subject table</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <SwitchRow
                checked={layout.subjectTable.showComponents}
                onChange={(v) =>
                  setLayout((p) => ({ ...p, subjectTable: { ...p.subjectTable, showComponents: v } }))
                }
                label="Show component breakdown (Theory / Practical / etc.)"
              />
              <SwitchRow
                checked={layout.subjectTable.showMaxMarks}
                onChange={(v) =>
                  setLayout((p) => ({ ...p, subjectTable: { ...p.subjectTable, showMaxMarks: v } }))
                }
                label="Show max marks column"
              />
              <SwitchRow
                checked={layout.subjectTable.showPercentage}
                onChange={(v) =>
                  setLayout((p) => ({ ...p, subjectTable: { ...p.subjectTable, showPercentage: v } }))
                }
                label="Show percentage column"
              />
              <SwitchRow
                checked={layout.subjectTable.showGrade}
                onChange={(v) =>
                  setLayout((p) => ({ ...p, subjectTable: { ...p.subjectTable, showGrade: v } }))
                }
                label="Show grade column"
              />
              <SwitchRow
                checked={layout.subjectTable.showRank}
                onChange={(v) =>
                  setLayout((p) => ({ ...p, subjectTable: { ...p.subjectTable, showRank: v } }))
                }
                label="Show rank card"
              />
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
            <CardHeader className="border-b border-current/10 pb-3">
              <CardTitle className="text-sm">Footer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SwitchRow
                checked={layout.footer.showAttendance}
                onChange={(v) =>
                  setLayout((p) => ({ ...p, footer: { ...p.footer, showAttendance: v } }))
                }
                label="Attendance summary card"
              />
              <SwitchRow
                checked={layout.footer.showRemarks}
                onChange={(v) =>
                  setLayout((p) => ({ ...p, footer: { ...p.footer, showRemarks: v } }))
                }
                label="Remarks block"
              />
              <div className="space-y-1">
                <Label className="text-xs">Signature labels</Label>
                {layout.footer.signatures.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      className="h-8 text-xs"
                      value={s}
                      onChange={(e) => updateSignature(i, e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSignature(i)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addSignature}>
                  + Add signature
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card className="gap-0 overflow-hidden rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
            <CardHeader className="border-b border-current/10 pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Eye className="size-4" /> Live preview (mocked data)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {previewData ? (
                <div className="overflow-hidden rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 p-3 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
                  <ReportCardRenderer data={previewData} />
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground">Preview unavailable.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function SwitchRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}
