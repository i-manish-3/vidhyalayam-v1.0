'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { LoadingState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { PERMISSIONS, usePermissions } from '@/hooks/use-permissions'
import { useAppStore } from '@/lib/store'
import {
  Save,
  Eye,
  AlertCircle,
  FileText,
  Heading,
  UserRound,
  Table2,
  FileSignature,
  SlidersHorizontal,
  ArrowLeft,
  Check,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Sparkles,
  Layers,
  Award,
  BookOpen,
  Calendar,
  Building,
  School,
  CheckCircle2,
  Printer,
} from 'lucide-react'
import { ReportCardRenderer } from '@/features/exams/components/report-card-renderer'
import {
  buildExamReportCard,
  buildMultiExamReportCard,
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
  isActive: boolean
}

interface ParadigmOption {
  id: string
  name: string
  academicYear: string
}

const FORMATS = [
  { value: 'cbse', label: 'CBSE Standard' },
  { value: 'simple', label: 'Simple' },
  { value: 'term_wise', label: 'Term-wise (Multi-Exam)' },
  { value: 'grade_only', label: 'Grade-only' },
  { value: 'coaching', label: 'Coaching / Academy' },
]

const STUDENT_FIELD_CATEGORIES: Array<{
  category: string
  fields: Array<{ key: StudentFieldKey; label: string; desc?: string }>
}> = [
  {
    category: 'Student Identity',
    fields: [
      { key: 'name', label: 'Student Name', desc: 'Full student name' },
      { key: 'admissionNumber', label: 'Admission No.', desc: 'School registration number' },
      { key: 'rollNumber', label: 'Roll Number', desc: 'Exam/Class roll number' },
      { key: 'gender', label: 'Gender', desc: 'Male / Female / Other' },
      { key: 'dateOfBirth', label: 'Date of Birth', desc: 'DOB from profile' },
    ],
  },
  {
    category: 'Class & Academic Info',
    fields: [
      { key: 'class', label: 'Class', desc: 'Grade or standard' },
      { key: 'section', label: 'Section', desc: 'Class section (A, B...)' },
      { key: 'academicYear', label: 'Academic Year', desc: 'e.g. 2025-2026' },
      { key: 'admissionDate', label: 'Admission Date', desc: 'Joining date' },
    ],
  },
  {
    category: 'Parent & Contact',
    fields: [
      { key: 'fatherName', label: "Father's Name", desc: 'Father / Guardian' },
      { key: 'motherName', label: "Mother's Name", desc: 'Mother' },
      { key: 'parentPhone', label: 'Parent Phone', desc: 'Primary contact' },
    ],
  },
]

interface LayoutShape {
  header: {
    showPrintHeader?: boolean
    showLogo: boolean
    showAddress: boolean
    showAffiliation: boolean
    title: string
  }
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
  header: { showPrintHeader: true, showLogo: true, showAddress: true, showAffiliation: false, title: '' },
  studentBlock: ['name', 'admissionNumber', 'rollNumber', 'class', 'section', 'fatherName', 'motherName'],
  subjectTable: { showComponents: true, showGrade: true, showRank: false, showMaxMarks: true, showPercentage: true },
  footer: { showAttendance: true, showRemarks: true, signatures: ['Parent / Guardian', 'Class Teacher', 'Principal'] },
}

const DEFAULT_PREVIEW_BANDS = [
  { code: 'A1', minValue: 91, maxValue: 100, gradePoint: 10, remark: 'Outstanding' },
  { code: 'A2', minValue: 81, maxValue: 90, gradePoint: 9, remark: 'Excellent' },
  { code: 'B1', minValue: 71, maxValue: 80, gradePoint: 8, remark: 'Very Good' },
  { code: 'B2', minValue: 61, maxValue: 70, gradePoint: 7, remark: 'Good' },
  { code: 'C1', minValue: 51, maxValue: 60, gradePoint: 6, remark: 'Fair' },
  { code: 'C2', minValue: 41, maxValue: 50, gradePoint: 5, remark: 'Average' },
  { code: 'D', minValue: 33, maxValue: 40, gradePoint: 4, remark: 'Needs Improvement' },
  { code: 'E1', minValue: 21, maxValue: 32, gradePoint: null, remark: 'Needs Substantial Improvement' },
  { code: 'E2', minValue: 0, maxValue: 20, gradePoint: null, remark: 'Unsatisfactory' },
]

