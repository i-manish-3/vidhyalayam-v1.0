'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { PlusCircle, BookMarked, BookOpen, FlaskConical, Globe, Music, Calculator, PenTool, Palette, Dumbbell, Languages, Microscope, MoreVertical, Pencil, Trash2, Search, X, Filter } from 'lucide-react'

const SUBJECT_TYPES = [
  { value: 'primary', label: 'Primary', cardBg: 'bg-blue-50 dark:bg-blue-950/30', iconBg: 'bg-blue-100 dark:bg-blue-900/50', iconColor: 'text-blue-600 dark:text-blue-400', badgeBg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  { value: 'optional', label: 'Optional', cardBg: 'bg-amber-50 dark:bg-amber-950/30', iconBg: 'bg-amber-100 dark:bg-amber-900/50', iconColor: 'text-amber-600 dark:text-amber-400', badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
  { value: 'extra', label: 'Extra', cardBg: 'bg-teal-50 dark:bg-teal-950/30', iconBg: 'bg-teal-100 dark:bg-teal-900/50', iconColor: 'text-teal-600 dark:text-teal-400', badgeBg: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300' },
  { value: 'special', label: 'Special', cardBg: 'bg-purple-50 dark:bg-purple-950/30', iconBg: 'bg-purple-100 dark:bg-purple-900/50', iconColor: 'text-purple-600 dark:text-purple-400', badgeBg: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
] as const

// Map subject names to relevant icons
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
  const { toast } = useToast()
  const { navigateTo, setSelectedSubjectId } = useAppStore()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)
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
      // silently ignore
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
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => {
    fetchClasses()
    fetchData()
  }, [fetchClasses, fetchData])

  // Re-fetch when class filter changes
  const handleClassFilter = (classId: string) => {
    setSelectedClassId(classId)
    setLoading(true)
    fetchData(classId)
  }

  const handleEdit = (subject: Subject) => {
    setSelectedSubjectId(subject.id)
    navigateTo('edit-subject')
  }

  const confirmDelete = (subject: Subject) => {
    setDeleteSubject(subject)
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

  // Filter subjects by search AND type (client-side, on top of server-side class filter)
  const filteredSubjects = subjects.filter(s => {
    // Type filter
    if (selectedType !== 'all' && s.type !== selectedType) return false
    // Search filter
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return s.name.toLowerCase().includes(q) ||
      (s.code && s.code.toLowerCase().includes(q)) ||
      s.type.toLowerCase().includes(q) ||
      (s.classes && s.classes.some(c => c.name.toLowerCase().includes(q)))
  })

  const selectedClassName = selectedClassId !== 'all' ? classes.find(c => c.id === selectedClassId)?.name : null
  const selectedTypeLabel = selectedType !== 'all' ? SUBJECT_TYPES.find(t => t.value === selectedType)?.label : null
  const hasActiveFilters = selectedClassId !== 'all' || selectedType !== 'all'

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subject List"
        description={`${filteredSubjects.length} subject${filteredSubjects.length !== 1 ? 's' : ''}${selectedClassName ? ` in ${selectedClassName}` : ''}${selectedTypeLabel ? ` · ${selectedTypeLabel}` : ''}`}
        action={{ label: 'Add Subject', icon: PlusCircle, onClick: () => navigateTo('add-subject') }}
      />

      {/* Filters Row - always show when subjects exist OR a filter is active */}
      {(subjects.length > 0 || hasActiveFilters) && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search subjects by name, code, type, or class..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 h-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Spacer to push filters right */}
          <div className="flex-1" />

          {/* Filters - Right Side */}
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />

            {/* Type Filter */}
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Subject type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {SUBJECT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${
                        t.value === 'primary' ? 'bg-blue-400' :
                        t.value === 'optional' ? 'bg-amber-400' :
                        t.value === 'extra' ? 'bg-teal-400' :
                        'bg-purple-400'
                      }`} />
                      {t.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Class Filter */}
            <Select value={selectedClassId} onValueChange={handleClassFilter}>
              <SelectTrigger className="w-[180px] h-9">
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

            {/* Clear all filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-muted-foreground"
                onClick={() => {
                  setSelectedType('all')
                  handleClassFilter('all')
                }}
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}

      {subjects.length === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={BookMarked}
          title="No Subjects Yet"
          description="Add subjects to set up your school's curriculum."
          action={{ label: 'Add Subject', onClick: () => navigateTo('add-subject') }}
        />
      ) : subjects.length === 0 && hasActiveFilters ? (
        <div className="text-center py-12">
          <BookMarked className="size-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No subjects found{selectedClassName ? <> for <strong>{selectedClassName}</strong></> : ''}{selectedTypeLabel ? <> of type <strong>{selectedTypeLabel}</strong></> : ''}
          </p>
          <Button variant="link" size="sm" onClick={() => { setSelectedType('all'); handleClassFilter('all') }} className="mt-1">
            Clear filters
          </Button>
        </div>
      ) : filteredSubjects.length === 0 ? (
        <div className="text-center py-12">
          <Search className="size-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No subjects match &ldquo;{searchQuery}&rdquo;</p>
          <Button variant="link" size="sm" onClick={() => setSearchQuery('')} className="mt-1">
            Clear search
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSubjects.map((subject) => {
            const typeConfig = SUBJECT_TYPES.find(t => t.value === subject.type) || SUBJECT_TYPES[0]
            const IconComponent = getSubjectIcon(subject.name)

            return (
              <Card
                key={subject.id}
                className="group relative overflow-hidden transition-all duration-200 hover:shadow-md border"
              >
                <CardContent className="p-4 space-y-3">
                  {/* Card Header: Icon + Title + Menu */}
                  <div className="flex items-start gap-3">
                    {/* Circular Icon */}
                    <div className={`size-10 rounded-full flex items-center justify-center shrink-0 ${typeConfig.iconBg}`}>
                      <IconComponent className={`size-5 ${typeConfig.iconColor}`} />
                    </div>

                    {/* Title + Code */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm leading-tight truncate" title={subject.name}>
                        {subject.name}
                      </h3>
                      {subject.code && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{subject.code}</p>
                      )}
                    </div>

                    {/* Actions Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
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
                          onClick={() => confirmDelete(subject)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Metadata Badges Row */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Type Badge */}
                    <Badge className={`text-[10px] px-1.5 py-0 h-5 font-medium ${typeConfig.badgeBg}`}>
                      {typeConfig.label}
                    </Badge>

                    {/* Sequence No */}
                    {subject.sequenceNo != null && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-mono">
                        Seq: {subject.sequenceNo}
                      </Badge>
                    )}
                  </div>

                  {/* Assigned Classes */}
                  {subject.classes && subject.classes.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Classes</p>
                      <div className="flex flex-wrap gap-1">
                        {subject.classes.map(cls => (
                          <Badge key={cls.id} variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                            {cls.name || 'Unnamed'}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick Actions Row */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => handleEdit(subject)}
                    >
                      <Pencil className="size-3" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                      onClick={() => confirmDelete(subject)}
                    >
                      <Trash2 className="size-3" />
                      Delete
                    </Button>
                  </div>
                </CardContent>

                {/* Type accent line at top */}
                <div className={`absolute top-0 left-0 right-0 h-0.5 ${
                  subject.type === 'primary' ? 'bg-blue-400' :
                  subject.type === 'optional' ? 'bg-amber-400' :
                  subject.type === 'extra' ? 'bg-teal-400' :
                  'bg-purple-400'
                }`} />
              </Card>
            )
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteSubject} onOpenChange={(open) => { if (!open) setDeleteSubject(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subject</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>&ldquo;{deleteSubject?.name}&rdquo;</strong>? This action cannot be undone. All data associated with this subject will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
