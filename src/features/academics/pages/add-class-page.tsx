'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
// Checkbox removed — using custom visual indicator to avoid Radix internal state issues
import {
  List,
  PlusCircle,
  X,
  GraduationCap,
  Users,
  Layers,
  BookOpen,
  Loader2,
  CheckCircle2,
} from 'lucide-react'

// ─── Subject Type Configuration ──────────────────────────────────────────────

const SUBJECT_TYPES = [
  { value: 'primary', label: 'Primary', color: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300', accent: 'bg-blue-400', checkColor: 'text-blue-600' },
  { value: 'optional', label: 'Optional', color: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300', accent: 'bg-amber-400', checkColor: 'text-amber-600' },
  { value: 'extra', label: 'Extra', color: 'bg-teal-50 dark:bg-teal-950/30', border: 'border-teal-200 dark:border-teal-800', badge: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300', accent: 'bg-teal-400', checkColor: 'text-teal-600' },
  { value: 'special', label: 'Special', color: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-800', badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300', accent: 'bg-purple-400', checkColor: 'text-purple-600' },
] as const

// ─── Types ───────────────────────────────────────────────────────────────────

interface SectionInput {
  id: string
  name: string
}

interface SubjectItem {
  id: string
  name: string
  code: string | null
  type: string
  sequenceNo: number | null
  isActive: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createSectionId(): string {
  return `section_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function createEmptySection(): SectionInput {
  return { id: createSectionId(), name: '' }
}

function getTypeConfig(type: string) {
  return SUBJECT_TYPES.find(t => t.value === type) || SUBJECT_TYPES[0]
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AddClassPage() {
  const { toast } = useToast()
  const navigateTo = useAppStore((s) => s.navigateTo)
  const goBack = useAppStore((s) => s.goBack)

  // Form state
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [sections, setSections] = useState<SectionInput[]>([createEmptySection()])
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  // Subjects data
  const [subjects, setSubjects] = useState<SubjectItem[]>([])
  const [loadingSubjects, setLoadingSubjects] = useState(true)

  // Fetch subjects on mount
  useEffect(() => {
    api.get<{ subjects: SubjectItem[] }>('/api/school/subjects')
      .then(res => {
        setSubjects(res.subjects || [])
      })
      .catch(() => {
        toast({ title: 'Could not load subjects', description: 'Subjects list could not be loaded. You can still create the class and assign subjects later.', variant: 'destructive' })
      })
      .finally(() => setLoadingSubjects(false))
  }, [toast])

  // Group subjects by type
  const subjectsByType = SUBJECT_TYPES.map(typeConfig => ({
    ...typeConfig,
    subjects: subjects.filter(s => s.type === typeConfig.value),
  })).filter(group => group.subjects.length > 0)

  // ── Toggle subject selection ──
  const toggleSubject = (subjectId: string) => {
    setSelectedSubjectIds(prev => {
      const next = new Set(prev)
      if (next.has(subjectId)) {
        next.delete(subjectId)
      } else {
        next.add(subjectId)
      }
      return next
    })
  }

  // ── Toggle all subjects in a type group ──
  const toggleAllInGroup = (typeValue: string) => {
    const groupSubjects = subjects.filter(s => s.type === typeValue)
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

  // ── Toggle all subjects ──
  const toggleAllSubjects = () => {
    const activeSubjectIds = subjects.map(s => s.id)
    if (selectedSubjectIds.size === activeSubjectIds.length) {
      setSelectedSubjectIds(new Set())
    } else {
      setSelectedSubjectIds(new Set(activeSubjectIds))
    }
  }

  // ── Section management ──
  const updateSection = (sectionId: string, value: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, name: value } : s))
    )
  }

  const addSection = () => {
    setSections((prev) => [...prev, createEmptySection()])
  }

  const removeSection = (sectionId: string) => {
    if (sections.length <= 1) {
      toast({ title: 'Cannot Remove', description: 'At least one section row must remain.', variant: 'destructive' })
      return
    }
    setSections((prev) => prev.filter((s) => s.id !== sectionId))
  }

  // ── Validate class name ──
  const validateName = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setNameError('Class name is required. Please enter a name like Class 1, Class 10, or Nursery.')
      return false
    }
    if (trimmed.length < 1) {
      setNameError('Class name must be at least 1 character.')
      return false
    }
    setNameError('')
    return true
  }

  // ── Handle name change with live validation ──
  const handleNameChange = (value: string) => {
    setName(value)
    if (nameError && value.trim().length >= 1) {
      setNameError('')
    }
  }

  // ── Form validity ──
  const isFormValid = name.trim().length >= 1 && !submitting

  // ── Submit handler ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    if (!validateName(name)) return

    // Build payload
    const namedSections = sections.filter((s) => s.name.trim())
    const payload = {
      name: name.trim(),
      sections: namedSections.length > 0
        ? namedSections.map((s) => ({ name: s.name.trim() }))
        : undefined,
      subjectIds: selectedSubjectIds.size > 0
        ? Array.from(selectedSubjectIds)
        : undefined,
    }

    try {
      setSubmitting(true)
      await api.post('/api/school/classes', payload)
      toast({
        title: 'Class Added Successfully',
        description: `${name.trim() || 'New class'} has been created${selectedSubjectIds.size > 0 ? ` with ${selectedSubjectIds.size} subject${selectedSubjectIds.size > 1 ? 's' : ''} assigned` : ''}.`,
      })
      navigateTo('classes')
    } catch (err) {
      toast({
        title: 'Something Went Wrong',
        description: err instanceof Error ? err.message : "We couldn't add the class. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Count sections with names ──
  const namedSectionCount = sections.filter((s) => s.name.trim()).length
  const activeSubjectCount = subjects.length

  return (
    <div className="space-y-4">
      <PageHeader
        title="Add Class"
        description="Create a new class, add sections, and assign subjects."
        backAction={{ onClick: () => goBack('classes') }}
        action={{ label: 'Class List', icon: List, onClick: () => navigateTo('classes') }}
      />

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── Class Details Card ── */}
        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="border-b bg-muted/20 px-4 py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="size-4" />
              Class Details
            </CardTitle>
            <CardDescription className="text-xs">Enter the basic information for the new class</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-1.5">
              <Label htmlFor="class-name" className="text-xs font-medium">
                Class Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="class-name"
                placeholder="e.g., Class 1, Class 10, Nursery"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                onBlur={() => validateName(name)}
                disabled={submitting}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'class-name-error' : undefined}
              />
              {nameError && (
                <p id="class-name-error" className="text-xs text-destructive">
                  {nameError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Enter the class name (e.g., Class 1, Class 10, Nursery, LKG)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Sections Card ── */}
        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="border-b bg-muted/20 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="size-4" />
                  Sections
                  {namedSectionCount > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {namedSectionCount} section{namedSectionCount !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Add sections to organize students within this class (optional)
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={addSection}
                disabled={submitting}
              >
                <PlusCircle className="size-3.5" />
                Add Section
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2.5">
              {/* Section list header */}
              <div className="hidden sm:grid sm:grid-cols-[1fr_36px] gap-3 px-1">
                <span className="text-xs font-medium text-muted-foreground">Section Name</span>
                <span />
              </div>

              {/* Section rows */}
              {sections.map((section, index) => (
                <div
                  key={section.id}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_36px] gap-2 items-start p-2.5 rounded-lg border bg-background"
                >
                  <div className="space-y-1 sm:space-y-0">
                    <Label className="text-xs font-medium text-muted-foreground sm:hidden">
                      Section Name
                    </Label>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="shrink-0 text-xs h-6 w-6 flex items-center justify-center p-0 font-mono">
                        {index + 1}
                      </Badge>
                      <Input
                        placeholder="e.g., A, B, C"
                        value={section.name}
                        onChange={(e) => updateSection(section.id, e.target.value)}
                        className="h-9"
                        disabled={submitting}
                        maxLength={10}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end sm:pt-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removeSection(section.id)}
                      disabled={submitting}
                      title="Remove section"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Add section button — mobile-friendly */}
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 border-dashed"
                onClick={addSection}
                disabled={submitting}
              >
                <PlusCircle className="size-4" />
                Add Another Section
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Subject Assignment Card ── */}
        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="border-b bg-muted/20 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="size-4" />
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
          <CardContent className="p-4">
            {loadingSubjects ? (
              <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">Loading subjects...</span>
              </div>
            ) : subjectsByType.length === 0 ? (
              <div className="text-center py-6">
                <BookOpen className="size-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No subjects available</p>
                <p className="text-xs text-muted-foreground mt-1">Add subjects first, then assign them to classes.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {subjectsByType.map((group) => {
                  const allGroupSelected = group.subjects.every(s => selectedSubjectIds.has(s.id))
                  const someGroupSelected = group.subjects.some(s => selectedSubjectIds.has(s.id))

                  return (
                    <div key={group.value} className="space-y-1.5">
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {group.subjects.map((subject) => {
                          const isSelected = selectedSubjectIds.has(subject.id)
                          return (
                            <div
                              key={subject.id}
                              onClick={() => toggleSubject(subject.id)}
                              className={`
                                relative flex items-center gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-all duration-150
                                ${isSelected
                                  ? `${group.color} ${group.border} ring-1 ring-current/10`
                                  : 'hover:bg-muted/50 border-border'
                                }
                              `}
                            >
                              {/* Custom visual checkbox — no internal state, no Radix */}
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

                              {/* Subject Info */}
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${isSelected ? group.checkColor : ''}`}>
                                  {subject.name}
                                </p>
                                {subject.code && (
                                  <p className="text-[11px] text-muted-foreground font-mono">{subject.code}</p>
                                )}
                              </div>

                              {/* Selected indicator */}
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
                          const count = subjects.filter(
                            s => s.type === typeConfig.value && selectedSubjectIds.has(s.id)
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
        <div className="flex items-center gap-2 border-t pt-4">
          <Button
            type="submit"
            disabled={!isFormValid}
            className="gap-2 min-w-[130px]"
          >
            {submitting ? (
              <>
                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Creating...
              </>
            ) : (
              <>
                <GraduationCap className="size-4" />
                Create Class
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => goBack('classes')}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
