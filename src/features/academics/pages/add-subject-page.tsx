'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BookOpen, List, Loader2, GraduationCap, Hash, ListOrdered, Shapes, CheckCircle2 } from 'lucide-react'

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
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMISSIONS.SUBJECT_CREATE)

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
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15">
        <div aria-hidden className="absolute -right-9 -top-14 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute -bottom-14 right-1/4 size-28 rounded-full bg-violet-300/10 blur-xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
              <BookOpen className="size-5 text-white" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Add Subject</h1>
              <p className="mt-0.5 text-xs text-white/80">Create a subject and connect it with the right classes.</p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => router.push('/academics/subjects')}
            className="relative gap-2 border border-white/60 shadow-md"
            style={{ backgroundColor: 'white', color: 'var(--primary)' }}
          >
            <List className="size-4" /> Subject List
          </Button>
        </div>
      </section>

      {/* Form */}
      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50/60 via-card to-violet-50/60 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10">
        <CardHeader className="gap-1 border-b border-sky-200/70 bg-gradient-to-r from-sky-100/70 via-white/90 to-violet-100/60 px-4 py-3 !pb-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
          <CardTitle className="text-sm flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
              <BookOpen className="size-4 text-white" />
            </span>
            <span>Subject Setup</span>
            {selectedClassIds.length > 0 && (
              <span className="ml-auto rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300">
                {selectedClassIds.length} classes selected
              </span>
            )}
          </CardTitle>
          <CardDescription className="text-xs">
            Fill in the details below to add a new subject
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Subject Information */}
            <section className="space-y-3 rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-3.5 shadow-sm dark:border-violet-500/25 dark:from-violet-500/12 dark:via-card dark:to-sky-500/10">
              <div className="flex items-center gap-2 border-b border-violet-200/70 pb-2.5 dark:border-violet-500/20">
                <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
                  <BookOpen className="size-3.5 text-white" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">Subject Information</h3>
                  <p className="text-[10px] text-muted-foreground">Name, code, order, and curriculum type</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Subject Name */}
                <div className="space-y-1">
                  <Label htmlFor="subject-name" className="flex items-center gap-1.5 text-xs font-medium">
                    <BookOpen className="size-3 text-violet-600 dark:text-violet-300" /> Subject Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="subject-name"
                    placeholder="e.g., Mathematics"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onBlur={() => validateName(name)}
                    className="h-9 border-violet-200 bg-white shadow-sm focus-visible:border-violet-400 focus-visible:ring-violet-400/20 dark:border-violet-500/25 dark:bg-input/30"
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
                  <Label htmlFor="subject-code" className="flex items-center gap-1.5 text-xs font-medium">
                    <Hash className="size-3 text-sky-600 dark:text-sky-300" /> Subject Code
                  </Label>
                  <Input
                    id="subject-code"
                    placeholder="e.g., MATH101"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="h-9 border-sky-200 bg-white font-mono shadow-sm focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-input/30"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Must be unique. Duplicate names are allowed; codes must differ.
                  </p>
                </div>

                {/* Sequence No */}
                <div className="space-y-1">
                  <Label htmlFor="sequence-no" className="flex items-center gap-1.5 text-xs font-medium">
                    <ListOrdered className="size-3 text-amber-600 dark:text-amber-300" /> Sequence No
                  </Label>
                  <Input
                    id="sequence-no"
                    type="number"
                    placeholder="e.g., 1"
                    value={sequenceNo}
                    onChange={(e) => setSequenceNo(e.target.value)}
                    min="0"
                    className="h-9 border-amber-200 bg-white shadow-sm focus-visible:border-amber-400 focus-visible:ring-amber-400/20 dark:border-amber-500/25 dark:bg-input/30"
                  />
                  <p className="text-[11px] text-muted-foreground">Display order in lists</p>
                </div>

                {/* Subject Type */}
                <div className="space-y-1">
                  <Label htmlFor="subject-type" className="flex items-center gap-1.5 text-xs font-medium">
                    <Shapes className="size-3 text-emerald-600 dark:text-emerald-300" /> Subject Type <span className="text-destructive">*</span>
                  </Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger
                      leadingIcon={<Shapes className="size-3.5 text-white" />}
                      leadingIconClassName="from-emerald-500 to-teal-600"
                      className="h-9 w-full border-emerald-200 bg-white focus:border-emerald-400 focus:ring-emerald-400/20 dark:border-emerald-500/25 dark:bg-input/30"
                    >
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
            <section className="space-y-3 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-3.5 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-cyan-500/10">
              <div className="flex items-center gap-2 border-b border-emerald-200/70 pb-2.5 dark:border-emerald-500/20">
                <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 text-white shadow-sm">
                  <GraduationCap className="size-3.5 text-white" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">Assign to Classes</h3>
                  <p className="text-[10px] text-muted-foreground">Choose where this subject will be available</p>
                </div>
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
                      className="h-7 border border-emerald-200 bg-white px-2 text-[11px] text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/25 dark:bg-input/30 dark:text-emerald-300"
                      onClick={toggleAllClasses}
                    >
                      {selectedClassIds.length === classes.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  )}
                </div>
                <div className="themed-scrollbar max-h-48 overflow-y-auto rounded-lg border border-emerald-200/70 bg-white/70 p-2 shadow-inner dark:border-emerald-500/20 dark:bg-background/40">
                  {classes.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No classes found. Please add classes first before assigning subjects.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                      {classes.map(cls => (
                        <label
                          key={cls.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-sm shadow-sm transition-all hover:-translate-y-px hover:shadow-md focus-within:ring-2 focus-within:ring-primary/30 ${
                            selectedClassIds.includes(cls.id)
                              ? 'border-cyan-300 bg-gradient-to-r from-cyan-50 to-emerald-50 font-semibold text-cyan-800 dark:border-cyan-500/35 dark:from-cyan-500/15 dark:to-emerald-500/10 dark:text-cyan-300'
                              : 'border-border/70 bg-white hover:border-emerald-200 hover:bg-emerald-50/60 dark:bg-input/20 dark:hover:border-emerald-500/25 dark:hover:bg-emerald-500/5'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedClassIds.includes(cls.id)}
                            onChange={() => toggleClass(cls.id)}
                            className="sr-only"
                          />
                          <span className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-md text-white shadow-sm',
                            selectedClassIds.includes(cls.id)
                              ? 'bg-gradient-to-br from-cyan-500 to-emerald-600'
                              : 'bg-gradient-to-br from-slate-400 to-slate-500',
                          )}>
                            {selectedClassIds.includes(cls.id)
                              ? <CheckCircle2 className="size-3.5 text-white" />
                              : <GraduationCap className="size-3.5 text-white" />}
                          </span>
                          <span className="truncate">{cls.name || 'Unnamed'}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {selectedClassIds.length > 0 && (
                  <Badge className="h-5 border border-cyan-200 bg-cyan-50 px-2 text-[10px] text-cyan-700 hover:bg-cyan-50 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-300">
                    <CheckCircle2 className="mr-1 size-3" />
                    {selectedClassIds.length} class{selectedClassIds.length !== 1 ? 'es' : ''} selected
                  </Badge>
                )}
              </div>
            </section>

            {/* Action Buttons */}
            <div className="flex flex-col-reverse gap-2 rounded-xl border border-primary/10 bg-gradient-to-r from-muted/40 via-white to-primary/5 p-3 sm:flex-row sm:items-center dark:via-card">
              <Button
                type="submit"
                disabled={!isFormValid || !canCreate}
                className="h-9 min-w-[140px] gap-2 shadow-sm"
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
                className="h-9 px-4"
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
