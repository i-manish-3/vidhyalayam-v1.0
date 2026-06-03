'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
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
import { BookOpen, List, Loader2, GraduationCap } from 'lucide-react'

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
  const router = useRouter()

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

      router.push('/academics/subjects')
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
    <div className="space-y-3">
      <PageHeader
        title="Add Subject"
        description="Create a new subject for your school curriculum."
        action={{ label: 'Subject List', icon: List, onClick: () => router.push('/academics/subjects') }}
      />

      {/* Form */}
      <Card className="gap-0 py-0 shadow-sm">
        <CardHeader className="border-b px-4 py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="bg-brand-soft flex size-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
              <BookOpen className="size-4" />
            </span>
            Subject Details
          </CardTitle>
          <CardDescription className="text-xs">
            Fill in the details below to add a new subject
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Subject Information */}
            <section className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2 border-b pb-2.5">
                <span aria-hidden className="bg-brand h-4 w-1 shrink-0 rounded-full" />
                <h3 className="text-sm font-semibold tracking-tight">Subject Information</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Subject Name */}
                <div className="space-y-1">
                  <Label htmlFor="subject-name" className="text-xs font-medium">
                    Subject Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="subject-name"
                    placeholder="e.g., Mathematics"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onBlur={() => validateName(name)}
                    className="h-9"
                    aria-invalid={!!nameError}
                    aria-describedby={nameError ? 'subject-name-error' : undefined}
                  />
                  {nameError && (
                    <p id="subject-name-error" className="text-xs text-destructive">
                      {nameError}
                    </p>
                  )}
                </div>

                {/* Subject Code */}
                <div className="space-y-1">
                  <Label htmlFor="subject-code" className="text-xs font-medium">
                    Subject Code
                  </Label>
                  <Input
                    id="subject-code"
                    placeholder="e.g., MATH101"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="h-9"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Must be unique. Duplicate names are allowed; codes must differ.
                  </p>
                </div>

                {/* Sequence No */}
                <div className="space-y-1">
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
                    className="h-9"
                  />
                  <p className="text-[11px] text-muted-foreground">Display order in lists</p>
                </div>

                {/* Subject Type */}
                <div className="space-y-1">
                  <Label htmlFor="subject-type" className="text-xs font-medium">
                    Subject Type <span className="text-destructive">*</span>
                  </Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="h-9">
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
                  <p className="text-[11px] text-muted-foreground">Category of this subject</p>
                </div>
              </div>
            </section>

            {/* Class Assignment */}
            <section className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center gap-2 border-b pb-2.5">
                <span aria-hidden className="bg-brand h-4 w-1 shrink-0 rounded-full" />
                <GraduationCap className="size-4 text-primary" />
                <h3 className="text-sm font-semibold tracking-tight">Assign to Classes</h3>
              </div>
              <div className="space-y-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    Select classes for this subject. You can also assign later.
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
                <div className="border rounded-lg p-2 max-h-44 overflow-y-auto">
                  {classes.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No classes found. Please add classes first before assigning subjects.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                      {classes.map(cls => (
                        <label
                          key={cls.id}
                          className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer transition-colors text-sm ${
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
                  <p className="text-[11px] text-muted-foreground">
                    {selectedClassIds.length} class{selectedClassIds.length !== 1 ? 'es' : ''} selected
                  </p>
                )}
              </div>
            </section>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 border-t pt-3">
              <Button
                type="submit"
                disabled={!isFormValid}
                className="gap-2 min-w-[130px]"
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
                onClick={() => router.push('/academics/subjects')}
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
