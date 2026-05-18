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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import {
  PlusCircle, GraduationCap, Users, Pencil, Trash2, BookOpen,
  MoreVertical, Search, X, Layers, Loader2,
} from 'lucide-react'

// ─── Subject Type Config ─────────────────────────────────────────────────────

const SUBJECT_TYPES = [
  { value: 'primary', label: 'Primary', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  { value: 'optional', label: 'Optional', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
  { value: 'extra', label: 'Extra', badge: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300' },
  { value: 'special', label: 'Special', badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
] as const

function getTypeBadge(type: string) {
  return SUBJECT_TYPES.find(t => t.value === type) || SUBJECT_TYPES[0]
}

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Main Component ──────────────────────────────────────────────────────────

export function ClassesPage() {
  const { toast } = useToast()
  const { navigateTo, setSelectedClassId } = useAppStore()
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
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Navigate to edit page ──
  const handleEdit = (cls: ClassItem) => {
    setSelectedClassId(cls.id)
    navigateTo('edit-class')
  }

  // ── Delete ──
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

  // Filter classes by search
  const filteredClasses = classes.filter(cls => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (cls.name || '').toLowerCase().includes(q) ||
      (cls.sections && cls.sections.some(s => s.name.toLowerCase().includes(q))) ||
      (cls.subjects && cls.subjects.some(s => s.name.toLowerCase().includes(q)))
  })

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class List"
        description={`${classes.length} class${classes.length !== 1 ? 'es' : ''}`}
        action={{ label: 'Add Class', icon: PlusCircle, onClick: () => navigateTo('add-class') }}
      />

      {/* Search */}
      {classes.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by class name, section, or subject..."
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
        </div>
      )}

      {classes.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No Classes Yet"
          description="Add classes to organize students and sections."
          action={{ label: 'Add Class', onClick: () => navigateTo('add-class') }}
        />
      ) : filteredClasses.length === 0 ? (
        <div className="text-center py-12">
          <Search className="size-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No classes match &ldquo;{searchQuery}&rdquo;</p>
          <Button variant="link" size="sm" onClick={() => setSearchQuery('')} className="mt-1">
            Clear search
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredClasses.map(cls => {
            const sectionCount = cls.sections?.length || 0
            const subjectCount = cls.subjects?.length || 0
            const studentCount = cls._count?.students ?? 0

            return (
              <Card
                key={cls.id}
                className="group relative overflow-hidden transition-all duration-200 hover:shadow-md border"
              >
                <CardContent className="p-4 space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start gap-3">
                    <div className="size-10 rounded-full flex items-center justify-center shrink-0 bg-emerald-100 dark:bg-emerald-900/50">
                      <Layers className="size-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm leading-tight truncate" title={cls.name || 'Unnamed'}>
                        {cls.name || 'Unnamed Class'}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {sectionCount} section{sectionCount !== 1 ? 's' : ''} · {studentCount} student{studentCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {/* Actions Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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

                  {/* Badges Row */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                      <Users className="size-3 mr-0.5" />
                      {studentCount}
                    </Badge>
                    {sectionCount > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                        {sectionCount} sect{sectionCount !== 1 ? 's' : ''}
                      </Badge>
                    )}
                    {subjectCount > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                        <BookOpen className="size-2.5 mr-0.5" />
                        {subjectCount} subj{subjectCount !== 1 ? 's' : ''}
                      </Badge>
                    )}

                  </div>

                  {/* Sections */}
                  {sectionCount > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Sections</p>
                      <div className="flex flex-wrap gap-1">
                        {cls.sections!.map(s => (
                          <Badge key={s.id} variant="secondary" className="text-[10px] px-1.5 py-0 h-5 gap-0.5">
                            {s.name}
                            <span className="text-muted-foreground">
                              ({s._count?.students ?? 0})
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Subjects */}
                  {subjectCount > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Subjects</p>
                      <div className="flex flex-wrap gap-1">
                        {cls.subjects!.slice(0, 5).map(sub => {
                          const typeBadge = getTypeBadge(sub.type)
                          return (
                            <Badge key={sub.id} className={`text-[10px] px-1.5 py-0 h-5 font-medium ${typeBadge.badge}`}>
                              {sub.name}
                            </Badge>
                          )
                        })}
                        {subjectCount > 5 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                            +{subjectCount - 5} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Quick Actions Row */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => handleEdit(cls)}
                    >
                      <Pencil className="size-3" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                      onClick={() => setDeleteClass(cls)}
                    >
                      <Trash2 className="size-3" />
                      Delete
                    </Button>
                  </div>
                </CardContent>

                {/* Accent line */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-400" />
              </Card>
            )
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
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
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
