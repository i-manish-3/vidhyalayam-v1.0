'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PageHeader, LoadingState, EmptyState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Users, Search, Printer, Download, IdCard, Eye } from 'lucide-react'
import type { CardElement } from '@/lib/id-card-types'
import {
  IdCardRenderer,
  type CardRenderData,
  type RenderTemplate,
} from '../components/id-card-renderer'
import {
  IdCardHtmlRenderer,
  type HtmlRenderData,
  type HtmlRenderTemplate,
} from '../components/id-card-html-renderer'

interface TemplateSummary {
  id: string
  name: string
  orientation: 'portrait' | 'landscape'
  widthMm: number
  heightMm: number
  hasBackSide: boolean
  isDefault: boolean
  isActive: boolean
}

interface ClassOption { id: string; name: string }
interface SectionOption { id: string; name: string; classId: string }
interface AcademicYearOption { name: string; isCurrent: boolean; isActive: boolean }

interface IdCardGenerateListState {
  academicYear: string
  classId: string
  sectionId: string
  status: string
  search: string
}

const ID_CARD_GENERATE_LIST_STATE_KEY = 'id-cards:generate:list'

interface StudentRow {
  id: string
  firstName: string
  lastName: string
  admissionNumber: string | null
  rollNumber: string | null
  profileImage: string | null
  admissionStatus: string
  class: { id: string; name: string } | null
  section: { id: string; name: string } | null
  academicEnrollments: Array<{
    academicYear: string
    rollNumber: string | null
    class: { id: string; name: string } | null
    section: { id: string; name: string } | null
  }>
}

interface GenerateResponse {
  template: RenderTemplate & {
    id: string
    name: string
    templateMode: 'html' | 'element'
    orientation: 'portrait' | 'landscape'
    frontHtml?: string | null
    backHtml?: string | null
    frontCss?: string | null
    backCss?: string | null
  }
  school: {
    id: string
    name: string
    logo: string | null
    address: string
    phone: string | null
    email: string | null
    website: string | null
    academicYear: string
  }
  cards: CardRenderData[]
}

const STATUS_OPTIONS = [
  { value: 'admitted', label: 'Active' },
  { value: 'promoted', label: 'Promoted' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'transferred', label: 'Transferred' },
]

