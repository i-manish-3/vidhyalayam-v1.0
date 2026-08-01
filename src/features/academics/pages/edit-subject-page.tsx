'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  BookOpen,
  Loader2,
  Save,
  Trash2,
  X,
  GraduationCap,
} from 'lucide-react'

// ─── Subject Type Configuration ──────────────────────────────────────────────

const SUBJECT_TYPES = [
  { value: 'primary', label: 'Primary', color: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300', accent: 'bg-blue-400', checkColor: 'text-blue-600' },
  { value: 'optional', label: 'Optional', color: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300', accent: 'bg-amber-400', checkColor: 'text-amber-600' },
  { value: 'extra', label: 'Extra', color: 'bg-teal-50 dark:bg-teal-950/30', border: 'border-teal-200 dark:border-teal-800', badge: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300', accent: 'bg-teal-400', checkColor: 'text-teal-600' },
  { value: 'special', label: 'Special', color: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-800', badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300', accent: 'bg-purple-400', checkColor: 'text-purple-600' },
] as const

function getTypeConfig(type: string) {
  return SUBJECT_TYPES.find(t => t.value === type) || SUBJECT_TYPES[0]
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClassInfo {
  id: string
  name: string | null
}

interface SubjectData {
  id: string
  name: string
  code: string | null
  type: string
  sequenceNo: number | null
  isActive: boolean
  classes?: ClassInfo[]
}

interface ClassItem {
  id: string
  name: string | null
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function EditSubjectPage({ subjectId }: { subjectId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const canUpdate = hasPermission(PERMISSIONS.SUBJECT_UPDATE)

  // Subject data
  const [subjectData, setSubjectData] = useState<SubjectData | null>(null)
  const [loading, setLoading] = useState(true)

  // Edit form
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [code, setCode] = useState('')
  const [sequenceNo, setSequenceNo] = useState('')
  const [type, setType] = useState('primary')
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set())

  // Classes for assignment
  const [classes, setClasses] = useState<ClassItem[]>([])

  // Save state
  const [saving, setSaving] = useState(false)

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── Fetch subject data ──
  const fetchSubject = useCallback(async () => {
    try {
      const res = await api.get<{ subjects: SubjectData[] }>('/api/school/subjects')
      const found = (res.subjects || []).find(s => s.id === subjectId)
      if (!found) {
        toast({ title: 'Subject Not Found', description: 'The subject could not be found. It may have been deleted.', variant: 'destructive' })
        router.push('/academics/subjects')
        return
      }
      setSubjectData(found)
      setName(found.name || '')
      setCode(found.code || '')
      setSequenceNo(found.sequenceNo != null ? String(found.sequenceNo) : '')
      setType(found.type || 'primary')
      setSelectedClassIds(new Set(found.classes?.map(c => c.id) || []))
    } catch {
      toast({ title: "Couldn't Load Subject", description: 'We couldn\'t load the subject details. Please try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [subjectId, toast, router])

  const fetchClasses = useCallback(async () => {
    try {
      const res = await api.get<{ classes: ClassItem[] }>('/api/school/classes')
      setClasses(res.classes || [])
    } catch {
      // silently ignore
    }
  }, [])

  useEffect(() => {
    fetchSubject()
    fetchClasses()
  }, [fetchSubject, fetchClasses])


  // ── Name validation ──
  const validateName = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setNameError('Subject name is required.')
      return false
    }
    setNameError('')
    return true
  }

  const handleNameChange = (value: string) => {
    setName(value)
    if (nameError && value.trim().length >= 1) {
      setNameError('')
    }
  }

  // ── Class selection toggle ──
  const toggleClass = (classId: string) => {
    setSelectedClassIds(prev => {
      const next = new Set(prev)
      if (next.has(classId)) next.delete(classId)
      else next.add(classId)
      return next
    })
  }

  const toggleAllClasses = () => {
    if (selectedClassIds.size === classes.length) {
      setSelectedClassIds(new Set())
    } else {
      setSelectedClassIds(new Set(classes.map(c => c.id)))
    }
  }

  // ── Save handler ──
  const handleSave = async () => {
    if (!subjectData) return
    if (!validateName(name)) return

    setSaving(true)
    try {
      await api.put(`/api/school/subjects/${subjectData.id}`, {
        name: name.trim(),
        code: code.trim() || null,
        sequenceNo: sequenceNo ? parseInt(sequenceNo, 10) : null,
        type,
        classIds: Array.from(selectedClassIds),
      })
      toast({ title: 'Subject Updated', description: `"${name.trim()}" has been updated successfully.` })
      router.push('/academics/subjects')
    } catch (err) {
      toast({ title: "Couldn't Update Subject", description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ── Delete handler ──
  const handleDelete = async () => {
    if (!subjectData) return
    setDeleting(true)
    try {
      await api.delete(`/api/school/subjects/${subjectData.id}`)
      toast({ title: 'Subject Deleted', description: `"${subjectData.name}" has been removed.` })
      setShowDeleteDialog(false)
      router.push('/academics/subjects')
    } catch (err) {
      toast({ title: "Couldn't Delete Subject", description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!subjectData) return null

  const typeConfig = getTypeConfig(type)

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Edit Subject</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Update details for <span className="font-medium text-foreground">{subjectData.name}</span>
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
            onClick={() => setShowDeleteDialog(true)}
            disabled={saving || !canUpdate}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving || !canUpdate} className="gap-1.5 min-w-[120px]">
            {saving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="size-3.5" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ── Subject Details Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="size-4" />
            Subject Details
          </CardTitle>
          <CardDescription>Update the basic information for this subject</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="subject-name" className="text-xs font-medium">
                Subject Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="subject-name"
                placeholder="e.g., Mathematics"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                onBlur={() => validateName(name)}
                disabled={saving}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'subject-name-error' : undefined}
              />
              {nameError && (
                <p id="subject-name-error" className="text-xs text-destructive mt-1">
                  {nameError}
                </p>
              )}
            </div>

            {/* Code */}
            <div className="space-y-2">
              <Label htmlFor="subject-code" className="text-xs font-medium">Code</Label>
              <Input
                id="subject-code"
                placeholder="e.g., MATH101"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={saving}
              />
              <p className="text-[11px] text-muted-foreground">Must be unique. Duplicate names are allowed, but codes must be different.</p>
            </div>

            {/* Sequence No */}
            <div className="space-y-2">
              <Label htmlFor="subject-seq" className="text-xs font-medium">Sequence No</Label>
              <Input
                id="subject-seq"
                type="number"
                placeholder="e.g., 1"
                value={sequenceNo}
                onChange={(e) => setSequenceNo(e.target.value)}
                min="0"
                disabled={saving}
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Subject Type</Label>
              <Select value={type} onValueChange={setType} disabled={saving}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${t.accent}`} />
                        {t.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Class Assignment Card ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="size-4" />
                Assign to Classes
                {selectedClassIds.size > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {selectedClassIds.size} class{selectedClassIds.size !== 1 ? 'es' : ''}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                Select which classes this subject belongs to
              </CardDescription>
            </div>
            {classes.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs h-7 shrink-0"
                onClick={toggleAllClasses}
                disabled={saving}
              >
                {selectedClassIds.size === classes.length ? 'Deselect All' : 'Select All'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <div className="text-center py-8">
              <GraduationCap className="size-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No classes available</p>
              <p className="text-xs text-muted-foreground mt-1">Create classes first, then assign subjects to them.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {classes.map((cls) => {
                  const isSelected = selectedClassIds.has(cls.id)
                  return (
                    <div
                      key={cls.id}
                      onClick={() => toggleClass(cls.id)}
                      className={`
                        relative flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all duration-150
                        ${isSelected
                          ? 'bg-primary/5 border-primary/30 ring-1 ring-primary/10'
                          : 'hover:bg-muted/50 border-border'
                        }
                      `}
                    >
                      {/* Custom visual checkbox */}
                      <div
                        className={`size-4 shrink-0 rounded-[4px] border transition-colors duration-150 flex items-center justify-center ${
                          isSelected
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-input bg-background dark:bg-input/30'
                        }`}
                      >
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-current">
                            <path d="M2 5.5L4 7.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : ''}`}>
                          {cls.name || 'Unnamed'}
                        </p>
                      </div>
                      {isSelected && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 shrink-0">
                          Assigned
                        </Badge>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Selection Summary */}
              {selectedClassIds.size > 0 && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                    <span>
                      {selectedClassIds.size} of {classes.length} classes selected
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={!name.trim() || saving || !canUpdate}
          className="gap-2 min-w-[140px]"
        >
          {saving ? (
            <>
              <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Saving...
            </>
          ) : (
            <>
              <Save className="size-4" />
              Save Changes
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/academics/subjects')}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subject</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>&ldquo;{subjectData.name}&rdquo;</strong>? This action cannot be undone. All data associated with this subject will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || !canUpdate}
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
