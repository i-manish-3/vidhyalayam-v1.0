'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import {
  PlusCircle,
  BookMarked,
  BookOpen,
  FlaskConical,
  Globe,
  Music,
  Calculator,
  PenTool,
  Palette,
  Dumbbell,
  Languages,
  Microscope,
  MoreVertical,
  Pencil,
  Trash2,
  Search,
  X,
  Filter,
  Layers,
  Loader2,
  CheckCircle2,
  GraduationCap,
} from 'lucide-react'

const SUBJECT_TYPES = [
  { value: 'primary', label: 'Primary', badge: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300', dot: 'bg-sky-500', card: 'border-sky-200/80 from-sky-50 via-white to-cyan-50 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10', header: 'from-sky-100/80 via-white/90 to-cyan-100/70 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10', icon: 'from-sky-500 to-cyan-600' },
  { value: 'optional', label: 'Optional', badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300', dot: 'bg-amber-500', card: 'border-amber-200/80 from-amber-50 via-white to-orange-50 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10', header: 'from-amber-100/80 via-white/90 to-orange-100/70 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10', icon: 'from-amber-500 to-orange-600' },
  { value: 'extra', label: 'Extra', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300', dot: 'bg-emerald-500', card: 'border-emerald-200/80 from-emerald-50 via-white to-teal-50 dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10', header: 'from-emerald-100/80 via-white/90 to-teal-100/70 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10', icon: 'from-emerald-500 to-teal-600' },
  { value: 'special', label: 'Special', badge: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300', dot: 'bg-violet-500', card: 'border-violet-200/80 from-violet-50 via-white to-purple-50 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10', header: 'from-violet-100/80 via-white/90 to-purple-100/70 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10', icon: 'from-violet-500 to-purple-600' },
] as const

function getSubjectIcon(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('math') || lower.includes('algebra') || lower.includes('geometry')) return Calculator
  if (lower.includes('science') || lower.includes('physics') || lower.includes('chemistry') || lower.includes('biology')) return FlaskConical
  if (lower.includes('english') || lower.includes('language') || lower.includes('hindi') || lower.includes('sanskrit')) return Languages
  if (lower.includes('music') || lower.includes('sing')) return Music
  if (lower.includes('art') || lower.includes('draw') || lower.includes('paint')) return Palette
  if (lower.includes('physical') || lower.includes('sports') || lower.includes('yoga') || lower.includes('gym')) return Dumbbell
  if (lower.includes('computer') || lower.includes('it ') || lower.includes('info')) return Microscope
  if (lower.includes('social') || lower.includes('history') || lower.includes('geography') || lower.includes('civics')) return Globe
  if (lower.includes('write') || lower.includes('handwriting')) return PenTool
  return BookOpen
}

interface ClassInfo {
  id: string
  name: string | null
}

interface Subject {
  id: string
  name: string
  code: string
  sequenceNo: number | null
  type: string
  isActive: boolean
  classes?: ClassInfo[]
  [key: string]: unknown
}

interface ClassItem {
  id: string
  name: string | null
}

interface SubjectsListState {
  searchQuery: string
  selectedClassId: string
  selectedType: string
}

const SUBJECTS_LIST_STATE_KEY = 'academics:subjects:list'

export function SubjectsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMISSIONS.SUBJECT_CREATE)
  const canUpdate = hasPermission(PERMISSIONS.SUBJECT_UPDATE)
  const canDelete = hasPermission(PERMISSIONS.SUBJECT_DELETE)
  const savedListState = useAppStore((s) => s.pageState[SUBJECTS_LIST_STATE_KEY] as SubjectsListState | undefined)
  const setPageState = useAppStore((s) => s.setPageState)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filtering, setFiltering] = useState(false)
  const [searchQuery, setSearchQuery] = useState(savedListState?.searchQuery ?? '')
  const [selectedClassId, setSelectedClassId] = useState<string>(savedListState?.selectedClassId ?? 'all')
  const [selectedType, setSelectedType] = useState<string>(savedListState?.selectedType ?? 'all')
  const [deleteSubject, setDeleteSubject] = useState<Subject | null>(null)
  const [deleting, setDeleting] = useState(false)

  const rememberListState = useCallback((patch: Partial<SubjectsListState>) => {
    setPageState(SUBJECTS_LIST_STATE_KEY, {
      searchQuery,
      selectedClassId,
      selectedType,
      ...patch,
    })
  }, [searchQuery, selectedClassId, selectedType, setPageState])

  const fetchClasses = useCallback(async () => {
    try {
      const res = await api.get<{ classes: ClassItem[] }>('/api/school/classes')
      setClasses(res.classes || [])
    } catch {
      // Classes are only used for filtering, so keep the page usable if they fail.
    }
  }, [])

  const fetchData = useCallback(async (classId?: string) => {
    try {
      const url = classId && classId !== 'all'
        ? `/api/school/subjects?classId=${classId}`
        : '/api/school/subjects'
      const res = await api.get<{ subjects: Subject[] }>(url)
      setSubjects(res.subjects || [])
    } catch {
      toast({ title: 'Couldn\'t Load Subjects', description: 'We couldn\'t load the subjects. Please refresh the page.', variant: 'destructive' })
    } finally {
      setLoading(false)
      setFiltering(false)
    }
  }, [toast])

  useEffect(() => {
    fetchClasses()
    fetchData(selectedClassId)
  }, [fetchClasses, fetchData])

  const handleClassFilter = (classId: string) => {
    setSelectedClassId(classId)
    rememberListState({ selectedClassId: classId })
    setFiltering(true)
    fetchData(classId)
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    rememberListState({ searchQuery: value })
  }

  const handleTypeChange = (value: string) => {
    setSelectedType(value)
    rememberListState({ selectedType: value })
  }

  const clearSearch = () => {
    setSearchQuery('')
    rememberListState({ searchQuery: '' })
  }

  const clearFilters = () => {
    setSelectedType('all')
    setSelectedClassId('all')
    rememberListState({ selectedType: 'all', selectedClassId: 'all' })
    setFiltering(true)
    fetchData('all')
  }

  const handleEdit = (subject: Subject) => {
    router.push(`/academics/subjects/${subject.id}/edit`)
  }

  const handleDelete = async () => {
    if (!deleteSubject) return
    setDeleting(true)
    try {
      await api.delete(`/api/school/subjects/${deleteSubject.id}`)
      toast({ title: 'Subject Deleted', description: `"${deleteSubject.name}" has been removed.` })
      setDeleteSubject(null)
      fetchData(selectedClassId)
    } catch (err) {
      toast({ title: 'Couldn\'t Delete Subject', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  const filteredSubjects = useMemo(() => subjects.filter(subject => {
    if (selectedType !== 'all' && subject.type !== selectedType) return false
    if (!searchQuery.trim()) return true

    const q = searchQuery.toLowerCase()
    return subject.name.toLowerCase().includes(q) ||
      (subject.code && subject.code.toLowerCase().includes(q)) ||
      subject.type.toLowerCase().includes(q) ||
      (subject.classes && subject.classes.some(cls => (cls.name || '').toLowerCase().includes(q)))
  }), [subjects, selectedType, searchQuery])

  const stats = useMemo(() => {
    const assignedSubjects = subjects.filter(subject => (subject.classes?.length || 0) > 0).length
    const activeSubjects = subjects.filter(subject => subject.isActive).length
    const classLinks = subjects.reduce((sum, subject) => sum + (subject.classes?.length || 0), 0)
    const typeCount = selectedType === 'all'
      ? new Set(subjects.map(subject => subject.type)).size
      : subjects.filter(subject => subject.type === selectedType).length

    return { assignedSubjects, activeSubjects, classLinks, typeCount }
  }, [subjects, selectedType])

  const selectedClassName = selectedClassId !== 'all' ? classes.find(cls => cls.id === selectedClassId)?.name : null
  const selectedTypeLabel = selectedType !== 'all' ? SUBJECT_TYPES.find(type => type.value === selectedType)?.label : null
  const hasActiveFilters = selectedClassId !== 'all' || selectedType !== 'all'

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15">
        <div aria-hidden className="absolute -right-9 -top-14 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute -bottom-14 right-1/4 size-28 rounded-full bg-violet-300/10 blur-xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
              <BookMarked className="size-5 text-white" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Subject List</h1>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85">{subjects.length} subjects</span>
              </div>
              <p className="mt-0.5 text-xs text-white/80">Manage curriculum subjects, types, order, and class assignments.</p>
            </div>
          </div>
          {canCreate && (
            <Button
              variant="secondary"
              onClick={() => router.push('/academics/subjects/new')}
              className="relative gap-2 border border-white/60 shadow-md"
              style={{ backgroundColor: 'white', color: 'var(--primary)' }}
            >
              <PlusCircle className="size-4" /> Add Subject
            </Button>
          )}
        </div>
      </section>

      {(subjects.length > 0 || hasActiveFilters) && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard tone="sky" icon={BookMarked} label="Subjects" value={subjects.length} note={`${stats.activeSubjects} active`} />
            <StatCard tone="emerald" icon={Layers} label="Assigned" value={stats.assignedSubjects} note="Linked to classes" />
            <StatCard tone="violet" icon={BookOpen} label="Class Links" value={stats.classLinks} note="Total assignments" />
            <StatCard tone="amber" icon={Filter} label={selectedType === 'all' ? 'Types' : 'Filtered'} value={stats.typeCount} note={selectedTypeLabel || 'Categories'} />
          </div>

          <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
            <CardContent className="flex flex-col gap-3 p-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative w-full xl:max-w-md">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search subject, code, type, or class"
                  value={searchQuery}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  className="h-9 border-sky-200 bg-white pl-9 pr-9 shadow-sm focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-input/30"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={selectedType} onValueChange={handleTypeChange}>
                  <SelectTrigger leadingIcon={<Filter className="size-3.5 text-white" />} leadingIconClassName="from-violet-500 to-purple-600" className="h-9 w-full border-violet-200 bg-white dark:border-violet-500/25 dark:bg-input/30 sm:w-[160px]">
                    <SelectValue placeholder="Subject type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {SUBJECT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <span className="flex items-center gap-2">
                          <span className={`size-2 rounded-full ${type.dot}`} />
                          {type.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedClassId} onValueChange={handleClassFilter}>
                  <SelectTrigger leadingIcon={<GraduationCap className="size-3.5 text-white" />} leadingIconClassName="from-sky-500 to-cyan-600" className="h-9 w-full border-sky-200 bg-white dark:border-sky-500/25 dark:bg-input/30 sm:w-[200px]">
                    <SelectValue placeholder="Filter by class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name || 'Unnamed'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Badge className="h-9 w-fit rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {filtering && <Loader2 className="mr-1.5 size-3 animate-spin" />}
                  {filteredSubjects.length} showing
                </Badge>

                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-9"
                    onClick={clearFilters}
                    aria-label="Clear filters"
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <div className={`transition-opacity duration-200 ${filtering ? 'opacity-55' : 'opacity-100'}`}>
        {subjects.length === 0 && !hasActiveFilters ? (
          <EmptySearch
            icon={BookMarked}
            title="No Subjects Yet"
            description="Add subjects to set up your school's curriculum."
            actionLabel={canCreate ? 'Add Subject' : undefined}
            onAction={() => router.push('/academics/subjects/new')}
          />
        ) : subjects.length === 0 && hasActiveFilters ? (
          <EmptySearch
            icon={BookMarked}
            title="No subjects found"
            description={`No subjects found${selectedClassName ? ` for ${selectedClassName}` : ''}${selectedTypeLabel ? ` of type ${selectedTypeLabel}` : ''}.`}
            actionLabel="Clear filters"
            onAction={clearFilters}
          />
        ) : filteredSubjects.length === 0 ? (
          <EmptySearch
            icon={Search}
            title="No subjects found"
            description={`No subject matches "${searchQuery}".`}
            actionLabel="Clear search"
            onAction={clearSearch}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredSubjects.map((subject) => {
            const typeConfig = SUBJECT_TYPES.find(type => type.value === subject.type) || SUBJECT_TYPES[0]
            const IconComponent = getSubjectIcon(subject.name)
            const classCount = subject.classes?.length || 0

            return (
              <Card key={subject.id} className={`group gap-0 overflow-hidden border bg-gradient-to-br py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${typeConfig.card}`}>
                <CardContent className="p-0">
                  <div className={`flex items-start gap-3 border-b border-current/10 bg-gradient-to-r p-3.5 ${typeConfig.header}`}>
                    <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${typeConfig.icon}`}>
                      <IconComponent className="size-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <h3 className="mr-1 truncate text-base font-semibold leading-tight" title={subject.name}>
                          {subject.name}
                        </h3>
                        <Badge variant="outline" className={`h-5 shrink-0 rounded-md px-1.5 text-[11px] ${typeConfig.badge}`}>
                          {typeConfig.label}
                        </Badge>
                        <Badge variant="outline" className={cn('h-5 shrink-0 rounded-md px-1.5 text-[11px]', subject.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-500/25 dark:bg-slate-500/10 dark:text-slate-300')}>
                          {subject.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {subject.code || 'No code'} / {classCount} class{classCount !== 1 ? 'es' : ''} assigned
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        {canUpdate && (
                          <DropdownMenuItem onClick={() => handleEdit(subject)}>
                            <Pencil className="mr-2 size-3.5" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteSubject(subject)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 size-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="grid grid-cols-3 border-b border-current/10 bg-white/55 text-center dark:bg-card/40">
                    <Metric label="Classes" value={classCount} />
                    <Metric label="Sequence" value={subject.sequenceNo ?? 0} />
                    <Metric label="Status" value={subject.isActive ? 1 : 0} display={subject.isActive ? 'Active' : 'Inactive'} />
                  </div>

                  <div className="space-y-2 p-3.5">
                    <SectionTitle icon={Layers} label="Assigned Classes" />
                    {classCount > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {subject.classes!.slice(0, 8).map(cls => (
                          <Badge key={cls.id} variant="outline" className="h-6 rounded-md border-primary/15 bg-white/75 px-2 text-xs shadow-sm dark:bg-card/60">
                            {cls.name || 'Unnamed'}
                          </Badge>
                        ))}
                        {classCount > 8 && (
                          <Badge variant="outline" className="h-6 rounded-md px-2 text-xs">
                            +{classCount - 8} more
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-amber-300/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">No classes assigned.</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-current/10 bg-white/60 px-3.5 py-2.5 dark:bg-card/50">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="size-3.5 text-primary" />
                      Curriculum item
                    </div>
                    <div className="flex gap-2">
                      {canUpdate && (
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300" onClick={() => handleEdit(subject)}>
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                          onClick={() => setDeleteSubject(subject)}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteSubject} onOpenChange={(open) => { if (!open) setDeleteSubject(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subject</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>&ldquo;{deleteSubject?.name}&rdquo;</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || !canDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, note, tone }: { icon: typeof BookMarked; label: string; value: number; note: string; tone: 'sky' | 'emerald' | 'violet' | 'amber' }) {
  const styles = {
    sky: { card: 'border-sky-200/80 from-sky-50 via-white to-cyan-50 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10', icon: 'from-sky-500 to-cyan-600', value: 'text-sky-700 dark:text-sky-300' },
    emerald: { card: 'border-emerald-200/80 from-emerald-50 via-white to-teal-50 dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10', icon: 'from-emerald-500 to-teal-600', value: 'text-emerald-700 dark:text-emerald-300' },
    violet: { card: 'border-violet-200/80 from-violet-50 via-white to-purple-50 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10', icon: 'from-violet-500 to-purple-600', value: 'text-violet-700 dark:text-violet-300' },
    amber: { card: 'border-amber-200/80 from-amber-50 via-white to-orange-50 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10', icon: 'from-amber-500 to-orange-600', value: 'text-amber-700 dark:text-amber-300' },
  }[tone]

  return (
    <Card className={cn('group gap-0 border bg-gradient-to-r py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', styles.card)}>
      <CardContent className="flex items-center gap-2.5 p-2.5">
        <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm', styles.icon)}>
          <Icon className="size-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={cn('text-lg font-bold leading-tight', styles.value)}>{value}</p>
          <p className="truncate text-[11px] text-muted-foreground">{note}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function Metric({ label, value, display }: { label: string; value: number; display?: string }) {
  return (
    <div className="border-r px-3 py-2 last:border-r-0">
      <p className="text-sm font-semibold leading-tight">{display || value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function SectionTitle({ icon: Icon, label }: { icon: typeof Layers; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-primary to-cyan-600 text-white"><Icon className="size-3 text-white" /></span>
      {label}
    </div>
  )
}

function EmptySearch({ icon: Icon, title, description, actionLabel, onAction }: {
  icon: typeof Search
  title: string
  description: string
  actionLabel?: string
  onAction: () => void
}) {
  return (
    <Card className="relative gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
      <div aria-hidden className="absolute -right-8 -top-10 size-28 rounded-full border-[14px] border-sky-200/25 dark:border-sky-500/10" />
      <CardContent className="relative flex flex-col items-center justify-center py-10 text-center">
        <span className="mb-3 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-md"><Icon className="size-6 text-white" /></span>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {actionLabel ? <Button size="sm" onClick={onAction} className="mt-3 h-8 gap-1.5 px-3 text-xs">{actionLabel}</Button> : null}
      </CardContent>
    </Card>
  )
}