export function IdCardGeneratePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const currentSchool = useAppStore((s) => s.currentSchool)
  const savedListState = useAppStore((s) => s.pageState[ID_CARD_GENERATE_LIST_STATE_KEY] as IdCardGenerateListState | undefined)
  const setPageState = useAppStore((s) => s.setPageState)

  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [templateId, setTemplateId] = useState<string>(searchParams.get('template') || '')
  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)

  const [academicYear, setAcademicYear] = useState(savedListState?.academicYear ?? '')
  const [classId, setClassId] = useState(savedListState?.classId ?? 'all')
  const [sectionId, setSectionId] = useState(savedListState?.sectionId ?? 'all')
  const [status, setStatus] = useState(savedListState?.status ?? 'admitted')
  const [search, setSearch] = useState(savedListState?.search ?? '')
  const [searchDebounced, setSearchDebounced] = useState(savedListState?.search?.trim() ?? '')

  const [students, setStudents] = useState<StudentRow[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const [preview, setPreview] = useState<GenerateResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'select' | 'preview'>('select')

  // Load templates + academic years/classes/sections in parallel.
  useEffect(() => {
    let cancelled = false
    setLoadingOptions(true)
    Promise.all([
      api.get<{ templates: TemplateSummary[] }>('/api/school/id-cards/templates'),
      api.get<{ classes: ClassOption[] }>('/api/school/classes'),
      api.get<{ sections: SectionOption[] }>('/api/school/sections'),
      api.get<{ academicYears: string[]; years?: AcademicYearOption[] }>('/api/school/academic-years'),
    ])
      .then(([tplRes, clsRes, secRes, yrRes]) => {
        if (cancelled) return
        setTemplates(tplRes.templates.filter((t) => t.isActive))
        setClasses(clsRes.classes || [])
        setSections(secRes.sections || [])
        const years = yrRes.academicYears || []
        setAcademicYears(years)
        const current = yrRes.years?.find((y) => y.isCurrent)?.name || years[0] || ''
        setAcademicYear(savedListState?.academicYear || current)
        // Default to default template if none preselected.
        if (!templateId && tplRes.templates.length > 0) {
          const def = tplRes.templates.find((t) => t.isDefault && t.isActive) || tplRes.templates.find((t) => t.isActive)
          if (def) setTemplateId(def.id)
        }
      })
      .catch((err) => {
        if (cancelled) return
        toast({
          variant: 'destructive',
          title: 'Could not load setup data',
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Debounce search.
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const rememberListState = useCallback((patch: Partial<IdCardGenerateListState>) => {
    setPageState(ID_CARD_GENERATE_LIST_STATE_KEY, {
      academicYear,
      classId,
      sectionId,
      status,
      search,
      ...patch,
    })
  }, [academicYear, classId, search, sectionId, setPageState, status])

  const handleAcademicYearChange = (value: string) => {
    setAcademicYear(value)
    rememberListState({ academicYear: value })
  }

  const handleClassChange = (value: string) => {
    setClassId(value)
    setSectionId('all')
    rememberListState({ classId: value, sectionId: 'all' })
  }

  const handleSectionChange = (value: string) => {
    setSectionId(value)
    rememberListState({ sectionId: value })
  }

  const handleStatusChange = (value: string) => {
    setStatus(value)
    rememberListState({ status: value })
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    rememberListState({ search: value })
  }

  // Fetch students whenever filters change.
  const fetchStudents = useCallback(async () => {
    if (!academicYear) return
    setLoadingStudents(true)
    try {
      const params: Record<string, string> = { academicYear, status, limit: '500' }
      if (classId !== 'all') params.classId = classId
      if (sectionId !== 'all') params.sectionId = sectionId
      if (searchDebounced) params.search = searchDebounced
      const res = await api.get<{ students: StudentRow[] }>('/api/school/id-cards/students', params)
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
  }, [academicYear, classId, sectionId, status, searchDebounced, toast])

  useEffect(() => {
    void fetchStudents()
  }, [fetchStudents])

  const sectionOptions = useMemo(
    () => (classId !== 'all' ? sections.filter((s) => s.classId === classId) : []),
    [classId, sections],
  )

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
    if (!templateId) {
      toast({ variant: 'destructive', title: 'Please choose a template.' })
      return
    }
    if (selectedIds.length === 0) {
      toast({ variant: 'destructive', title: 'Please select at least one student.' })
      return
    }
    setPreviewLoading(true)
    try {
      const res = await api.post<GenerateResponse>('/api/school/id-cards/generate', {
        templateId,
        studentIds: selectedIds,
        academicYear: academicYear || undefined,
        action: 'preview',
      })
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

  const openPrintSheet = (action: 'print' | 'download') => {
    if (!preview) return
    const params = new URLSearchParams({
      template: preview.template.id,
      students: selectedIds.join(','),
      academicYear: academicYear || '',
      action,
    })
    const url = `/print/id-cards?${params.toString()}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (loadingOptions) return <LoadingState />

  if (templates.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Generate ID Cards" backAction={{ onClick: () => router.push('/id-cards') }} />
        <EmptyState
          icon={IdCard}
          title="No templates yet"
          description="Create at least one template before generating ID cards."
          action={{ label: 'Create Template', onClick: () => router.push('/id-cards/templates/new') }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Generate ID Cards"
        description="Pick students, preview, then print or download."
        backAction={{ onClick: () => router.push('/id-cards') }}
      />

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
          {/* Filters */}
          <Card>
            <CardContent className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-6">
              <FilterField label="Template">
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Choose template" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}{t.isDefault ? ' (Default)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Academic Year">
                <Select value={academicYear} onValueChange={handleAcademicYearChange}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {academicYears.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Class">
                <Select value={classId} onValueChange={handleClassChange}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Section">
                <Select value={sectionId} onValueChange={handleSectionChange} disabled={classId === 'all'}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All sections" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {sectionOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Status">
                <Select value={status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Search">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Name, admission no, roll no"
                    className="h-9 pl-8 text-sm"
                  />
                </div>
              </FilterField>
            </CardContent>
          </Card>

          {/* Selection bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2.5">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
                onCheckedChange={toggleAllFiltered}
                disabled={students.length === 0}
              />
              <span className="text-sm font-medium">
                {selectedIds.length > 0
                  ? `${selectedIds.length} selected`
                  : 'Select students'}
              </span>
              <span className="text-xs text-muted-foreground">
                ({students.length} shown)
              </span>
            </div>
            <div className="flex gap-2">
              {selectedIds.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSelection}>Clear</Button>
              )}
              <Button
                size="sm"
                onClick={buildPreview}
                disabled={selectedIds.length === 0 || !templateId || previewLoading}
              >
                <Eye className="mr-1.5 size-4" />
                {previewLoading ? 'Building…' : `Preview ${selectedIds.length || ''}`.trim()}
              </Button>
            </div>
          </div>

          {/* Student list */}
          {loadingStudents ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Loading students…</CardContent></Card>
          ) : students.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No matching students"
              description="Adjust the filters to find students for the selected academic year."
            />
          ) : (
            <Card>
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
                            <span className="font-medium uppercase">{(s.firstName?.[0] || '?')}</span>
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
          {preview && <PreviewSection preview={preview} schoolLogo={currentSchool?.logo} onPrint={openPrintSheet} />}
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface PreviewSectionProps {
  preview: GenerateResponse
  schoolLogo: string | null | undefined
  onPrint: (action: 'print' | 'download') => void
}

function PreviewSection({ preview, schoolLogo, onPrint }: PreviewSectionProps) {
  const [side, setSide] = useState<'front' | 'back'>('front')
  const isHtmlMode = preview.template.templateMode === 'html' && !!preview.template.frontHtml

  const elementTpl: RenderTemplate = {
    widthMm: preview.template.widthMm,
    heightMm: preview.template.heightMm,
    backgroundColor: preview.template.backgroundColor,
    frontBackground: preview.template.frontBackground,
    backBackground: preview.template.backBackground,
    hasBackSide: preview.template.hasBackSide,
    frontLayout: preview.template.frontLayout as CardElement[],
    backLayout: (preview.template.backLayout as CardElement[] | null) || null,
  }

  const htmlTpl: HtmlRenderTemplate = {
    widthMm: preview.template.widthMm,
    heightMm: preview.template.heightMm,
    frontHtml: preview.template.frontHtml || '',
    frontCss: preview.template.frontCss || '',
    backHtml: preview.template.backHtml || null,
    backCss: preview.template.backCss || null,
    hasBackSide: preview.template.hasBackSide,
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{preview.template.name}</Badge>
          <p className="text-sm text-muted-foreground">
            {preview.cards.length} card{preview.cards.length === 1 ? '' : 's'} · {preview.template.widthMm}×{preview.template.heightMm} mm
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {preview.template.hasBackSide && (
            <Tabs value={side} onValueChange={(v) => setSide(v as 'front' | 'back')}>
              <TabsList className="h-9">
                <TabsTrigger value="front">Front</TabsTrigger>
                <TabsTrigger value="back">Back</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <Button variant="outline" size="sm" onClick={() => onPrint('print')}>
            <Printer className="mr-1.5 size-4" /> Print
          </Button>
          <Button size="sm" onClick={() => onPrint('download')}>
            <Download className="mr-1.5 size-4" /> Download PDF
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-muted/30 p-4">
        <div className="flex flex-wrap justify-center gap-4">
          {preview.cards.map((c) =>
            isHtmlMode ? (
              <IdCardHtmlRenderer
                key={c.studentId}
                template={htmlTpl}
                card={c as HtmlRenderData}
                schoolLogo={schoolLogo || preview.school.logo || null}
                scale={1.5}
                side={side}
              />
            ) : (
              <IdCardRenderer
                key={c.studentId}
                template={elementTpl}
                card={c}
                schoolLogo={schoolLogo || preview.school.logo || undefined}
                scale={1.5}
                side={side}
              />
            ),
          )}
        </div>
      </div>
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
