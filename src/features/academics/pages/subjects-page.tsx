'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
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
} from 'lucide-react'

const SUBJECT_TYPES = [
  { value: 'primary', label: 'Primary', badge: 'border-primary/20 bg-primary/10 text-primary', dot: 'bg-primary' },
  { value: 'optional', label: 'Optional', badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300', dot: 'bg-amber-500' },
  { value: 'extra', label: 'Extra', badge: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300', dot: 'bg-teal-500' },
  { value: 'special', label: 'Special', badge: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300', dot: 'bg-violet-500' },
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

export function SubjectsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filtering, setFiltering] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClassId, setSelectedClassId] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [deleteSubject, setDeleteSubject] = useState<Subject | null>(null)
  const [deleting, setDeleting] = useState(false)

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
    fetchData()
  }, [fetchClasses, fetchData])

  const handleClassFilter = (classId: string) => {
    setSelectedClassId(classId)
    setFiltering(true)
    fetchData(classId)
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
      <PageHeader
        title="Subject List"
        description="Manage curriculum subjects, type, order and class assignment."
        action={{ label: 'Add Subject', icon: PlusCircle, onClick: () => router.push('/academics/subjects/new') }}
      />

      {(subjects.length > 0 || hasActiveFilters) && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={BookMarked} label="Subjects" value={subjects.length} note={`${stats.activeSubjects} active`} />
            <StatCard icon={Layers} label="Assigned" value={stats.assignedSubjects} note="Subjects linked to classes" />
            <StatCard icon={BookOpen} label="Class Links" value={stats.classLinks} note="Total assignments" />
            <StatCard icon={Filter} label={selectedType === 'all' ? 'Types' : 'Filtered'} value={stats.typeCount} note={selectedTypeLabel || 'Subject categories'} />
          </div>

          <Card className="gap-0 py-0 shadow-sm">
            <CardContent className="flex flex-col gap-3 p-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative w-full xl:max-w-md">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search subject, code, type, or class"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-9 bg-background pl-9 pr-9"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="h-9 w-full bg-background sm:w-[150px]">
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
                  <SelectTrigger className="h-9 w-full bg-background sm:w-[190px]">
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

                <Badge variant="secondary" className="h-9 w-fit rounded-md px-3 text-xs">
                  {filtering && <Loader2 className="mr-1.5 size-3 animate-spin" />}
                  {filteredSubjects.length} showing
                </Badge>

                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-9"
                    onClick={() => {
                      setSelectedType('all')
                      handleClassFilter('all')
                    }}
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
          <EmptyState
            icon={BookMarked}
            title="No Subjects Yet"
            description="Add subjects to set up your school's curriculum."
            action={{ label: 'Add Subject', onClick: () => router.push('/academics/subjects/new') }}
          />
        ) : subjects.length === 0 && hasActiveFilters ? (
          <EmptySearch
            icon={BookMarked}
            title="No subjects found"
            description={`No subjects found${selectedClassName ? ` for ${selectedClassName}` : ''}${selectedTypeLabel ? ` of type ${selectedTypeLabel}` : ''}.`}
            actionLabel="Clear filters"
            onAction={() => { setSelectedType('all'); handleClassFilter('all') }}
          />
        ) : filteredSubjects.length === 0 ? (
          <EmptySearch
            icon={Search}
            title="No subjects found"
            description={`No subject matches "${searchQuery}".`}
            actionLabel="Clear search"
            onAction={() => setSearchQuery('')}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredSubjects.map((subject) => {
            const typeConfig = SUBJECT_TYPES.find(type => type.value === subject.type) || SUBJECT_TYPES[0]
            const IconComponent = getSubjectIcon(subject.name)
            const classCount = subject.classes?.length || 0

            return (
              <Card key={subject.id} className="group gap-0 overflow-hidden py-0 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                <CardContent className="p-0">
                  <div className="flex items-start gap-3 border-b bg-muted/20 p-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <IconComponent className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <h3 className="mr-1 truncate text-base font-semibold leading-tight" title={subject.name}>
                          {subject.name}
                        </h3>
                        <Badge variant="outline" className={`h-5 shrink-0 rounded-md px-1.5 text-[11px] ${typeConfig.badge}`}>
                          {typeConfig.label}
                        </Badge>
                        <Badge variant={subject.isActive ? 'secondary' : 'outline'} className="h-5 shrink-0 rounded-md px-1.5 text-[11px]">
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
                        <DropdownMenuItem onClick={() => handleEdit(subject)}>
                          <Pencil className="mr-2 size-3.5" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteSubject(subject)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="grid grid-cols-3 border-b text-center">
                    <Metric label="Classes" value={classCount} />
                    <Metric label="Sequence" value={subject.sequenceNo ?? 0} />
                    <Metric label="Status" value={subject.isActive ? 1 : 0} display={subject.isActive ? 'Active' : 'Inactive'} />
                  </div>

                  <div className="space-y-2 p-4">
                    <SectionTitle icon={Layers} label="Assigned Classes" />
                    {classCount > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {subject.classes!.slice(0, 8).map(cls => (
                          <Badge key={cls.id} variant="secondary" className="h-6 rounded-md px-2 text-xs">
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
                      <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">No classes assigned.</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t bg-muted/15 px-4 py-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="size-3.5 text-primary" />
                      Curriculum item
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => handleEdit(subject)}>
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteSubject(subject)}
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
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
              disabled={deleting}
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

function StatCard({ icon: Icon, label, value, note }: { icon: typeof BookMarked; label: string; value: number; note: string }) {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold leading-tight">{value}</p>
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
      <Icon className="size-3.5" />
      {label}
    </div>
  )
}

function EmptySearch({ icon: Icon, title, description, actionLabel, onAction }: {
  icon: typeof Search
  title: string
  description: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <Card className="py-0">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <Icon className="mb-3 size-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <Button variant="link" size="sm" onClick={onAction} className="mt-1">
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  )
}
