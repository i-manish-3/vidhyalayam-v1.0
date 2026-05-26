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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import {
  PlusCircle,
  GraduationCap,
  Users,
  Pencil,
  Trash2,
  BookOpen,
  MoreVertical,
  Search,
  X,
  Layers,
  Loader2,
  CheckCircle2,
} from 'lucide-react'

const SUBJECT_TYPES = [
  { value: 'primary', label: 'Primary', badge: 'border-primary/20 bg-primary/10 text-primary' },
  { value: 'optional', label: 'Optional', badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300' },
  { value: 'extra', label: 'Extra', badge: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300' },
  { value: 'special', label: 'Special', badge: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300' },
] as const

function getTypeBadge(type: string) {
  return SUBJECT_TYPES.find(t => t.value === type) || SUBJECT_TYPES[0]
}

interface Section {
  id: string
  name: string
  capacity: number
  _count?: { students: number }
  [key: string]: unknown
}

interface SubjectInfo {
  id: string
  name: string
  code: string | null
  type: string
  sequenceNo: number | null
  isActive: boolean
}

interface ClassItem {
  id: string
  name: string | null
  isActive: boolean
  sections?: Section[]
  subjects?: SubjectInfo[]
  _count?: { students: number }
  [key: string]: unknown
}

export function ClassesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteClass, setDeleteClass] = useState<ClassItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ classes: ClassItem[] }>('/api/school/classes')
      setClasses(res.classes || [])
    } catch {
      toast({ title: 'Couldn\'t Load Classes', description: 'We couldn\'t load the classes. Please refresh the page.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const stats = useMemo(() => {
    const totalSections = classes.reduce((sum, cls) => sum + (cls.sections?.length || 0), 0)
    const totalSubjects = classes.reduce((sum, cls) => sum + (cls.subjects?.length || 0), 0)
    const totalStudents = classes.reduce((sum, cls) => sum + (cls._count?.students ?? 0), 0)
    const activeClasses = classes.filter(cls => cls.isActive).length

    return { totalSections, totalSubjects, totalStudents, activeClasses }
  }, [classes])

  const filteredClasses = useMemo(() => classes.filter(cls => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (cls.name || '').toLowerCase().includes(q) ||
      (cls.sections && cls.sections.some(s => s.name.toLowerCase().includes(q))) ||
      (cls.subjects && cls.subjects.some(s => s.name.toLowerCase().includes(q)))
  }), [classes, searchQuery])

  const handleEdit = (cls: ClassItem) => {
    router.push(`/academics/classes/${cls.id}/edit`)
  }

  const handleDelete = async () => {
    if (!deleteClass) return
    setDeleting(true)
    try {
      await api.delete(`/api/school/classes/${deleteClass.id}`)
      toast({ title: 'Class Deleted', description: `"${deleteClass.name || 'Unnamed'}" has been removed.` })
      setDeleteClass(null)
      fetchData()
    } catch (err) {
      toast({ title: 'Couldn\'t Delete Class', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      <PageHeader
        title="Class List"
        description="Manage class structure, sections, subjects and student strength."
        action={{ label: 'Add Class', icon: PlusCircle, onClick: () => router.push('/academics/classes/new') }}
      />

      {classes.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Layers} label="Classes" value={classes.length} note={`${stats.activeClasses} active`} />
            <StatCard icon={Users} label="Students" value={stats.totalStudents} note="Across all classes" />
            <StatCard icon={GraduationCap} label="Sections" value={stats.totalSections} note="Configured sections" />
            <StatCard icon={BookOpen} label="Subjects" value={stats.totalSubjects} note="Assigned subjects" />
          </div>

          <Card className="gap-0 py-0 shadow-sm">
            <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search class, section, or subject"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
              <Badge variant="secondary" className="w-fit rounded-md px-2 py-1 text-xs">
                {filteredClasses.length} showing
              </Badge>
            </CardContent>
          </Card>
        </>
      )}

      {classes.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No Classes Yet"
          description="Add classes to organize students and sections."
          action={{ label: 'Add Class', onClick: () => router.push('/academics/classes/new') }}
        />
      ) : filteredClasses.length === 0 ? (
        <Card className="py-0">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="mb-3 size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">No classes found</p>
            <p className="mt-1 text-sm text-muted-foreground">No class matches &ldquo;{searchQuery}&rdquo;.</p>
            <Button variant="link" size="sm" onClick={() => setSearchQuery('')} className="mt-1">
              Clear search
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredClasses.map(cls => {
            const sectionCount = cls.sections?.length || 0
            const subjectCount = cls.subjects?.length || 0
            const studentCount = cls._count?.students ?? 0

            return (
              <Card key={cls.id} className="group gap-0 overflow-hidden py-0 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                <CardContent className="p-0">
                  <div className="flex items-start gap-3 border-b bg-muted/20 p-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Layers className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <h3 className="mr-1 truncate text-base font-semibold leading-tight" title={cls.name || 'Unnamed Class'}>
                          {cls.name || 'Unnamed Class'}
                        </h3>
                        {sectionCount > 0 ? cls.sections!.slice(0, 4).map(section => (
                          <Badge key={section.id} variant="secondary" className="h-5 shrink-0 rounded-md px-1.5 text-[11px]">
                            {section.name}
                            <span className="ml-1 text-muted-foreground">({section._count?.students ?? 0})</span>
                          </Badge>
                        )) : (
                          <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 text-[11px] text-muted-foreground">
                            No sections
                          </Badge>
                        )}
                        {sectionCount > 4 && (
                          <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 text-[11px]">
                            +{sectionCount - 4}
                          </Badge>
                        )}
                        <Badge variant={cls.isActive ? 'secondary' : 'outline'} className="h-5 shrink-0 rounded-md px-1.5 text-[11px]">
                          {cls.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {sectionCount} section{sectionCount !== 1 ? 's' : ''} / {studentCount} student{studentCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={() => handleEdit(cls)}>
                          <Pencil className="mr-2 size-3.5" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteClass(cls)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="grid grid-cols-3 border-b text-center">
                    <Metric label="Students" value={studentCount} />
                    <Metric label="Sections" value={sectionCount} />
                    <Metric label="Subjects" value={subjectCount} />
                  </div>

                  <div className="p-4">
                    <div className="space-y-2">
                      <SectionTitle icon={BookOpen} label="Subjects" />
                      {subjectCount > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {cls.subjects!.slice(0, 6).map(subject => {
                            const typeBadge = getTypeBadge(subject.type)
                            return (
                              <Badge key={subject.id} variant="outline" className={`h-6 rounded-md px-2 text-xs font-medium ${typeBadge.badge}`}>
                                {subject.name}
                              </Badge>
                            )
                          })}
                          {subjectCount > 6 && (
                            <Badge variant="outline" className="h-6 rounded-md px-2 text-xs">
                              +{subjectCount - 6} more
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">No subjects assigned.</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t bg-muted/15 px-4 py-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="size-3.5 text-primary" />
                      Ready for setup
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => handleEdit(cls)}>
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteClass(cls)}
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

      <AlertDialog open={!!deleteClass} onOpenChange={(open) => { if (!open) setDeleteClass(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Class</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>&ldquo;{deleteClass?.name || 'Unnamed Class'}&rdquo;</strong>? All its sections will also be removed. This action cannot be undone.
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

function StatCard({ icon: Icon, label, value, note }: { icon: typeof Layers; label: string; value: number; note: string }) {
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r px-3 py-2 last:border-r-0">
      <p className="text-sm font-semibold leading-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function SectionTitle({ icon: Icon, label }: { icon: typeof GraduationCap; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      <Icon className="size-3.5" />
      {label}
    </div>
  )
}
