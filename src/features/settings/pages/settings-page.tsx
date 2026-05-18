'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { CalendarDays, Check, ImagePlus, Loader2, Palette, PlusCircle, Save, School, Trash2, Type, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore, type School as SchoolInfo } from '@/lib/store'
import { getCurrentAcademicYear, type AcademicYear } from '@/lib/academic-years'
import { DASHBOARD_FONT_OPTIONS, SCHOOL_THEME_PALETTES, findDashboardFont, findSchoolThemePalette } from '@/lib/theme-palettes'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SettingsPage() {
  const { toast } = useToast()
  const { currentSchool, setCurrentSchool, user } = useAppStore()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)
  const currentPalette = useMemo(
    () => findSchoolThemePalette(currentSchool?.primaryColor),
    [currentSchool?.primaryColor]
  )
  const [schoolName, setSchoolName] = useState(currentSchool?.name || '')
  const [schoolLogo, setSchoolLogo] = useState(currentSchool?.logo || '')
  const [schoolFavicon, setSchoolFavicon] = useState(currentSchool?.favicon || '')
  const [selectedColor, setSelectedColor] = useState(currentPalette.primary)
  const [selectedFont, setSelectedFont] = useState(findDashboardFont(currentSchool?.dashboardFont).id)
  const [saving, setSaving] = useState(false)
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [yearName, setYearName] = useState(getCurrentAcademicYear())
  const [yearStartDate, setYearStartDate] = useState('')
  const [yearEndDate, setYearEndDate] = useState('')
  const [yearIsCurrent, setYearIsCurrent] = useState(false)
  const [loadingYears, setLoadingYears] = useState(true)
  const [savingYear, setSavingYear] = useState(false)

  useEffect(() => {
    if (!currentSchool || saving) return

    setSchoolName(currentSchool.name || '')
    setSchoolLogo(currentSchool.logo || '')
    setSchoolFavicon(currentSchool.favicon || '')
    setSelectedColor(findSchoolThemePalette(currentSchool.primaryColor).primary)
    setSelectedFont(findDashboardFont(currentSchool.dashboardFont).id)
  }, [
    currentSchool?.dashboardFont,
    currentSchool?.favicon,
    currentSchool?.logo,
    currentSchool?.name,
    currentSchool?.primaryColor,
    saving,
  ])

  const selectedPalette = useMemo(
    () => findSchoolThemePalette(selectedColor),
    [selectedColor]
  )
  const selectedFontOption = useMemo(
    () => findDashboardFont(selectedFont),
    [selectedFont]
  )
  const currentAcademicYear = academicYears.find((year) => year.isCurrent)
  const hasChanges =
    schoolName.trim() !== (currentSchool?.name || '') ||
    schoolLogo !== (currentSchool?.logo || '') ||
    schoolFavicon !== (currentSchool?.favicon || '') ||
    selectedColor.toLowerCase() !== (currentSchool?.primaryColor || currentPalette.primary).toLowerCase() ||
    selectedFont !== findDashboardFont(currentSchool?.dashboardFont).id

  const readImageFile = (
    file: File | undefined,
    {
      title,
      maxSize,
      onLoad,
    }: {
      title: string
      maxSize: number
      onLoad: (value: string) => void
    }
  ) => {
    if (!file) return

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon']
    if (!validTypes.includes(file.type)) {
      toast({
        title: `Invalid ${title} Format`,
        description: 'Please upload a JPG, PNG, WebP, GIF, or ICO image.',
        variant: 'destructive',
      })
      return
    }

    if (file.size > maxSize) {
      toast({
        title: `${title} Too Large`,
        description: `The ${title.toLowerCase()} must be smaller than ${Math.round(maxSize / 1024 / 1024)}MB.`,
        variant: 'destructive',
      })
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => onLoad((event.target?.result as string) || '')
    reader.readAsDataURL(file)
  }

  const fetchAcademicYears = async () => {
    try {
      setLoadingYears(true)
      const res = await api.get<{ years: AcademicYear[] }>('/api/school/academic-years')
      setAcademicYears(res.years || [])
    } catch (err) {
      toast({
        title: "Couldn't Load Academic Years",
        description: err instanceof Error ? err.message : 'Please refresh and try again.',
        variant: 'destructive',
      })
    } finally {
      setLoadingYears(false)
    }
  }

  useEffect(() => {
    if (user?.role === 'SCHOOL_ADMIN') {
      fetchAcademicYears()
    }
  }, [user?.role])

  const createAcademicYear = async () => {
    if (!/^\d{4}-\d{4}$/.test(yearName.trim())) {
      toast({
        title: 'Invalid Academic Year',
        description: 'Use format like 2026-2027.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSavingYear(true)
      await api.post('/api/school/academic-years', {
        name: yearName.trim(),
        startDate: yearStartDate || null,
        endDate: yearEndDate || null,
        isCurrent: yearIsCurrent,
      })
      toast({ title: 'Academic Year Created', description: `${yearName.trim()} is now available for this school.` })
      if (yearIsCurrent && currentSchool) {
        setCurrentSchool({ ...currentSchool, academicYear: yearName.trim() })
      }
      setYearName('')
      setYearStartDate('')
      setYearEndDate('')
      setYearIsCurrent(false)
      fetchAcademicYears()
    } catch (err) {
      toast({
        title: "Couldn't Create Academic Year",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSavingYear(false)
    }
  }

  const updateAcademicYear = async (year: AcademicYear, data: Partial<Pick<AcademicYear, 'isActive' | 'isCurrent'>>) => {
    try {
      await api.patch(`/api/school/academic-years/${year.id}`, data)
      if (data.isCurrent && currentSchool) {
        setCurrentSchool({ ...currentSchool, academicYear: year.name })
      }
      toast({
        title: data.isCurrent ? 'Current Year Updated' : 'Academic Year Updated',
        description: data.isCurrent ? `${year.name} is now the current academic year.` : `${year.name} has been updated.`,
      })
      fetchAcademicYears()
    } catch (err) {
      toast({
        title: "Couldn't Update Academic Year",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const deleteAcademicYear = async (year: AcademicYear) => {
    try {
      await api.delete(`/api/school/academic-years/${year.id}`)
      toast({ title: 'Academic Year Removed', description: `${year.name} has been removed from active setup.` })
      fetchAcademicYears()
    } catch (err) {
      toast({
        title: "Couldn't Remove Academic Year",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const formatDate = (value: string | null) => {
    if (!value) return '-'
    return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const saveTheme = async () => {
    const trimmedName = schoolName.trim()
    if (!trimmedName) {
      toast({
        title: 'School Name Required',
        description: 'Please enter the school name shown in the menu bar.',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const res = await api.patch<{ school: SchoolInfo }>('/api/school/info', {
        name: trimmedName,
        logo: schoolLogo,
        favicon: schoolFavicon,
        primaryColor: selectedColor,
        dashboardFont: selectedFont,
      })
      setCurrentSchool(res.school)
      setSchoolName(res.school.name)
      setSchoolLogo(res.school.logo || '')
      setSchoolFavicon(res.school.favicon || '')
      toast({ title: 'Branding Updated', description: 'School name, logo, favicon, and dashboard theme have been applied.' })
    } catch (err) {
      toast({
        title: "Couldn't Update Branding",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (user?.role !== 'SCHOOL_ADMIN') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Palette className="mb-3 size-10 text-muted-foreground/50" />
          <h2 className="text-lg font-semibold">School settings are available for school admins.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Open a school account to manage its dashboard theme.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage school academic years, branding, and dashboard appearance.</p>
        </div>
        <Button onClick={saveTheme} disabled={!hasChanges || saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save Branding
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="size-5 text-primary" />
                Academic Years
              </CardTitle>
              <CardDescription>
                Create the school years used by admissions, fees, exams, attendance, transport, and reports.
              </CardDescription>
            </div>
            {currentAcademicYear && (
              <Badge className="self-start" variant="secondary">Current: {currentAcademicYear.name}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-[160px_160px_160px_auto_auto]">
            <div className="space-y-2">
              <Label htmlFor="academic-year-name">Academic Year</Label>
              <Input
                id="academic-year-name"
                value={yearName}
                onChange={(event) => setYearName(event.target.value)}
                placeholder="2026-2027"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="academic-year-start">Start Date</Label>
              <Input
                id="academic-year-start"
                type="date"
                value={yearStartDate}
                onChange={(event) => setYearStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="academic-year-end">End Date</Label>
              <Input
                id="academic-year-end"
                type="date"
                value={yearEndDate}
                onChange={(event) => setYearEndDate(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 pt-8 text-sm">
              <input
                type="checkbox"
                checked={yearIsCurrent}
                onChange={(event) => setYearIsCurrent(event.target.checked)}
                className="size-4"
              />
              Set current
            </label>
            <Button type="button" className="mt-0 gap-2 lg:mt-8" onClick={createAcademicYear} disabled={savingYear}>
              {savingYear ? <Loader2 className="size-4 animate-spin" /> : <PlusCircle className="size-4" />}
              Add Year
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <div className="grid grid-cols-[1fr_150px_150px_130px_170px] gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
              <span>Year</span>
              <span>Start</span>
              <span>End</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            {loadingYears ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading academic years...
              </div>
            ) : academicYears.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No academic years found. Add the first year to start using year-wise setup.
              </div>
            ) : (
              academicYears.map((year) => (
                <div key={year.id} className="grid grid-cols-[1fr_150px_150px_130px_170px] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-medium">{year.name}</span>
                    {year.isCurrent && <Badge>Current</Badge>}
                  </div>
                  <span className="text-muted-foreground">{formatDate(year.startDate)}</span>
                  <span className="text-muted-foreground">{formatDate(year.endDate)}</span>
                  <Badge variant={year.isActive ? 'secondary' : 'outline'}>{year.isActive ? 'Active' : 'Inactive'}</Badge>
                  <div className="flex justify-end gap-1.5">
                    {!year.isCurrent && (
                      <Button type="button" variant="outline" size="sm" onClick={() => updateAcademicYear(year, { isCurrent: true })}>
                        Set Current
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="icon" className="size-8" disabled={year.isCurrent} onClick={() => updateAcademicYear(year, { isActive: !year.isActive })}>
                      {year.isActive ? <X className="size-4" /> : <Check className="size-4" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      disabled={year.isCurrent}
                      onClick={() => deleteAcademicYear(year)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <School className="size-5 text-primary" />
            School Identity
          </CardTitle>
          <CardDescription>
            School name, logo, favicon, and browser title are used across school branding surfaces.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="school-name">School Name</Label>
              <Input
                id="school-name"
                value={schoolName}
                onChange={(event) => setSchoolName(event.target.value)}
                placeholder="Enter school name"
              />
            </div>

            <div className="space-y-2">
              <Label>School Logo</Label>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(event) => readImageFile(event.target.files?.[0], {
                  title: 'Logo',
                  maxSize: 2 * 1024 * 1024,
                  onLoad: setSchoolLogo,
                })}
              />
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                  {schoolLogo ? (
                    <img src={schoolLogo} alt="School logo preview" className="size-full object-cover" />
                  ) : (
                    <School className="size-7 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => logoInputRef.current?.click()}>
                    <ImagePlus className="size-4" />
                    {schoolLogo ? 'Change Logo' : 'Upload Logo'}
                  </Button>
                  {schoolLogo && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        setSchoolLogo('')
                        if (logoInputRef.current) logoInputRef.current.value = ''
                      }}
                    >
                      <X className="size-4" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Use a square JPG, PNG, WebP, GIF, or ICO image. Max 2MB.</p>
            </div>

            <div className="space-y-2">
              <Label>Browser Favicon</Label>
              <input
                ref={faviconInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/x-icon,image/vnd.microsoft.icon"
                className="hidden"
                onChange={(event) => readImageFile(event.target.files?.[0], {
                  title: 'Favicon',
                  maxSize: 512 * 1024,
                  onLoad: setSchoolFavicon,
                })}
              />
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex size-12 items-center justify-center overflow-hidden rounded-md border bg-muted">
                  {schoolFavicon ? (
                    <img src={schoolFavicon} alt="School favicon preview" className="size-full object-cover" />
                  ) : schoolLogo ? (
                    <img src={schoolLogo} alt="School logo fallback preview" className="size-full object-cover" />
                  ) : (
                    <School className="size-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => faviconInputRef.current?.click()}>
                    <ImagePlus className="size-4" />
                    {schoolFavicon ? 'Change Favicon' : 'Upload Favicon'}
                  </Button>
                  {schoolFavicon && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        setSchoolFavicon('')
                        if (faviconInputRef.current) faviconInputRef.current.value = ''
                      }}
                    >
                      <X className="size-4" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Use a small square PNG, ICO, WebP, JPG, or GIF image. Max 512KB.</p>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <p className="mb-3 text-xs font-medium uppercase text-muted-foreground">Menu Preview</p>
            <div className="flex items-center gap-2.5 rounded-lg border bg-sidebar p-3 text-sidebar-foreground">
              <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                {schoolLogo ? (
                  <img src={schoolLogo} alt="" className="size-full object-cover" />
                ) : (
                  <School className="size-4" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{schoolName.trim() || 'School Name'}</p>
                <p className="truncate text-[10px] text-sidebar-foreground/60">{currentSchool?.subdomain || 'school'} dashboard</p>
              </div>
            </div>
            <div className="mt-4 border-t pt-4">
              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Browser Preview</p>
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                <div className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                  {schoolFavicon ? (
                    <img src={schoolFavicon} alt="" className="size-full object-cover" />
                  ) : schoolLogo ? (
                    <img src={schoolLogo} alt="" className="size-full object-cover" />
                  ) : (
                    <School className="size-3 text-muted-foreground" />
                  )}
                </div>
                <span className="truncate text-xs font-medium">{schoolName.trim() || 'School Name'} Dashboard</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Palette className="size-5 text-primary" />
                School Color Palette
              </CardTitle>
              <CardDescription>
                Selected palette and font apply to the logged-in school dashboard, top bar, menu bar, buttons, focus rings, and charts.
              </CardDescription>
            </div>
            <Badge variant="secondary">{selectedPalette.name}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SCHOOL_THEME_PALETTES.map((palette) => {
              const isSelected = selectedColor.toLowerCase() === palette.primary.toLowerCase()
              return (
                <button
                  key={palette.id}
                  type="button"
                  onClick={() => setSelectedColor(palette.primary)}
                  className={cn(
                    'rounded-lg border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/60 hover:shadow-md',
                    isSelected && 'border-primary ring-2 ring-primary/25'
                  )}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="size-8 rounded-full border shadow-inner" style={{ backgroundColor: palette.primary }} />
                      <span className="font-semibold">{palette.name}</span>
                    </div>
                    {isSelected && (
                      <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-4" />
                      </span>
                    )}
                  </div>
                  <div className="flex overflow-hidden rounded-md border">
                    {palette.chart.map((color) => (
                      <span key={color} className="h-8 flex-1" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Type className="size-4 text-primary" />
                  Dashboard Font
                </h3>
                <p className="text-xs text-muted-foreground">Choose the font style used across the admin dashboard.</p>
              </div>
              <Badge variant="outline">{selectedFontOption.name}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {DASHBOARD_FONT_OPTIONS.map((font) => {
                const isSelected = selectedFont === font.id
                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => setSelectedFont(font.id)}
                    className={cn(
                      'rounded-lg border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/60 hover:shadow-md',
                      isSelected && 'border-primary ring-2 ring-primary/25'
                    )}
                    style={{ fontFamily: font.stack }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-base font-semibold">{font.name}</span>
                      {isSelected && (
                        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-4" />
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{font.description}</p>
                    <p className="mt-3 text-lg font-bold tracking-tight">Academic Dashboard</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div
              className="rounded-lg border p-4"
              style={{
                '--preview-primary': selectedPalette.primary,
                '--preview-foreground': selectedPalette.foreground,
                '--preview-accent': selectedPalette.sidebarAccent,
                fontFamily: selectedFontOption.stack,
              } as CSSProperties}
            >
              <div className="mb-4 flex items-center justify-between rounded-md px-4 py-3 text-sm font-medium" style={{ backgroundColor: 'var(--preview-primary)', color: 'var(--preview-foreground)' }}>
                <span>{currentSchool?.name || 'School Dashboard'}</span>
                <span className="rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}>Admin</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {['Students', 'Fees', 'Attendance'].map((label, index) => (
                  <div key={label} className="rounded-md border bg-background p-3">
                    <div className="mb-3 size-8 rounded-md" style={{ backgroundColor: index === 0 ? 'var(--preview-primary)' : 'var(--preview-accent)' }} />
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-xs text-muted-foreground">Dashboard module</p>
                  </div>
                ))}
              </div>
            </div>

            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <School className="size-5" />
                </div>
                <p className="text-sm font-semibold">{currentSchool?.name || 'Current School'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{currentSchool?.subdomain || 'school'} dashboard theme</p>
                <div className="mt-4 flex items-center gap-2 text-xs">
                  <span className="size-4 rounded-full border" style={{ backgroundColor: selectedColor }} />
                  <span className="font-mono">{selectedColor}</span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <Type className="size-4 text-muted-foreground" />
                  <span>{selectedFontOption.name}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
