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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BookOpen, ArrowLeft, Loader2, GraduationCap } from 'lucide-react'

const SUBJECT_TYPES = [
  { value: 'primary', label: 'Primary' },
  { value: 'optional', label: 'Optional' },
  { value: 'extra', label: 'Extra' },
  { value: 'special', label: 'Special' },
] as const

interface ClassItem {
  id: string
  name: string | null
}

export function AddSubjectPage() {
  const { toast } = useToast()
  const navigateTo = useAppStore((s) => s.navigateTo)
  const goBack = useAppStore((s) => s.goBack)

  // Form state
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [sequenceNo, setSequenceNo] = useState('')
  const [type, setType] = useState('primary')
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([])

  // Classes data
  const [classes, setClasses] = useState<ClassItem[]>([])

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [nameError, setNameError] = useState('')

  // Fetch classes on mount
  useEffect(() => {
    api.get<{ classes: ClassItem[] }>('/api/school/classes')
      .then(res => setClasses(res.classes || []))
      .catch(() => {})
  }, [])

  // Validate the name field
  const validateName = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setNameError('Subject name is required. Please enter a name like Mathematics or English.')
      return false
    }
    if (trimmed.length < 2) {
      setNameError('Subject name must be at least 2 characters long.')
      return false
    }
    setNameError('')
    return true
  }

  // Handle name change with live validation
  const handleNameChange = (value: string) => {
    setName(value)
    if (nameError && value.trim().length >= 2) {
      setNameError('')
    }
  }

  // Toggle class selection
  const toggleClass = (classId: string) => {
    setSelectedClassIds(prev =>
      prev.includes(classId)
        ? prev.filter(id => id !== classId)
        : [...prev, classId]
    )
  }

  // Select / deselect all
  const toggleAllClasses = () => {
    if (selectedClassIds.length === classes.length) {
      setSelectedClassIds([])
    } else {
      setSelectedClassIds(classes.map(c => c.id))
    }
  }

  // Form validity check
  const isFormValid = name.trim().length >= 2 && !submitting

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateName(name)) return
    if (submitting) return

    try {
      setSubmitting(true)

      await api.post('/api/school/subjects', {
        name: name.trim(),
        code: code.trim() || undefined,
        sequenceNo: sequenceNo ? parseInt(sequenceNo, 10) : undefined,
        type,
        classIds: selectedClassIds.length > 0 ? selectedClassIds : undefined,
      })

      toast({
        title: 'Subject Added Successfully',
        description: `"${name.trim()}" has been added to your subjects list.`,
      })

      navigateTo('subjects')
    } catch (err) {
      toast({
        title: 'Failed to Add Subject',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          onClick={() => goBack('subjects')}
          disabled={submitting}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add Subject</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create a new subject for your school curriculum
          </p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="size-4" />
            Subject Details
          </CardTitle>
          <CardDescription>
            Fill in the details below to add a new subject
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Subject Information */}
            <div>
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <div className="size-1.5 rounded-full bg-primary" />
                Subject Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Subject Name */}
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
                    className="h-10"
                    aria-invalid={!!nameError}
                    aria-describedby={nameError ? 'subject-name-error' : undefined}
                  />
                  {nameError && (
                    <p id="subject-name-error" className="text-xs text-destructive mt-1">
                      {nameError}
                    </p>
                  )}
                </div>

                {/* Subject Code */}
                <div className="space-y-2">
                  <Label htmlFor="subject-code" className="text-xs font-medium">
                    Subject Code
                  </Label>
                  <Input
                    id="subject-code"
                    placeholder="e.g., MATH101"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Must be unique across your school. Duplicate names are allowed, but codes must be different.
                  </p>
                </div>

                {/* Sequence No */}
                <div className="space-y-2">
                  <Label htmlFor="sequence-no" className="text-xs font-medium">
                    Sequence No
                  </Label>
                  <Input
                    id="sequence-no"
                    type="number"
                    placeholder="e.g., 1"
                    value={sequenceNo}
                    onChange={(e) => setSequenceNo(e.target.value)}
                    min="0"
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Display order of the subject in lists
                  </p>
                </div>

                {/* Subject Type */}
                <div className="space-y-2">
                  <Label htmlFor="subject-type" className="text-xs font-medium">
                    Subject Type <span className="text-destructive">*</span>
                  </Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBJECT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose the category of this subject
                  </p>
                </div>


              </div>
            </div>

            {/* Class Assignment */}
            <div>
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <div className="size-1.5 rounded-full bg-primary" />
                <GraduationCap className="size-4" />
                Assign to Classes
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Select which classes this subject will be assigned to. You can also assign classes later.
                  </p>
                  {classes.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={toggleAllClasses}
                    >
                      {selectedClassIds.length === classes.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  )}
                </div>
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                  {classes.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No classes found. Please add classes first before assigning subjects.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {classes.map(cls => (
                        <label
                          key={cls.id}
                          className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors text-sm ${
                            selectedClassIds.includes(cls.id)
                              ? 'bg-primary/10 border-primary/30 text-primary'
                              : 'hover:bg-muted/50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedClassIds.includes(cls.id)}
                            onChange={() => toggleClass(cls.id)}
                            className="rounded border-input"
                          />
                          <span className="truncate">{cls.name || 'Unnamed'}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {selectedClassIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedClassIds.length} class{selectedClassIds.length !== 1 ? 'es' : ''} selected
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={!isFormValid}
                className="gap-2 min-w-[140px]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <BookOpen className="size-4" />
                    Add Subject
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => goBack('subjects')}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
