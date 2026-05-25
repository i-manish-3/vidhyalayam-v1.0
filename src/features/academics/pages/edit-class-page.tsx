'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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
  ArrowLeft,
  PlusCircle,
  X,
  GraduationCap,
  Users,
  Layers,
  BookOpen,
  Loader2,
  CheckCircle2,
  Save,
  Trash2,
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

interface SectionData {
  id: string
  name: string
  capacity: number
  _count?: { students: number }
}

interface SubjectInfo {
  id: string
  name: string
  code: string | null
  type: string
  sequenceNo: number | null
  isActive: boolean
}

interface ClassData {
  id: string
  name: string
  isActive: boolean
  sections?: SectionData[]
  subjects?: SubjectInfo[]
  _count?: { students: number }
}

interface AllSubject {
  id: string
  name: string
  code: string | null
  type: string
  sequenceNo: number | null
  isActive: boolean
}

// Section input for new (unsaved) sections
interface NewSectionInput {
  tempId: string
  name: string
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function EditClassPage() {
  const { toast } = useToast()
  const goBack = useAppStore((s) => s.goBack)
  const selectedClassId = useAppStore((s) => s.selectedClassId)

  // Class data
  const [classData, setClassData] = useState<ClassData | null>(null)
  const [loading, setLoading] = useState(true)

  // Edit form
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set())

  // Sections
  const [existingSections, setExistingSections] = useState<SectionData[]>([])
  const [newSections, setNewSections] = useState<NewSectionInput[]>([])
  const [deleteSectionId, setDeleteSectionId] = useState<string | null>(null)
  const [deletingSection, setDeletingSection] = useState(false)

  // All subjects
  const [allSubjects, setAllSubjects] = useState<AllSubject[]>([])

  // Save state
  const [saving, setSaving] = useState(false)

