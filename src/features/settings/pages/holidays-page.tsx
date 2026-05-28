'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, CalendarRange, Loader2, Pencil, PlusCircle, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/date-picker'
import { EmptyState } from '@/components/shared'

type Holiday = {
  id: string
  name: string
  type: string
  date: string
  endDate: string | null
  description: string | null
  academicYear: string
}

type HolidayForm = {
  name: string
  type: string
  date: string
  endDate: string
  description: string
  academicYear: string
}

const EMPTY_FORM: HolidayForm = { name: '', type: 'school', date: '', endDate: '', description: '', academicYear: '' }

const TYPE_LABELS: Record<string, string> = { public: 'Public Holiday', school: 'School Holiday', vacation: 'Vacation' }
const TYPE_COLORS: Record<string, 'default' | 'secondary' | 'outline'> = { public: 'default', school: 'secondary', vacation: 'outline' }

const ALL_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DEFAULT_SCHOOLING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function HolidaysPage() {
  const { user, currentSchool, setCurrentSchool } = useAppStore()
  const { toast } = useToast()
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [academicYear, setAcademicYear] = useState('')
  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Holiday | null>(null)
  const [form, setForm] = useState<HolidayForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [schoolingDialogOpen, setSchoolingDialogOpen] = useState(false)
  const [schoolingDays, setSchoolingDays] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(currentSchool?.workingDays || '[]')
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SCHOOLING_DAYS
    } catch {
      return DEFAULT_SCHOOLING_DAYS
    }
  })
  const [schoolingSaving, setSchoolingSaving] = useState(false)

  useEffect(() => {
    api.get<{ academicYears: string[] }>('/api/school/academic-years').then((res) => {
      const years = res.academicYears ?? []
      setAcademicYears(years)
      if (years.length > 0) setAcademicYear(years[0])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!academicYear) return
    setLoading(true)
    api.get<{ holidays: Holiday[] }>(`/api/school/holidays?academicYear=${academicYear}`)
      .then((res) => setHolidays(res.holidays ?? []))
      .catch(() => toast({ title: 'Failed to load holidays', variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [academicYear, toast])

  function openAdd() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, academicYear })
    setDialogOpen(true)
  }

  function openEdit(h: Holiday) {
    setEditing(h)
    setForm({
      name: h.name,
      type: h.type,
      date: h.date.slice(0, 10),
      endDate: h.endDate ? h.endDate.slice(0, 10) : '',
      description: h.description ?? '',
      academicYear: h.academicYear,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.date) {
      toast({ title: 'Name and date are required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        date: form.date,
        endDate: form.endDate || null,
        description: form.description.trim() || null,
        academicYear: form.academicYear || academicYear,
      }
      if (editing) {
        const res = await api.patch<{ holiday: Holiday }>(`/api/school/holidays/${editing.id}`, payload)
        setHolidays((prev) => prev.map((h) => (h.id === editing.id ? res.holiday : h)))
        toast({ title: 'Holiday updated' })
      } else {
        const res = await api.post<{ holiday: Holiday }>('/api/school/holidays', payload)
        setHolidays((prev) => [...prev, res.holiday].sort((a, b) => a.date.localeCompare(b.date)))
        toast({ title: 'Holiday added' })
      }
      setDialogOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save holiday'
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await api.delete(`/api/school/holidays/${id}`)
      setHolidays((prev) => prev.filter((h) => h.id !== id))
      toast({ title: 'Holiday deleted' })
    } catch {
      toast({ title: 'Failed to delete holiday', variant: 'destructive' })
    } finally {
      setDeleting(null)
    }
  }

  function openSchoolingDialog() {
    try {
      const parsed = JSON.parse(currentSchool?.workingDays || '[]')
      setSchoolingDays(Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SCHOOLING_DAYS)
    } catch {
      setSchoolingDays(DEFAULT_SCHOOLING_DAYS)
    }
    setSchoolingDialogOpen(true)
  }

  async function saveSchoolingDays() {
    if (schoolingDays.length === 0) {
      toast({ title: 'Please select at least one school day.', variant: 'destructive' })
      return
    }
    setSchoolingSaving(true)
    try {
      const res = await api.patch<{ school: typeof currentSchool }>('/api/school/info', { workingDays: schoolingDays })
      if (res.school) setCurrentSchool(res.school)
      toast({ title: 'School days updated' })
      setSchoolingDialogOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save'
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setSchoolingSaving(false)
    }
  }

  const isAdmin = user?.role === 'SCHOOL_ADMIN'

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Academic Calendar</CardTitle>
            <CardDescription>Manage holidays and vacation periods for each academic year.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={academicYear} onValueChange={setAcademicYear}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Button onClick={openSchoolingDialog} size="sm" variant="outline">
                <CalendarRange className="mr-2 size-4" />
                School Days
              </Button>
            )}
            {isAdmin && (
              <Button onClick={openAdd} size="sm">
                <PlusCircle className="mr-2 size-4" />
                Add Holiday
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : holidays.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No holidays added" description={`No holidays configured for ${academicYear}.`} />
          ) : (
            <div className="space-y-2">
              {holidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{h.name}</p>
                      <Badge variant={TYPE_COLORS[h.type] ?? 'outline'}>{TYPE_LABELS[h.type] ?? h.type}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(h.date)}
                      {h.endDate && h.endDate !== h.date ? ` – ${formatDate(h.endDate)}` : ''}
                      {h.description ? ` · ${h.description}` : ''}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(h)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => handleDelete(h.id)} disabled={deleting === h.id}>
                        {deleting === h.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Holiday' : 'Add Holiday'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input placeholder="e.g. Diwali" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public Holiday</SelectItem>
                  <SelectItem value="school">School Holiday</SelectItem>
                  <SelectItem value="vacation">Vacation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <DatePicker value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date <span className="text-muted-foreground">(optional)</span></Label>
                <DatePicker value={form.endDate} onChange={(v) => setForm((f) => ({ ...f, endDate: v }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
              <Input placeholder="Short note" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Add Holiday'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={schoolingDialogOpen} onOpenChange={setSchoolingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>School Days</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Choose the days school is open. Attendance and timetable follow this schedule; unselected days appear as weekly off.
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_WEEKDAYS.map((day) => {
                const active = schoolingDays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSchoolingDays((prev) => active ? prev.filter((d) => d !== day) : [...prev, day])}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/50'}`}
                  >
                    {day.slice(0, 3)}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {schoolingDays.length === 0
                ? 'No days selected.'
                : `${schoolingDays.length} school day${schoolingDays.length === 1 ? '' : 's'}: ${schoolingDays.join(', ')}`}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchoolingDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveSchoolingDays} disabled={schoolingSaving}>
              {schoolingSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
