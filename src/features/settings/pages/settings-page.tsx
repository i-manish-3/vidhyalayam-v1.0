'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowLeft, Banknote, CalendarCheck, Check, Hash, ImagePlus, Loader2, Palette, Save, School, Sparkles, Type, Users, X } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'

type AdmissionSettings = {
  admissionNumberPrefix: string
  admissionNumberFormat: string
  sequenceStart: number
  sequenceDigits: number
  resetSequenceYearly: boolean
  registrationNumberPrefix: string
  registrationNumberFormat: string
  registrationSequenceStart: number
  registrationSequenceDigits: number
  registrationResetYearly: boolean
}

const DEFAULT_ADMISSION_SETTINGS: AdmissionSettings = {
  admissionNumberPrefix: 'STD',
  admissionNumberFormat: '{PREFIX}-{YEAR}-{SEQ}',
  sequenceStart: 1,
  sequenceDigits: 3,
  resetSequenceYearly: true,
  registrationNumberPrefix: 'REG',
  registrationNumberFormat: '{PREFIX}-{YEAR}-{SEQ}',
  registrationSequenceStart: 1,
  registrationSequenceDigits: 3,
  registrationResetYearly: true,
}

export function SettingsPage() {
  const { toast } = useToast()
  const { currentSchool, setCurrentSchool, user, goBack } = useAppStore()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)
  const printHeaderInputRef = useRef<HTMLInputElement>(null)
  const currentPalette = useMemo(
    () => findSchoolThemePalette(currentSchool?.primaryColor),
    [currentSchool?.primaryColor]
  )
  const [schoolName, setSchoolName] = useState(currentSchool?.name || '')
  const [schoolLogo, setSchoolLogo] = useState(currentSchool?.logo || '')
  const [schoolFavicon, setSchoolFavicon] = useState(currentSchool?.favicon || '')
  const [schoolPrintHeader, setSchoolPrintHeader] = useState(currentSchool?.printHeader || '')
  const [selectedColor, setSelectedColor] = useState(currentPalette.primary)
  const [selectedFont, setSelectedFont] = useState(findDashboardFont(currentSchool?.dashboardFont).id)
  const [saving, setSaving] = useState(false)
  const [admissionSettings, setAdmissionSettings] = useState<AdmissionSettings>(DEFAULT_ADMISSION_SETTINGS)
  const [admissionSamples, setAdmissionSamples] = useState({ admissionNumber: 'STD-2026-001', registrationNumber: 'REG-2026-001' })
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)

  useEffect(() => {
    if (!currentSchool || saving) return

    setSchoolName(currentSchool.name || '')
    setSchoolLogo(currentSchool.logo || '')
    setSchoolFavicon(currentSchool.favicon || '')
    setSchoolPrintHeader(currentSchool.printHeader || '')
    setSelectedColor(findSchoolThemePalette(currentSchool.primaryColor).primary)
    setSelectedFont(findDashboardFont(currentSchool.dashboardFont).id)
  }, [
    currentSchool?.dashboardFont,
    currentSchool?.favicon,
    currentSchool?.logo,
    currentSchool?.printHeader,
    currentSchool?.name,
    currentSchool?.primaryColor,
    saving,
  ])

  useEffect(() => {
    if (user?.role !== 'SCHOOL_ADMIN') return

    let mounted = true
    const loadSettings = async () => {
      setSettingsLoading(true)
      try {
        const data = await api.get<{ settings: AdmissionSettings; samples: typeof admissionSamples }>('/api/school/admission-settings', undefined, { skipLogoutOn401: true })
        if (!mounted) return
        setAdmissionSettings({ ...DEFAULT_ADMISSION_SETTINGS, ...data.settings })
        setAdmissionSamples(data.samples || admissionSamples)
      } catch (err) {
        if (mounted) {
          toast({
            title: "Couldn't Load Admission Settings",
            description: err instanceof Error ? err.message : 'Please try again.',
            variant: 'destructive',
          })
        }
      } finally {
        if (mounted) setSettingsLoading(false)
      }
    }

    loadSettings()
    return () => {
      mounted = false
    }
  }, [user?.role])

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
    schoolPrintHeader !== (currentSchool?.printHeader || '') ||
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
        printHeader: schoolPrintHeader,
        primaryColor: selectedColor,
        dashboardFont: selectedFont,
      })
      setCurrentSchool(res.school)
      setSchoolName(res.school.name)
      setSchoolLogo(res.school.logo || '')
      setSchoolFavicon(res.school.favicon || '')
      setSchoolPrintHeader(res.school.printHeader || '')
      toast({ title: 'Branding Updated', description: 'School name, logo, favicon, print header, and dashboard theme have been applied.' })
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

  const updateAdmissionSetting = <K extends keyof AdmissionSettings>(key: K, value: AdmissionSettings[K]) => {
    setAdmissionSettings((prev) => ({ ...prev, [key]: value }))
  }

  const saveAdmissionSettings = async () => {
    setSettingsSaving(true)
    try {
      const data = await api.patch<{ settings: AdmissionSettings; samples: typeof admissionSamples }>('/api/school/admission-settings', admissionSettings)
      setAdmissionSettings({ ...DEFAULT_ADMISSION_SETTINGS, ...data.settings })
      setAdmissionSamples(data.samples || admissionSamples)
      toast({ title: 'Number Formats Updated', description: 'New admissions will continue with these serial number formats.' })
    } catch (err) {
      toast({
        title: "Couldn't Save Number Formats",
        description: err instanceof Error ? err.message : 'Please check the format and try again.',
        variant: 'destructive',
      })
    } finally {
      setSettingsSaving(false)
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
    <div className="space-y-4">
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

      <Card className="gap-3 py-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <School className="size-5 text-primary" />
            School Identity
          </CardTitle>
          <CardDescription>
            School name, logo, favicon, and browser title are used across school branding surfaces.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="school-name">School Name</Label>
            <Input id="school-name" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} placeholder="Enter school name" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">School Logo</Label>
                <Badge variant="outline" className="text-[10px]">Max 2MB</Badge>
              </div>
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
              <div className="flex items-center gap-3">
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                  {schoolLogo ? <img src={schoolLogo} alt="School logo preview" className="size-full object-cover" /> : <School className="size-6 text-muted-foreground" />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-8 w-full justify-start" onClick={() => logoInputRef.current?.click()}>
                    <ImagePlus className="size-3.5" />
                    {schoolLogo ? 'Change Logo' : 'Upload Logo'}
                  </Button>
                  {schoolLogo && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-full justify-start text-destructive hover:text-destructive"
                      onClick={() => {
                        setSchoolLogo('')
                        if (logoInputRef.current) logoInputRef.current.value = ''
                      }}
                    >
                      <X className="size-3.5" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Square JPG, PNG, WebP, or GIF.</p>
            </div>

            <div className="rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Browser Favicon</Label>
                <Badge variant="outline" className="text-[10px]">Max 512KB</Badge>
              </div>
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
              <div className="flex items-center gap-3">
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                  {schoolFavicon ? (
                    <img src={schoolFavicon} alt="School favicon preview" className="size-full object-cover" />
                  ) : schoolLogo ? (
                    <img src={schoolLogo} alt="School logo fallback preview" className="size-full object-cover" />
                  ) : (
                    <School className="size-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-8 w-full justify-start" onClick={() => faviconInputRef.current?.click()}>
                    <ImagePlus className="size-3.5" />
                    {schoolFavicon ? 'Change Favicon' : 'Upload Favicon'}
                  </Button>
                  {schoolFavicon && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-full justify-start text-destructive hover:text-destructive"
                      onClick={() => {
                        setSchoolFavicon('')
                        if (faviconInputRef.current) faviconInputRef.current.value = ''
                      }}
                    >
                      <X className="size-3.5" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Small square PNG, ICO, WebP, JPG, or GIF.</p>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Print Header Banner</Label>
              <Badge variant="outline" className="text-[10px]">Max 3MB</Badge>
            </div>
            <input
              ref={printHeaderInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(event) => readImageFile(event.target.files?.[0], {
                title: 'Print Header',
                maxSize: 3 * 1024 * 1024,
                onLoad: setSchoolPrintHeader,
              })}
            />
            <div className="flex flex-col gap-3">
              <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded-lg border bg-muted">
                {schoolPrintHeader ? (
                  <img src={schoolPrintHeader} alt="Print header banner preview" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <ImagePlus className="size-6" />
                    <span className="text-[11px]">No banner uploaded yet</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 flex-1 justify-center" onClick={() => printHeaderInputRef.current?.click()}>
                  <ImagePlus className="size-3.5" />
                  {schoolPrintHeader ? 'Change Banner' : 'Upload Banner'}
                </Button>
                {schoolPrintHeader && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 justify-center text-destructive hover:text-destructive"
                    onClick={() => {
                      setSchoolPrintHeader('')
                      if (printHeaderInputRef.current) printHeaderInputRef.current.value = ''
                    }}
                  >
                    <X className="size-3.5" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Used as the header on printed admission forms, fee receipts, and other school documents.
              Recommended size: <strong>1200 × 280 px</strong> horizontal banner. JPG, PNG, WebP, or GIF.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="size-4 text-primary" />
                  Identity Preview
                </h3>
                <p className="text-xs text-muted-foreground">See how your school name, logo, and favicon appear in the app.</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="overflow-hidden rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sidebar</p>
                <div className="flex items-center gap-2.5 rounded-md border bg-sidebar p-2.5 text-sidebar-foreground">
                  <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                    {schoolLogo ? <img src={schoolLogo} alt="" className="size-full object-cover" /> : <School className="size-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold">{schoolName.trim() || 'School Name'}</p>
                    <p className="truncate text-[10px] text-sidebar-foreground/60">{currentSchool?.subdomain || 'school'} dashboard</p>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Browser Tab</p>
                <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2">
                  <div className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                    {schoolFavicon ? (
                      <img src={schoolFavicon} alt="" className="size-full object-cover" />
                    ) : schoolLogo ? (
                      <img src={schoolLogo} alt="" className="size-full object-cover" />
                    ) : (
                      <School className="size-2.5 text-muted-foreground" />
                    )}
                  </div>
                  <span className="truncate text-xs font-medium">{schoolName.trim() || 'School Name'} Dashboard</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Hash className="size-5 text-primary" />
                Admission Numbering
              </CardTitle>
              <CardDescription>
                Configure admission and registration number prefixes, formats, and serial sequence for this school.
              </CardDescription>
            </div>
            <Button onClick={saveAdmissionSettings} disabled={settingsLoading || settingsSaving}>
              {settingsSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Formats
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Admission Number</h3>
                  <p className="text-xs text-muted-foreground">Used as the student's main admission number.</p>
                </div>
                <Badge variant="outline" className="font-mono">{admissionSamples.admissionNumber}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Prefix</Label>
                  <Input
                    value={admissionSettings.admissionNumberPrefix}
                    onChange={(event) => updateAdmissionSetting('admissionNumberPrefix', event.target.value.toUpperCase())}
                    placeholder="STD"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Input
                    value={admissionSettings.admissionNumberFormat}
                    onChange={(event) => updateAdmissionSetting('admissionNumberFormat', event.target.value.toUpperCase())}
                    placeholder="{PREFIX}-{YEAR}-{SEQ}"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Start From</Label>
                  <Input
                    type="number"
                    min={1}
                    value={admissionSettings.sequenceStart}
                    onChange={(event) => updateAdmissionSetting('sequenceStart', Number(event.target.value) || 1)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Serial Digits</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={admissionSettings.sequenceDigits}
                    onChange={(event) => updateAdmissionSetting('sequenceDigits', Number(event.target.value) || 3)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                <Label htmlFor="reset-admission-number" className="text-sm">Reset serial every year</Label>
                <Switch
                  id="reset-admission-number"
                  checked={admissionSettings.resetSequenceYearly}
                  onCheckedChange={(checked) => updateAdmissionSetting('resetSequenceYearly', checked)}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Registration Number</h3>
                  <p className="text-xs text-muted-foreground">Generated automatically when the form is submitted.</p>
                </div>
                <Badge variant="outline" className="font-mono">{admissionSamples.registrationNumber}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Prefix</Label>
                  <Input
                    value={admissionSettings.registrationNumberPrefix}
                    onChange={(event) => updateAdmissionSetting('registrationNumberPrefix', event.target.value.toUpperCase())}
                    placeholder="REG"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Input
                    value={admissionSettings.registrationNumberFormat}
                    onChange={(event) => updateAdmissionSetting('registrationNumberFormat', event.target.value.toUpperCase())}
                    placeholder="{PREFIX}-{YEAR}-{SEQ}"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Start From</Label>
                  <Input
                    type="number"
                    min={1}
                    value={admissionSettings.registrationSequenceStart}
                    onChange={(event) => updateAdmissionSetting('registrationSequenceStart', Number(event.target.value) || 1)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Serial Digits</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={admissionSettings.registrationSequenceDigits}
                    onChange={(event) => updateAdmissionSetting('registrationSequenceDigits', Number(event.target.value) || 3)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                <Label htmlFor="reset-registration-number" className="text-sm">Reset serial every year</Label>
                <Switch
                  id="reset-registration-number"
                  checked={admissionSettings.registrationResetYearly}
                  onCheckedChange={(checked) => updateAdmissionSetting('registrationResetYearly', checked)}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Available tokens: <span className="font-mono">{'{PREFIX}'}</span>, <span className="font-mono">{'{YEAR}'}</span>, <span className="font-mono">{'{YY}'}</span>, <span className="font-mono">{'{SEQ}'}</span>, <span className="font-mono">{'{CLASS}'}</span>. The serial continues from existing admission records.
          </p>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
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
        <CardContent className="space-y-4">
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {SCHOOL_THEME_PALETTES.map((palette) => {
              const isSelected = selectedColor.toLowerCase() === palette.primary.toLowerCase()
              return (
                <button
                  key={palette.id}
                  type="button"
                  onClick={() => setSelectedColor(palette.primary)}
                  title={palette.name}
                  className={cn(
                    'group relative flex flex-col gap-1.5 overflow-hidden rounded-md border bg-card p-2 text-left shadow-sm transition-all hover:border-primary/60 hover:shadow-md',
                    isSelected && 'border-primary ring-2 ring-primary/25'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-5 shrink-0 rounded-full border shadow-inner"
                      style={{ backgroundColor: palette.primary }}
                    />
                    <span className="truncate text-xs font-medium">{palette.name}</span>
                    {isSelected && (
                      <Check className="ml-auto size-3.5 shrink-0 text-primary" />
                    )}
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-sm">
                    {palette.chart.map((color) => (
                      <span key={color} className="h-full flex-1" style={{ backgroundColor: color }} />
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
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {DASHBOARD_FONT_OPTIONS.map((font) => {
                const isSelected = selectedFont === font.id
                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => setSelectedFont(font.id)}
                    title={font.description}
                    className={cn(
                      'group relative flex flex-col gap-1 overflow-hidden rounded-md border bg-card p-2 text-left shadow-sm transition-all hover:border-primary/60 hover:shadow-md',
                      isSelected && 'border-primary ring-2 ring-primary/25'
                    )}
                    style={{ fontFamily: font.stack }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-medium">{font.name}</span>
                      {isSelected && (
                        <Check className="ml-auto size-3.5 shrink-0 text-primary" />
                      )}
                    </div>
                    <p className="truncate text-sm font-bold tracking-tight">Aa Academic</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="size-4 text-primary" />
                  Live Preview
                </h3>
                <p className="text-xs text-muted-foreground">See how the selected palette and font appear on the dashboard.</p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
              <div
                className="overflow-hidden rounded-lg border bg-card shadow-sm"
                style={{
                  '--preview-primary': selectedPalette.primary,
                  '--preview-foreground': selectedPalette.foreground,
                  '--preview-accent': selectedPalette.sidebarAccent,
                  fontFamily: selectedFontOption.stack,
                } as CSSProperties}
              >
                <div
                  className="flex items-center justify-between px-3 py-2 text-xs font-medium"
                  style={{ backgroundColor: 'var(--preview-primary)', color: 'var(--preview-foreground)' }}
                >
                  <div className="flex items-center gap-2">
                    <School className="size-3.5" />
                    <span className="truncate">{currentSchool?.name || 'School Dashboard'}</span>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>Admin</span>
                </div>
                <div className="grid grid-cols-3 gap-2 p-2">
                  {[
                    { label: 'Students', icon: Users, value: '1,248' },
                    { label: 'Fees', icon: Banknote, value: '₹8.4L' },
                    { label: 'Attendance', icon: CalendarCheck, value: '96%' },
                  ].map(({ label, icon: Icon, value }, index) => (
                    <div key={label} className="flex flex-col gap-1 rounded-md border bg-background p-2">
                      <div
                        className="flex size-6 items-center justify-center rounded-md text-white"
                        style={{ backgroundColor: index === 0 ? 'var(--preview-primary)' : 'var(--preview-accent)' }}
                      >
                        <Icon className="size-3.5" />
                      </div>
                      <p className="text-xs font-semibold leading-tight">{label}</p>
                      <p className="text-sm font-bold tracking-tight" style={{ color: 'var(--preview-primary)' }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <School className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{currentSchool?.name || 'Current School'}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{currentSchool?.subdomain || 'school'} dashboard theme</p>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
                    <span className="size-3.5 shrink-0 rounded-full border shadow-inner" style={{ backgroundColor: selectedColor }} />
                    <span className="truncate font-medium">{selectedPalette.name}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{selectedColor.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5" style={{ fontFamily: selectedFontOption.stack }}>
                    <Type className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{selectedFontOption.name}</span>
                    <span className="ml-auto text-[11px] font-bold tracking-tight">Aa</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