  // ── Fetch class data ──
  const fetchClass = useCallback(async () => {
    if (!selectedClassId) return
    try {
      const res = await api.get<{ classes: ClassData[] }>('/api/school/classes')
      const found = (res.classes || []).find(c => c.id === selectedClassId)
      if (!found) {
        toast({ title: 'Class Not Found', description: 'The class could not be found. It may have been deleted.', variant: 'destructive' })
        goBack('classes')
        return
      }
      setClassData(found)
      setName(found.name || '')
      setSelectedSubjectIds(new Set(found.subjects?.map(s => s.id) || []))
      setExistingSections(found.sections || [])
    } catch {
      toast({ title: "Couldn't Load Class", description: 'We couldn\'t load the class details. Please try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [selectedClassId, toast, goBack])

  const fetchSubjects = useCallback(async () => {
    try {
      const res = await api.get<{ subjects: AllSubject[] }>('/api/school/subjects')
      setAllSubjects(res.subjects || [])
    } catch {
      // silently ignore
    }
  }, [])

  useEffect(() => {
    fetchClass()
    fetchSubjects()
  }, [fetchClass, fetchSubjects])

  // Redirect if no class selected
  useEffect(() => {
    if (!selectedClassId) {
      goBack('classes')
    }
  }, [selectedClassId, goBack])

  // ── Group subjects by type ──
  const subjectsByType = SUBJECT_TYPES.map(typeConfig => ({
    ...typeConfig,
    subjects: allSubjects.filter(s => s.type === typeConfig.value),
  })).filter(group => group.subjects.length > 0)

  const activeSubjectCount = allSubjects.length

  // ── Toggle subject selection ──
  const toggleSubject = (subjectId: string) => {
    setSelectedSubjectIds(prev => {
      const next = new Set(prev)
      if (next.has(subjectId)) next.delete(subjectId)
      else next.add(subjectId)
      return next
    })
  }

  const toggleAllInGroup = (typeValue: string) => {
    const groupSubjects = allSubjects.filter(s => s.type === typeValue && true)
    const groupIds = groupSubjects.map(s => s.id)
    const allSelected = groupIds.every(id => selectedSubjectIds.has(id))

    setSelectedSubjectIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        groupIds.forEach(id => next.delete(id))
      } else {
        groupIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const toggleAllSubjects = () => {
    const activeIds = allSubjects.filter(s => true).map(s => s.id)
    if (selectedSubjectIds.size === activeIds.length) {
      setSelectedSubjectIds(new Set())
    } else {
      setSelectedSubjectIds(new Set(activeIds))
    }
  }

  // ── Name validation ──
  const validateName = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setNameError('Class name is required.')
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

  // ── Section management ──
  const addNewSection = () => {
    setNewSections(prev => [...prev, { tempId: `new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '' }])
  }

  const updateNewSection = (tempId: string, value: string) => {
    setNewSections(prev => prev.map(s => s.tempId === tempId ? { ...s, name: value } : s))
  }

  const removeNewSection = (tempId: string) => {
    setNewSections(prev => prev.filter(s => s.tempId !== tempId))
  }

  const handleDeleteSection = async () => {
    if (!deleteSectionId || !classData) return
    setDeletingSection(true)
    try {
      await api.delete(`/api/school/sections/${deleteSectionId}`)
      toast({ title: 'Section Deleted', description: 'The section has been removed from this class.' })
      setExistingSections(prev => prev.filter(s => s.id !== deleteSectionId))
      setDeleteSectionId(null)
    } catch (err) {
      toast({ title: "Couldn't Delete Section", description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    } finally {
      setDeletingSection(false)
    }
  }

  // ── Save handler ──
  const handleSave = async () => {
    if (!classData) return
    if (!validateName(name)) return

    setSaving(true)
    try {
      // 1. Update class (name, isActive, subjectIds)
      await api.put(`/api/school/classes/${classData.id}`, {
        name: name.trim(),
        subjectIds: Array.from(selectedSubjectIds),
      })

      // 2. Create new sections
      const validNewSections = newSections.filter(s => s.name.trim())
      if (validNewSections.length > 0) {
        await api.post('/api/school/sections', {
          classId: classData.id,
          sections: validNewSections.map(s => ({ name: s.name.trim() })),
        })
      }

      toast({ title: 'Class Updated', description: `"${name.trim()}" has been updated successfully.` })
      goBack('classes')
    } catch (err) {
      toast({ title: "Couldn't Update Class", description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ── Count helpers ──
  const totalSections = existingSections.length + newSections.filter(s => s.name.trim()).length

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!classData) return null

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          onClick={() => goBack('classes')}
          disabled={saving}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight">Edit Class</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Update details for <span className="font-medium text-foreground">{classData.name}</span>
          </p>
        </div>
        <div className="shrink-0">
          <Button onClick={handleSave} disabled={!name.trim() || saving} className="gap-1.5 min-w-[120px]">
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

      {/* ── Class Details Card ── */}
      <Card className="gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="border-b bg-muted/30 px-4 py-2.5 sm:px-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="size-4 text-muted-foreground" />
            Class Details
          </CardTitle>
          <CardDescription className="text-xs">Update the basic information for this class</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-3 sm:px-5">
          <div className="space-y-2 max-w-md">
            <Label htmlFor="class-name" className="text-xs font-medium">
              Class Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="class-name"
              placeholder="e.g., Class 1, Class 10, Nursery"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onBlur={() => validateName(name)}
              disabled={saving}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'class-name-error' : undefined}
            />
            {nameError && (
              <p id="class-name-error" className="text-xs text-destructive mt-1">
                {nameError}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Sections Card ── */}
      <Card className="gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="border-b bg-muted/30 px-4 py-2.5 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4 text-muted-foreground" />
                Sections
                {totalSections > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {totalSections} section{totalSections !== 1 ? 's' : ''}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                Add or remove sections to organize students within this class
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={addNewSection}
              disabled={saving}
            >
              <PlusCircle className="size-3.5" />
              Add Section
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-3 sm:px-5">
          <div className="space-y-2.5">
            {/* Existing sections */}
            {existingSections.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Current Sections</p>
                {existingSections.map((section, index) => (
                  <div
                    key={section.id}
                    className="grid grid-cols-1 items-center gap-3 rounded-md border bg-background p-2.5 sm:grid-cols-[1fr_auto]"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="shrink-0 text-xs h-6 w-6 flex items-center justify-center p-0 font-mono">
                        {index + 1}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium">{section.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {section._count?.students ?? 0} student{(section._count?.students ?? 0) !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => setDeleteSectionId(section.id)}
                      disabled={saving}
                      title="Delete section"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* New (unsaved) sections */}
            {newSections.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">New Sections</p>
                {newSections.map((section, index) => (
                  <div
                    key={section.tempId}
                    className="grid grid-cols-1 items-start gap-3 rounded-md border border-emerald-200/50 bg-emerald-50/50 p-2.5 dark:border-emerald-800/50 dark:bg-emerald-950/20 sm:grid-cols-[1fr_36px]"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="shrink-0 text-xs h-6 w-6 flex items-center justify-center p-0 font-mono border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400">
                        {existingSections.length + index + 1}
                      </Badge>
                      <Input
                        placeholder="e.g., A, B, C"
                        value={section.name}
                        onChange={(e) => updateNewSection(section.tempId, e.target.value)}
                        className="h-9"
                        disabled={saving}
                        maxLength={10}
                        autoFocus
                      />
                    </div>
                    <div className="flex items-center justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => removeNewSection(section.tempId)}
                        disabled={saving}
                        title="Remove section"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state for no sections */}
            {existingSections.length === 0 && newSections.length === 0 && (
              <div className="py-6 text-center">
                <Users className="size-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No sections yet</p>
                <p className="text-xs text-muted-foreground mt-1">Add sections to organize students within this class.</p>
              </div>
            )}

            {/* Add section button */}
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 border-dashed"
              onClick={addNewSection}
              disabled={saving}
            >
              <PlusCircle className="size-4" />
              Add Section
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Subject Assignment Card ── */}
      <Card className="gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="border-b bg-muted/30 px-4 py-2.5 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="size-4 text-muted-foreground" />
                Assign Subjects
                {selectedSubjectIds.size > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {selectedSubjectIds.size} selected
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                Select subjects to assign to this class, grouped by type
              </CardDescription>
            </div>
            {activeSubjectCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs h-7 shrink-0"
                onClick={toggleAllSubjects}
              >
                {selectedSubjectIds.size === activeSubjectCount ? 'Deselect All' : 'Select All'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-3 sm:px-5">
          {subjectsByType.length === 0 ? (
            <div className="py-6 text-center">
              <BookOpen className="size-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No subjects available</p>
              <p className="text-xs text-muted-foreground mt-1">Add subjects first, then assign them to classes.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {subjectsByType.map((group) => {
                const allGroupSelected = group.subjects.every(s => selectedSubjectIds.has(s.id))

                return (
                  <div key={group.value} className="space-y-2">
                    {/* Type Group Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${group.accent}`} />
                        <span className="text-sm font-semibold">{group.label} Subjects</span>
                        <Badge className={`text-[10px] px-1.5 py-0 h-5 font-medium ${group.badge}`}>
                          {group.subjects.length}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs h-6 px-2"
                        onClick={() => toggleAllInGroup(group.value)}
                      >
                        {allGroupSelected ? 'Deselect' : 'Select All'}
                      </Button>
                    </div>

                    {/* Subject Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {group.subjects.map((subject) => {
                        const isSelected = selectedSubjectIds.has(subject.id)
                        return (
                          <div
                            key={subject.id}
                            onClick={() => toggleSubject(subject.id)}
                            className={`
                              relative flex cursor-pointer items-center gap-3 rounded-md border p-2.5 transition-all duration-150
                              ${isSelected
                                ? `${group.color} ${group.border} ring-1 ring-current/10`
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
                              <p className={`text-sm font-medium truncate ${isSelected ? group.checkColor : ''}`}>
                                {subject.name}
                              </p>
                              {subject.code && (
                                <p className="text-[11px] text-muted-foreground font-mono">{subject.code}</p>
                              )}
                            </div>
                            {isSelected && (
                              <CheckCircle2 className={`size-4 ${group.checkColor} shrink-0`} />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {/* Selection Summary */}
              {selectedSubjectIds.size > 0 && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                    <span>
                      {selectedSubjectIds.size} of {activeSubjectCount} subjects selected
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {SUBJECT_TYPES.map(typeConfig => {
                        const count = allSubjects.filter(
                          s => s.type === typeConfig.value && true && selectedSubjectIds.has(s.id)
                        ).length
                        if (count === 0) return null
                        return (
                          <Badge key={typeConfig.value} className={`text-[10px] px-1.5 py-0 h-5 ${typeConfig.badge}`}>
                            {count} {typeConfig.label}
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-1">
        <Button
          onClick={handleSave}
          disabled={!name.trim() || saving}
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
          onClick={() => goBack('classes')}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>

      {/* Delete Section Confirmation Dialog */}
      <AlertDialog open={!!deleteSectionId} onOpenChange={(open) => { if (!open) setDeleteSectionId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Section</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete section <strong>&ldquo;{existingSections.find(s => s.id === deleteSectionId)?.name}&rdquo;</strong>?
              {(existingSections.find(s => s.id === deleteSectionId)?._count?.students ?? 0) > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  This section has {existingSections.find(s => s.id === deleteSectionId)?._count?.students} student{existingSections.find(s => s.id === deleteSectionId)?._count?.students !== 1 ? 's' : ''} assigned.
                  Please move or remove the students before deleting this section.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingSection}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSection}
              disabled={deletingSection || (existingSections.find(s => s.id === deleteSectionId)?._count?.students ?? 0) > 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingSection ? 'Deleting...' : 'Yes, Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