function parseLayoutSafe(json: string): LayoutShape {
  try {
    const parsed = JSON.parse(json) as Partial<LayoutShape>
    return {
      header: {
        showPrintHeader: parsed.header?.showPrintHeader ?? true,
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

function ReportCardTemplateEditPageInner() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const id = params?.id ?? ''
  const isNew = id === 'new' || !id
  const cloneFromId = searchParams.get('cloneFrom')
  const { toast } = useToast()
  const { hasAnyPermission } = usePermissions()
  const currentSchool = useAppStore((state) => state.currentSchool)

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
  const [previewMode, setPreviewMode] = useState<'single' | 'multi'>('single')
  const [activeTab, setActiveTab] = useState('header')
  const [zoomLevel, setZoomLevel] = useState<number>(95)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const parRes = await api.get<{ paradigms: ParadigmOption[] }>('/api/school/exams/paradigms')
      setParadigms(parRes.paradigms ?? [])

      if (isNew) {
        if (cloneFromId) {
          const srcRes = await api.get<{ template: ReportCardTemplate }>(
            `/api/school/exams/report-card-templates/${cloneFromId}`,
          )
          const src = srcRes.template
          const draft: ReportCardTemplate = {
            ...src,
            id: 'new',
            name: `${src.name} (Copy)`,
          }
          setTemplate(draft)
          setName(draft.name)
          setDescription(src.description ?? '')
          setFormat(src.format)
          setParadigmId(src.appliesToParadigmId ?? '')
          setIncludeAttendance(src.includeAttendance)
          setIncludeRank(src.includeRank)
          setIncludeCoScholastic(src.includeCoScholastic)
          setShowPrincipalRemarks(src.showPrincipalRemarks)
          setShowTeacherRemarks(src.showTeacherRemarks)
          setIsActive(src.isActive)
          setLayout(parseLayoutSafe(src.layoutJson))
        } else {
          const draft: ReportCardTemplate = {
            id: 'new',
            name: 'New Report Card Template',
            description: null,
            format: 'cbse',
            appliesToParadigmId: null,
            layoutJson: JSON.stringify(DEFAULT_LAYOUT),
            includeAttendance: true,
            includeRank: true,
            includeCoScholastic: true,
            showPrincipalRemarks: true,
            showTeacherRemarks: true,
            isActive: true,
          }
          setTemplate(draft)
          setName(draft.name)
          setDescription('')
          setFormat('cbse')
          setParadigmId('')
          setIncludeAttendance(true)
          setIncludeRank(true)
          setIncludeCoScholastic(true)
          setShowPrincipalRemarks(true)
          setShowTeacherRemarks(true)
          setIsActive(true)
          setLayout(DEFAULT_LAYOUT)
        }
      } else {
        const tplRes = await api.get<{ template: ReportCardTemplate }>(
          `/api/school/exams/report-card-templates/${id}`,
        )
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
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load template',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [id, isNew, cloneFromId, toast])

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

  function selectStandardFields() {
    setLayout((prev) => ({
      ...prev,
      studentBlock: DEFAULT_LAYOUT.studentBlock,
    }))
  }

  function selectAllFields() {
    const all = STUDENT_FIELD_CATEGORIES.flatMap((c) => c.fields.map((f) => f.key))
    setLayout((prev) => ({
      ...prev,
      studentBlock: Array.from(new Set(all)),
    }))
  }

  function clearAllFields() {
    setLayout((prev) => ({
      ...prev,
      studentBlock: ['name'],
    }))
  }

  function updateSignature(idx: number, value: string) {
    setLayout((prev) => {
      const next = [...prev.footer.signatures]
      next[idx] = value
      return { ...prev, footer: { ...prev.footer, signatures: next } }
    })
  }

  function addSignature(label = '') {
    setLayout((prev) => ({
      ...prev,
      footer: { ...prev.footer, signatures: [...prev.footer.signatures, label] },
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
      if (isNew) {
        const res = await api.post<{ template: { id: string } }>(
          '/api/school/exams/report-card-templates',
          {
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
          },
        )
        toast({
          variant: 'success',
          title: 'Template created',
          description: 'Your new template has been saved.',
        })
        router.replace(`/exams/report-card-templates/${res.template.id}/edit`)
      } else {
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
        toast({
          variant: 'success',
          title: 'Template saved successfully',
          description: 'All changes are now active.',
        })
        void load()
      }
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

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) && !saving) {
          void handleSave()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saving, name, description, format, paradigmId, includeAttendance, includeRank, includeCoScholastic, showPrincipalRemarks, showTeacherRemarks, isActive, layout])

  // Live preview data using realistic mock student and school information
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

    const schoolInfo = {
      name: currentSchool?.name || 'Dayaramka International Public School',
      logo: currentSchool?.logo || null,
      printHeader:
        currentSchool?.printHeader ||
        'https://pub-15ae4ae4a9ec49a49881b23f339e257d.r2.dev/schools/cmqeozmz40161llsw20nnmpio/print-header/7777758630a252ae358343f8.jpg',
      address: currentSchool?.address || 'Awkari Chowk, Bairgania, Sitamarhi, Bihar - 843313',
      board: currentSchool?.board || 'CBSE',
      phone: currentSchool?.contactPhone || '+91 98765 43210',
      email: currentSchool?.contactEmail || 'info@dayaramka.edu',
      website: currentSchool?.website || 'dayaramka.edu',
      affiliationNumber: currentSchool?.affiliationNumber || 'CBSE/1234567',
      registrationNumber: currentSchool?.registrationNumber || null,
      udiseNumber: currentSchool?.udiseNumber || '10012345678',
      principalSignature: currentSchool?.principalSignature || null,
      academicYear: currentSchool?.academicYear || '2025-2026',
    }

    if (previewMode === 'multi' || format === 'term_wise') {
      return buildMultiExamReportCard({
        template: tpl,
        school: schoolInfo,
        student: {
          id: 'preview-student',
          firstName: 'Md',
          lastName: 'Adil',
          admissionNumber: 'ADM-2025-001',
          rollNumber: '1',
          dateOfBirth: new Date('2010-04-15'),
          gender: 'Male',
          className: '10',
          sectionName: 'A',
          fatherName: 'Md Shabbir Ahmad',
          motherName: 'Rehana Praveen',
          parentPhone: '+91 98765 43210',
          admissionDate: new Date('2018-04-01'),
        },
        examGroup: {
          id: 'term-1',
          name: 'Term 1',
          paradigmName: 'CBSE Term Pattern 2025-26',
          academicYear: '2025-2026',
        },
        exams: [
          { id: 'ut-1', name: 'Unit Test 1', shortCode: 'UT1' },
          { id: 'ut-2', name: 'Unit Test 2', shortCode: 'UT2' },
          { id: 'hy', name: 'Half-Yearly Exam', shortCode: 'HY' },
        ],
        examResults: [
          {
            examId: 'ut-1',
            examName: 'Unit Test 1',
            examGroupName: 'Term 1',
            paradigmName: 'CBSE Term Pattern 2025-26',
            academicYear: '2025-2026',
            totalMarks: 125,
            obtainedMarks: 112,
            percentage: 89.6,
            grade: 'A2',
            gradePoint: 9,
            rankInClass: 2,
            rankInSection: 1,
            status: 'pass',
            failedSubjects: null,
            publishedAt: new Date(),
            subjectSummaries: [
              { subjectId: 's1', subjectName: 'ENGLISH', totalMarks: 25, obtainedMarks: 20, percentage: 80, grade: 'A2', gradePoint: 9, status: 'pass', componentsJson: null, passMarks: 8, highestMarks: 20 },
              { subjectId: 's2', subjectName: 'HINDI', totalMarks: 25, obtainedMarks: 20, percentage: 80, grade: 'A2', gradePoint: 9, status: 'pass', componentsJson: null, passMarks: 8, highestMarks: 20 },
              { subjectId: 's3', subjectName: 'MATHEMATICS', totalMarks: 25, obtainedMarks: 15, percentage: 60, grade: 'B2', gradePoint: 7, status: 'pass', componentsJson: null, passMarks: 8, highestMarks: 18 },
              { subjectId: 's4', subjectName: 'SCIENCE', totalMarks: 25, obtainedMarks: 18, percentage: 72, grade: 'B1', gradePoint: 8, status: 'pass', componentsJson: null, passMarks: 8, highestMarks: 21 },
              { subjectId: 's5', subjectName: 'SOCIAL SCIENCE', totalMarks: 25, obtainedMarks: 16, percentage: 64, grade: 'B2', gradePoint: 7, status: 'pass', componentsJson: null, passMarks: 8, highestMarks: 19 },
              { subjectId: 's6', subjectName: 'COMPUTER', totalMarks: 25, obtainedMarks: 19, percentage: 76, grade: 'B1', gradePoint: 8, status: 'pass', componentsJson: null, passMarks: 8, highestMarks: 22 },
            ],
          },
          {
            examId: 'ut-2',
            examName: 'Unit Test 2',
            examGroupName: 'Term 1',
            paradigmName: 'CBSE Term Pattern 2025-26',
            academicYear: '2025-2026',
            totalMarks: 125,
            obtainedMarks: 110,
            percentage: 88.0,
            grade: 'A2',
            gradePoint: 9,
            rankInClass: 3,
            rankInSection: 1,
            status: 'pass',
            failedSubjects: null,
            publishedAt: new Date(),
            subjectSummaries: [
              { subjectId: 's1', subjectName: 'ENGLISH', totalMarks: 25, obtainedMarks: 21, percentage: 84, grade: 'A2', gradePoint: 9, status: 'pass', componentsJson: null, passMarks: 8, highestMarks: 22 },
              { subjectId: 's2', subjectName: 'HINDI', totalMarks: 25, obtainedMarks: 22, percentage: 88, grade: 'A2', gradePoint: 9, status: 'pass', componentsJson: null, passMarks: 8, highestMarks: 23 },
              { subjectId: 's3', subjectName: 'MATHEMATICS', totalMarks: 25, obtainedMarks: 14, percentage: 56, grade: 'C1', gradePoint: 6, status: 'pass', componentsJson: null, passMarks: 8, highestMarks: 19 },
              { subjectId: 's4', subjectName: 'SCIENCE', totalMarks: 25, obtainedMarks: 19, percentage: 76, grade: 'B1', gradePoint: 8, status: 'pass', componentsJson: null, passMarks: 8, highestMarks: 20 },
              { subjectId: 's5', subjectName: 'SOCIAL SCIENCE', totalMarks: 25, obtainedMarks: 17, percentage: 68, grade: 'B2', gradePoint: 7, status: 'pass', componentsJson: null, passMarks: 8, highestMarks: 20 },
              { subjectId: 's6', subjectName: 'COMPUTER', totalMarks: 25, obtainedMarks: 20, percentage: 80, grade: 'A2', gradePoint: 9, status: 'pass', componentsJson: null, passMarks: 8, highestMarks: 21 },
            ],
          },
          {
            examId: 'hy',
            examName: 'Half-Yearly Exam',
            examGroupName: 'Term 1',
            paradigmName: 'CBSE Term Pattern 2025-26',
            academicYear: '2025-2026',
            totalMarks: 600,
            obtainedMarks: 490,
            percentage: 81.67,
            grade: 'A2',
            gradePoint: 9,
            rankInClass: 2,
            rankInSection: 1,
            status: 'pass',
            failedSubjects: null,
            publishedAt: new Date(),
            subjectSummaries: [
              { subjectId: 's1', subjectName: 'ENGLISH', totalMarks: 100, obtainedMarks: 82, percentage: 82, grade: 'A2', gradePoint: 9, status: 'pass', componentsJson: null, passMarks: 30, highestMarks: 88 },
              { subjectId: 's2', subjectName: 'HINDI', totalMarks: 100, obtainedMarks: 85, percentage: 85, grade: 'A2', gradePoint: 9, status: 'pass', componentsJson: null, passMarks: 30, highestMarks: 91 },
              { subjectId: 's3', subjectName: 'MATHEMATICS', totalMarks: 100, obtainedMarks: 76, percentage: 76, grade: 'B1', gradePoint: 8, status: 'pass', componentsJson: null, passMarks: 30, highestMarks: 84 },
              { subjectId: 's4', subjectName: 'SCIENCE', totalMarks: 100, obtainedMarks: 84, percentage: 84, grade: 'A2', gradePoint: 9, status: 'pass', componentsJson: null, passMarks: 30, highestMarks: 90 },
              { subjectId: 's5', subjectName: 'SOCIAL SCIENCE', totalMarks: 100, obtainedMarks: 78, percentage: 78, grade: 'B1', gradePoint: 8, status: 'pass', componentsJson: null, passMarks: 30, highestMarks: 86 },
              { subjectId: 's6', subjectName: 'COMPUTER', totalMarks: 100, obtainedMarks: 85, percentage: 85, grade: 'A2', gradePoint: 9, status: 'pass', componentsJson: null, passMarks: 30, highestMarks: 92 },
            ],
          },
        ],
        attendance: { totalDays: 230, presentDays: 210, percentage: 91.3 },
        gradeScaleBands: DEFAULT_PREVIEW_BANDS,
      })
    }

    return buildExamReportCard({
      template: tpl,
      school: schoolInfo,
      student: {
        id: 'preview-student',
        firstName: 'Md',
        lastName: 'Adil',
        admissionNumber: 'ADM-2025-001',
        rollNumber: '1',
        dateOfBirth: new Date('2010-04-15'),
        gender: 'Male',
        className: '10',
        sectionName: 'A',
        fatherName: 'Md Shabbir Ahmad',
        motherName: 'Rehana Praveen',
        parentPhone: '+91 98765 43210',
        admissionDate: new Date('2018-04-01'),
      },
      result: {
        examId: 'preview-exam',
        examName: 'Annual Progress Examination',
        examGroupName: 'Session 2025-2026',
        paradigmName: 'CBSE Pattern 2025-26',
        academicYear: '2025-2026',
        totalMarks: 600,
        obtainedMarks: 490,
        percentage: 81.67,
        grade: 'A2',
        gradePoint: 9,
        rankInClass: 2,
        rankInSection: 1,
        status: 'pass',
        failedSubjects: null,
        publishedAt: new Date(),
        subjectSummaries: [
          {
            subjectId: 's1',
            subjectName: 'ENGLISH',
            totalMarks: 100,
            obtainedMarks: 82,
            percentage: 82,
            grade: 'A2',
            gradePoint: 9,
            status: 'pass',
            componentsJson: JSON.stringify({ THEORY: { obtained: 62, max: 80 }, PRACTICAL: { obtained: 20, max: 20 } }),
            passMarks: 30,
            highestMarks: 88,
          },
          {
            subjectId: 's2',
            subjectName: 'HINDI',
            totalMarks: 100,
            obtainedMarks: 85,
            percentage: 85,
            grade: 'A2',
            gradePoint: 9,
            status: 'pass',
            componentsJson: JSON.stringify({ THEORY: { obtained: 65, max: 80 }, PRACTICAL: { obtained: 20, max: 20 } }),
            passMarks: 30,
            highestMarks: 91,
          },
          {
            subjectId: 's3',
            subjectName: 'MATHEMATICS',
            totalMarks: 100,
            obtainedMarks: 76,
            percentage: 76,
            grade: 'B1',
            gradePoint: 8,
            status: 'pass',
            componentsJson: JSON.stringify({ THEORY: { obtained: 56, max: 80 }, PRACTICAL: { obtained: 20, max: 20 } }),
            passMarks: 30,
            highestMarks: 84,
          },
          {
            subjectId: 's4',
            subjectName: 'SCIENCE',
            totalMarks: 100,
            obtainedMarks: 84,
            percentage: 84,
            grade: 'A2',
            gradePoint: 9,
            status: 'pass',
            componentsJson: JSON.stringify({ THEORY: { obtained: 64, max: 80 }, PRACTICAL: { obtained: 20, max: 20 } }),
            passMarks: 30,
            highestMarks: 90,
          },
          {
            subjectId: 's5',
            subjectName: 'SOCIAL SCIENCE',
            totalMarks: 100,
            obtainedMarks: 78,
            percentage: 78,
            grade: 'B1',
            gradePoint: 8,
            status: 'pass',
            componentsJson: JSON.stringify({ THEORY: { obtained: 58, max: 80 }, PRACTICAL: { obtained: 20, max: 20 } }),
            passMarks: 30,
            highestMarks: 86,
          },
          {
            subjectId: 's6',
            subjectName: 'COMPUTER',
            totalMarks: 100,
            obtainedMarks: 85,
            percentage: 85,
            grade: 'A2',
            gradePoint: 9,
            status: 'pass',
            componentsJson: JSON.stringify({ THEORY: { obtained: 45, max: 50 }, PRACTICAL: { obtained: 40, max: 50 } }),
            passMarks: 30,
            highestMarks: 92,
          },
        ],
      },
      attendance: { totalDays: 230, presentDays: 210, percentage: 91.3 },
      gradeScaleBands: DEFAULT_PREVIEW_BANDS,
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
    previewMode,
    currentSchool,
  ])

  if (loading) return <LoadingState />
  if (!template) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="size-8 text-destructive" />
        <h3 className="text-base font-semibold">Template Not Found</h3>
        <p className="text-xs text-muted-foreground">The requested template could not be located or has been deleted.</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/exams/report-card-templates')}>
          Back to Templates
        </Button>
      </div>
    )
  }

  const selectedCount = layout.studentBlock.length

  return (
    <div className="space-y-5 pb-12">
      {/* ============================================================== */}
      {/* 1. PROFESSIONAL COMMAND HEADER BAR                             */}
      {/* ============================================================== */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-200/70 bg-gradient-to-r from-sky-500/[0.07] via-background to-violet-500/[0.07] p-4 shadow-sm backdrop-blur-xs sm:p-5 dark:border-sky-500/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 -ml-2 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                asChild
              >
                <Link href="/exams/report-card-templates">
                  <ArrowLeft className="size-3.5" /> Templates
                </Link>
              </Button>
              <span className="text-muted-foreground/60">/</span>
              <span className="text-xs font-semibold text-foreground">
                {name || (isNew ? 'New Template' : 'Untitled Template')}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-[#0a4d8c] text-white shadow-sm">
                <FileText className="size-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  {isNew
                    ? (cloneFromId ? `Clone: ${name}` : 'New Report Card Template')
                    : (name || 'Edit Report Card Template')}
                </h1>
                <p className="text-xs text-muted-foreground">
                  Customize layout sections, marks display, branding headers, and print styling with instant live preview.
                </p>
              </div>
            </div>
          </div>

          {/* Action Hub */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={isActive ? 'default' : 'secondary'}
              className={cn(
                'px-2.5 py-0.5 text-xs font-medium',
                isActive
                  ? 'bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 border-emerald-500/30 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {isActive ? '● Active Template' : 'Inactive'}
            </Badge>

            <Badge variant="outline" className="border-sky-300/80 bg-sky-50/50 text-xs font-medium text-sky-800 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-300">
              {FORMATS.find((f) => f.value === format)?.label || format.toUpperCase()}
            </Badge>

            {hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) && (
              <Button
                onClick={() => void handleSave()}
                disabled={saving}
                size="sm"
                className="h-9 gap-1.5 bg-gradient-to-r from-sky-600 to-[#0a4d8c] px-4 font-semibold text-white shadow-sm hover:from-sky-700 hover:to-[#083e70]"
              >
                <Save className="size-4" />
                {saving ? (isNew ? 'Creating...' : 'Saving...') : (isNew ? 'Create Template' : 'Save Changes')}
                <span className="hidden opacity-75 sm:inline text-[10px] ml-1 font-mono">(Ctrl+S)</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. DUAL-PANE WORKSPACE: LEFT SETTINGS | RIGHT LIVE CANVAS     */}
      {/* ============================================================== */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* LEFT COLUMN: INSPECTOR CONTROLS (5 COLS) */}
        <div className="space-y-4 lg:col-span-5">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-3">
            <TabsList className="grid h-auto w-full grid-cols-5 gap-1 rounded-xl border border-border/80 bg-muted/50 p-1 shadow-2xs">
              <TabsTrigger
                value="header"
                className="flex flex-col items-center gap-1 py-1.5 text-[11px] font-medium data-[state=active]:bg-card data-[state=active]:shadow-xs"
              >
                <Heading className="size-4" />
                <span className="truncate">Header</span>
              </TabsTrigger>
              <TabsTrigger
                value="subjects"
                className="flex flex-col items-center gap-1 py-1.5 text-[11px] font-medium data-[state=active]:bg-card data-[state=active]:shadow-xs"
              >
                <Table2 className="size-4" />
                <span className="truncate">Marks</span>
              </TabsTrigger>
              <TabsTrigger
                value="student"
                className="flex flex-col items-center gap-1 py-1.5 text-[11px] font-medium data-[state=active]:bg-card data-[state=active]:shadow-xs"
              >
                <UserRound className="size-4" />
                <span className="truncate">Student</span>
              </TabsTrigger>
              <TabsTrigger
                value="footer"
                className="flex flex-col items-center gap-1 py-1.5 text-[11px] font-medium data-[state=active]:bg-card data-[state=active]:shadow-xs"
              >
                <FileSignature className="size-4" />
                <span className="truncate">Footer</span>
              </TabsTrigger>
              <TabsTrigger
                value="general"
                className="flex flex-col items-center gap-1 py-1.5 text-[11px] font-medium data-[state=active]:bg-card data-[state=active]:shadow-xs"
              >
                <SlidersHorizontal className="size-4" />
                <span className="truncate">General</span>
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: HEADER & BRANDING */}
            <TabsContent value="header" className="space-y-3 m-0">
              <Card className="rounded-xl border border-sky-200/80 bg-card shadow-xs dark:border-sky-500/20">
                <CardHeader className="pb-3 pt-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500 text-white shadow-2xs">
                      <Sparkles className="size-3.5" />
                    </span>
                    <div>
                      <CardTitle className="text-sm font-bold">School Branding & Header</CardTitle>
                      <CardDescription className="text-xs">
                        Configure the school banner image and fallback header styling.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Print Banner Feature Highlight */}
                  <EnhancedSwitchCard
                    icon={Building}
                    title="School Banner Header"
                    description="Render the full-width print banner uploaded in School Settings (same banner used on Fee Receipts)."
                    checked={layout.header.showPrintHeader ?? true}
                    onChange={(v) =>
                      setLayout((p) => ({ ...p, header: { ...p.header, showPrintHeader: v } }))
                    }
                    badge={
                      (currentSchool?.printHeader || previewData?.school.printHeader) ? (
                        <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300">
                          Banner Active
                        </Badge>
                      ) : null
                    }
                  />

                  {/* Fallback items when banner is not available or toggled off */}
                  <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Text Header / Fallback Details
                    </p>
                    <EnhancedSwitchCard
                      icon={School}
                      title="Show School Logo"
                      description="Include school emblem on the left side of text header."
                      checked={layout.header.showLogo}
                      onChange={(v) => setLayout((p) => ({ ...p, header: { ...p.header, showLogo: v } }))}
                    />
                    <EnhancedSwitchCard
                      icon={Building}
                      title="Show Address & Contact"
                      description="Display school campus address, city, and state."
                      checked={layout.header.showAddress}
                      onChange={(v) => setLayout((p) => ({ ...p, header: { ...p.header, showAddress: v } }))}
                    />
                    <EnhancedSwitchCard
                      icon={Award}
                      title="Show Affiliation & UDISE"
                      description="Display CBSE/ICSE/State affiliation code and UDISE number."
                      checked={layout.header.showAffiliation}
                      onChange={(v) => setLayout((p) => ({ ...p, header: { ...p.header, showAffiliation: v } }))}
                    />
                  </div>

                  {/* Custom Title Override */}
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs font-semibold text-foreground">
                      Report Card Title Override
                    </Label>
                    <Input
                      className="h-9 bg-background text-xs"
                      placeholder="e.g. ACADEMIC PROGRESS REPORT, ANNUAL REPORT CARD"
                      value={layout.header.title}
                      onChange={(e) =>
                        setLayout((p) => ({ ...p, header: { ...p.header, title: e.target.value } }))
                      }
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Leave empty to use the default title: &ldquo;ACADEMIC PROGRESS REPORT&rdquo;.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 2: MARKS & SUBJECT TABLE */}
            <TabsContent value="subjects" className="space-y-3 m-0">
              <Card className="rounded-xl border border-sky-200/80 bg-card shadow-xs dark:border-sky-500/20">
                <CardHeader className="pb-3 pt-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500 text-white shadow-2xs">
                      <Table2 className="size-3.5" />
                    </span>
                    <div>
                      <CardTitle className="text-sm font-bold">Marks & Table Columns</CardTitle>
                      <CardDescription className="text-xs">
                        Select which mark columns, grade breakdowns, and ranks appear in the report table.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  <EnhancedSwitchCard
                    icon={Layers}
                    title="Component Breakdown"
                    description="Display sub-scores like Theory, Practical, and Viva columns for single exams."
                    checked={layout.subjectTable.showComponents}
                    onChange={(v) =>
                      setLayout((p) => ({ ...p, subjectTable: { ...p.subjectTable, showComponents: v } }))
                    }
                  />

                  <EnhancedSwitchCard
                    icon={BookOpen}
                    title="Max / Total Marks Column"
                    description="Show maximum marks possible for each subject (e.g., /100)."
                    checked={layout.subjectTable.showMaxMarks}
                    onChange={(v) =>
                      setLayout((p) => ({ ...p, subjectTable: { ...p.subjectTable, showMaxMarks: v } }))
                    }
                  />

                  <EnhancedSwitchCard
                    icon={Award}
                    title="Percentage Column"
                    description="Show calculated percentage per subject row."
                    checked={layout.subjectTable.showPercentage}
                    onChange={(v) =>
                      setLayout((p) => ({ ...p, subjectTable: { ...p.subjectTable, showPercentage: v } }))
                    }
                  />

                  <EnhancedSwitchCard
                    icon={Award}
                    title="Subject Grade Column"
                    description="Show grade (A1, A2, B1...) assigned based on paradigm grading scale."
                    checked={layout.subjectTable.showGrade}
                    onChange={(v) =>
                      setLayout((p) => ({ ...p, subjectTable: { ...p.subjectTable, showGrade: v } }))
                    }
                  />

                  <EnhancedSwitchCard
                    icon={Award}
                    title="Show Class / Section Rank"
                    description="Display student rank standing in class and section."
                    checked={layout.subjectTable.showRank}
                    onChange={(v) =>
                      setLayout((p) => ({ ...p, subjectTable: { ...p.subjectTable, showRank: v } }))
                    }
                  />

                  <EnhancedSwitchCard
                    icon={BookOpen}
                    title="Include Co-Scholastic Subjects"
                    description="Include graded non-scholastic disciplines (Art, Physical Ed., Discipline)."
                    checked={includeCoScholastic}
                    onChange={setIncludeCoScholastic}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 3: STUDENT INFORMATION */}
            <TabsContent value="student" className="space-y-3 m-0">
              <Card className="rounded-xl border border-sky-200/80 bg-card shadow-xs dark:border-sky-500/20">
                <CardHeader className="pb-3 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500 text-white shadow-2xs">
                        <UserRound className="size-3.5" />
                      </span>
                      <div>
                        <CardTitle className="text-sm font-bold">Student Detail Fields</CardTitle>
                        <CardDescription className="text-xs">
                          {selectedCount} field{selectedCount === 1 ? '' : 's'} displayed in student card.
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={selectStandardFields}
                        className="h-7 px-2 text-[11px]"
                      >
                        Standard
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={selectAllFields}
                        className="h-7 px-2 text-[11px]"
                      >
                        All
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearAllFields}
                        className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {STUDENT_FIELD_CATEGORIES.map((cat) => (
                    <div key={cat.category} className="space-y-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {cat.category}
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {cat.fields.map((f) => {
                          const isSelected = layout.studentBlock.includes(f.key)
                          return (
                            <button
                              key={f.key}
                              type="button"
                              onClick={() => toggleField(f.key)}
                              className={cn(
                                'flex items-center justify-between rounded-xl border p-2.5 text-left transition-all',
                                isSelected
                                  ? 'border-sky-300/90 bg-sky-50/50 shadow-2xs dark:border-sky-500/30 dark:bg-sky-950/20'
                                  : 'border-border/60 bg-muted/10 hover:border-border hover:bg-muted/30',
                              )}
                            >
                              <div className="space-y-0.5">
                                <span className={cn('text-xs font-semibold', isSelected ? 'text-sky-950 dark:text-sky-200' : 'text-foreground')}>
                                  {f.label}
                                </span>
                                {f.desc && (
                                  <p className="text-[10px] text-muted-foreground">{f.desc}</p>
                                )}
                              </div>
                              <span
                                className={cn(
                                  'flex size-5 shrink-0 items-center justify-center rounded-md border text-xs transition-colors',
                                  isSelected
                                    ? 'border-sky-500 bg-sky-500 text-white'
                                    : 'border-border bg-background text-transparent',
                                )}
                              >
                                <Check className="size-3 stroke-[3]" />
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 4: FOOTER, REMARKS & SIGNATURES */}
            <TabsContent value="footer" className="space-y-3 m-0">
              <Card className="rounded-xl border border-sky-200/80 bg-card shadow-xs dark:border-sky-500/20">
                <CardHeader className="pb-3 pt-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500 text-white shadow-2xs">
                      <FileSignature className="size-3.5" />
                    </span>
                    <div>
                      <CardTitle className="text-sm font-bold">Footer & Signatures</CardTitle>
                      <CardDescription className="text-xs">
                        Configure attendance metric, remarks boxes, and formal signatory titles.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <EnhancedSwitchCard
                    icon={Calendar}
                    title="Attendance Summary Card"
                    description="Show total working days, present days, percentage, and attendance badge."
                    checked={layout.footer.showAttendance && includeAttendance}
                    onChange={(v) => {
                      setIncludeAttendance(v)
                      setLayout((p) => ({ ...p, footer: { ...p.footer, showAttendance: v } }))
                    }}
                  />

                  <EnhancedSwitchCard
                    icon={Sparkles}
                    title="Teacher Remarks Block"
                    description="Include class teacher evaluation notes & conduct comments."
                    checked={showTeacherRemarks}
                    onChange={setShowTeacherRemarks}
                  />

                  <EnhancedSwitchCard
                    icon={Award}
                    title="Principal Remarks Block"
                    description="Include official principal message or promotion remarks."
                    checked={showPrincipalRemarks}
                    onChange={setShowPrincipalRemarks}
                  />

                  {/* Signatures List Builder */}
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground">
                        Signatures on Report Card ({layout.footer.signatures.length})
                      </Label>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addSignature('Parent/Guardian')}
                          className="h-6 px-1.5 text-[10px]"
                        >
                          + Parent
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addSignature('Class Teacher')}
                          className="h-6 px-1.5 text-[10px]"
                        >
                          + Teacher
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addSignature('Principal')}
                          className="h-6 px-1.5 text-[10px]"
                        >
                          + Principal
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {layout.footer.signatures.map((sig, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">
                            {idx + 1}
                          </span>
                          <Input
                            className="h-8 bg-background text-xs"
                            value={sig}
                            placeholder="e.g. Class Teacher, Principal, Examination Incharge"
                            onChange={(e) => updateSignature(idx, e.target.value)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeSignature(idx)}
                            className="size-8 p-0 text-muted-foreground hover:text-destructive"
                            title="Remove signature"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addSignature('')}
                        className="mt-1 w-full gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="size-3.5" /> Add Custom Signature
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 5: GENERAL SETTINGS */}
            <TabsContent value="general" className="space-y-3 m-0">
              <Card className="rounded-xl border border-sky-200/80 bg-card shadow-xs dark:border-sky-500/20">
                <CardHeader className="pb-3 pt-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500 text-white shadow-2xs">
                      <SlidersHorizontal className="size-3.5" />
                    </span>
                    <div>
                      <CardTitle className="text-sm font-bold">Template Configuration</CardTitle>
                      <CardDescription className="text-xs">
                        Define template naming, target paradigm, and active status.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Template Name</Label>
                    <Input
                      className="h-9 bg-background text-xs"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. CBSE Primary Report Card 2025"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Description</Label>
                    <Textarea
                      rows={2}
                      className="resize-none bg-background text-xs"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief note about this template's intended classes or standards..."
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="min-w-0 space-y-1.5">
                      <Label className="text-xs font-semibold">Report Format</Label>
                      <Select value={format} onValueChange={setFormat}>
                        <SelectTrigger className="h-9 w-full min-w-0 bg-background text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FORMATS.map((f) => (
                            <SelectItem key={f.value} value={f.value} className="text-xs">
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="min-w-0 space-y-1.5">
                      <Label className="text-xs font-semibold">Applies To Exam Pattern</Label>
                      <Select
                        value={paradigmId || '__any'}
                        onValueChange={(v) => setParadigmId(v === '__any' ? '' : v)}
                      >
                        <SelectTrigger className="h-9 w-full min-w-0 bg-background text-xs">
                          <SelectValue placeholder="Any pattern" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__any" className="text-xs">Any pattern</SelectItem>
                          {paradigms.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <EnhancedSwitchCard
                    icon={CheckCircle2}
                    title="Active Template"
                    description="Enable this template for selection when teachers generate and print student report cards."
                    checked={isActive}
                    onChange={setIsActive}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* RIGHT COLUMN: STICKY LIVE CANVAS (7 COLS) */}
        <div className="lg:sticky lg:top-4 lg:col-span-7">
          <Card className="overflow-hidden rounded-2xl border border-sky-300/80 bg-card shadow-md dark:border-sky-500/25">
            {/* Live Canvas Toolbar */}
            <CardHeader className="border-b border-border/80 bg-muted/40 px-4 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500 text-white shadow-xs">
                    <Eye className="size-3.5" />
                  </span>
                  <div>
                    <h3 className="text-xs font-bold leading-tight text-foreground flex items-center gap-1.5">
                      Live Document Canvas
                      <span className="text-[10px] font-normal text-muted-foreground">· A4 Portrait</span>
                    </h3>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Single vs Term Mode Toggle */}
                  <div className="inline-flex rounded-lg border border-border/80 bg-background/80 p-0.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('single')}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all',
                        previewMode === 'single'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      Single Exam
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('multi')}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all',
                        previewMode === 'multi'
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      Term (3 Exams)
                    </button>
                  </div>

                  {/* Canvas Zoom Controls */}
                  <div className="flex items-center gap-1 rounded-lg border border-border/80 bg-background/80 p-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-6 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                      title="Zoom out"
                    >
                      <ZoomOut className="size-3" />
                    </Button>
                    <span className="w-8 text-center text-[10px] font-mono font-semibold text-muted-foreground">
                      {zoomLevel}%
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-6 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setZoomLevel((z) => Math.min(120, z + 10))}
                      title="Zoom in"
                    >
                      <ZoomIn className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-6 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setZoomLevel(95)}
                      title="Reset zoom"
                    >
                      <RotateCcw className="size-2.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>

            {/* Document Canvas Backdrop */}
            <CardContent className="max-h-[calc(100vh-140px)] overflow-y-auto overflow-x-hidden bg-slate-100/90 p-4 dark:bg-slate-950/60 themed-scrollbar">
              {previewData ? (
                <div
                  style={{
                    transform: `scale(${zoomLevel / 100})`,
                    transformOrigin: 'top center',
                    transition: 'transform 0.15s ease-out',
                  }}
                  className="mx-auto rounded-xl shadow-xl ring-1 ring-black/5"
                >
                  <ReportCardRenderer data={previewData} />
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center text-xs italic text-muted-foreground">
                  Preview unavailable.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function EnhancedSwitchCard({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
  disabled,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  badge?: React.ReactNode
}) {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'group flex cursor-pointer items-start justify-between gap-3 rounded-xl border p-3 transition-all',
        checked
          ? 'border-sky-300/80 bg-sky-50/30 shadow-2xs dark:border-sky-500/25 dark:bg-sky-950/20'
          : 'border-border/70 bg-card hover:border-border hover:bg-muted/20',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors mt-0.5',
            checked
              ? 'bg-sky-500 text-white shadow-2xs'
              : 'bg-muted text-muted-foreground group-hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />
        </div>
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground">{title}</span>
            {badge}
          </div>
          {description && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 mt-0.5"
      />
    </div>
  )
}

export function ReportCardTemplateEditPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ReportCardTemplateEditPageInner />
    </Suspense>
  )
}
