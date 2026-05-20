'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowLeft, Check, ImagePlus, Loader2, Palette, Save, School, Type, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore, type School as SchoolInfo } from '@/lib/store'
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
  const { currentSchool, setCurrentSchool, user, goBack } = useAppStore()
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
        <div className="flex min-w-0 items-start gap-3">
          <Button type="button" variant="outline" size="icon" className="mt-0.5 size-9 shrink-0" onClick={() => goBack('dashboard')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">Manage school branding and dashboard appearance.</p>
          </div>
        </div>
        <Button onClick={saveTheme} disabled={!hasChanges || saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save Branding
        </Button>
      </div>

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
              <Input id="school-name" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} placeholder="Enter school name" />
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
                  {schoolLogo ? <img src={schoolLogo} alt="School logo preview" className="size-full object-cover" /> : <School className="size-7 text-muted-foreground" />}
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
                {schoolLogo ? <img src={schoolLogo} alt="" className="size-full object-cover" /> : <School className="size-4" />}
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
