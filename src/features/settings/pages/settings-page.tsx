'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, ChevronRight, Hash, ImagePlus, Loader2, Package, Palette, Save, School, Sparkles, X } from 'lucide-react'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { useAppStore, type School as SchoolInfo } from '@/lib/store'
import { useEffectiveRole } from '@/hooks/use-effective-role'
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
  employeeNumberPrefix: string
  employeeNumberFormat: string
  employeeSequenceStart: number
  employeeSequenceDigits: number
  employeeResetYearly: boolean
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
  employeeNumberPrefix: 'EMP',
  employeeNumberFormat: '{PREFIX}-{SEQ}',
  employeeSequenceStart: 1,
  employeeSequenceDigits: 4,
  employeeResetYearly: false,
}

export function SettingsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { currentSchool, setCurrentSchool, user } = useAppStore()
  const effectiveRole = useEffectiveRole()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)
  const printHeaderInputRef = useRef<HTMLInputElement>(null)
  const principalSignatureInputRef = useRef<HTMLInputElement>(null)
  const [schoolName, setSchoolName] = useState(currentSchool?.name || '')
  const [schoolLogo, setSchoolLogo] = useState(currentSchool?.logo || '')
  const [schoolFavicon, setSchoolFavicon] = useState(currentSchool?.favicon || '')
  const [schoolPrintHeader, setSchoolPrintHeader] = useState(currentSchool?.printHeader || '')
  const [registrationNumber, setRegistrationNumber] = useState(currentSchool?.registrationNumber || '')
  const [udiseNumber, setUdiseNumber] = useState(currentSchool?.udiseNumber || '')
  const [affiliationNumber, setAffiliationNumber] = useState(currentSchool?.affiliationNumber || '')
  const [establishedYear, setEstablishedYear] = useState(currentSchool?.establishedYear || '')
  const [principalSignature, setPrincipalSignature] = useState(currentSchool?.principalSignature || '')
  const [saving, setSaving] = useState(false)
  const [admissionSettings, setAdmissionSettings] = useState<AdmissionSettings>(DEFAULT_ADMISSION_SETTINGS)
  const [admissionSamples, setAdmissionSamples] = useState({ admissionNumber: 'STD-2026-001', registrationNumber: 'REG-2026-001', employeeId: 'EMP-0001' })
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [inventoryDuesOnFeePage, setInventoryDuesOnFeePage] = useState<boolean>(currentSchool?.inventoryDuesOnFeePage ?? false)
  const [savingInventoryDues, setSavingInventoryDues] = useState(false)

  useEffect(() => {
    if (!currentSchool || saving) return

    setSchoolName(currentSchool.name || '')
    setSchoolLogo(currentSchool.logo || '')
    setSchoolFavicon(currentSchool.favicon || '')
    setSchoolPrintHeader(currentSchool.printHeader || '')
    setRegistrationNumber(currentSchool.registrationNumber || '')
    setUdiseNumber(currentSchool.udiseNumber || '')
    setAffiliationNumber(currentSchool.affiliationNumber || '')
    setEstablishedYear(currentSchool.establishedYear || '')
    setPrincipalSignature(currentSchool.principalSignature || '')
    setInventoryDuesOnFeePage(currentSchool.inventoryDuesOnFeePage ?? false)
  }, [
    currentSchool?.favicon,
    currentSchool?.inventoryDuesOnFeePage,
    currentSchool?.affiliationNumber,
    currentSchool?.establishedYear,
    currentSchool?.logo,
    currentSchool?.principalSignature,
    currentSchool?.printHeader,
    currentSchool?.name,
    currentSchool?.registrationNumber,
    saving,
    currentSchool?.udiseNumber,
  ])

  useEffect(() => {
    if (effectiveRole !== 'SCHOOL_ADMIN') return

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
  }, [effectiveRole])

  const hasChanges =
    schoolName.trim() !== (currentSchool?.name || '') ||
    schoolLogo !== (currentSchool?.logo || '') ||
    schoolFavicon !== (currentSchool?.favicon || '') ||
    schoolPrintHeader !== (currentSchool?.printHeader || '') ||
    registrationNumber !== (currentSchool?.registrationNumber || '') ||
    udiseNumber !== (currentSchool?.udiseNumber || '') ||
    affiliationNumber !== (currentSchool?.affiliationNumber || '') ||
    establishedYear !== (currentSchool?.establishedYear || '') ||
    principalSignature !== (currentSchool?.principalSignature || '')

  const readImageFile = async (
    file: File | undefined,
    {
      title,
      onLoad,
    }: {
      title: string
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

    try {
      const { dataUrl, finalBytes, compressed } = await compressImage(file)
      if (finalBytes > 200 * 1024) {
        toast({
          title: `${title} Too Large`,
          description: `The ${title.toLowerCase()} must be under 200 KB. GIF and ICO files are not auto-compressed — please use a smaller file.`,
          variant: 'destructive',
        })
        return
      }
      onLoad(dataUrl)
      if (compressed) {
        toast({
          title: `${title} Compressed`,
          description: `Resized to ${Math.round(finalBytes / 1024)} KB for upload.`,
        })
      }
    } catch {
      toast({
        title: `Could Not Read ${title}`,
        description: 'Please try a different image.',
        variant: 'destructive',
      })
    }
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
        registrationNumber,
        udiseNumber,
        affiliationNumber,
        establishedYear,
        principalSignature,
      })
      setCurrentSchool(res.school)
      setSchoolName(res.school.name)
      setSchoolLogo(res.school.logo || '')
      setSchoolFavicon(res.school.favicon || '')
      setSchoolPrintHeader(res.school.printHeader || '')
      setRegistrationNumber(res.school.registrationNumber || '')
      setUdiseNumber(res.school.udiseNumber || '')
      setAffiliationNumber(res.school.affiliationNumber || '')
      setEstablishedYear(res.school.establishedYear || '')
      setPrincipalSignature(res.school.principalSignature || '')
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

  const handleToggleInventoryDues = async (checked: boolean) => {
    const previous = inventoryDuesOnFeePage
    setInventoryDuesOnFeePage(checked) // optimistic
    setSavingInventoryDues(true)
    try {
      const res = await api.patch<{ school: SchoolInfo }>('/api/school/info', { inventoryDuesOnFeePage: checked })
      setCurrentSchool(res.school)
      toast({
        title: checked ? 'Store dues will show on Collect Fee' : 'Store dues kept inside Inventory',
        description: checked
          ? 'Unpaid inventory-sale dues now also appear on the Collect Fee page.'
          : 'Unpaid inventory-sale dues are collected only from Inventory → Sales.',
      })
    } catch (err) {
      setInventoryDuesOnFeePage(previous) // roll back
      toast({
        title: "Couldn't update setting",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSavingInventoryDues(false)
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

  if (effectiveRole !== 'SCHOOL_ADMIN') {
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
        <div className="flex min-w-0 items-stretch gap-3">
          <span aria-hidden className="bg-brand mt-0.5 w-1 shrink-0 self-stretch rounded-full" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground/90">Settings</h1>
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
            <span className="bg-brand-soft flex size-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
              <School className="size-4" />
            </span>
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

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="school-registration-number">Registration No.</Label>
              <Input
                id="school-registration-number"
                value={registrationNumber}
                onChange={(event) => setRegistrationNumber(event.target.value)}
                placeholder="REG NO"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="school-udise-number">UDISE</Label>
              <Input
                id="school-udise-number"
                value={udiseNumber}
                onChange={(event) => setUdiseNumber(event.target.value)}
                placeholder="UDISE code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="school-affiliation-number">Affiliation No.</Label>
              <Input
                id="school-affiliation-number"
                value={affiliationNumber}
                onChange={(event) => setAffiliationNumber(event.target.value)}
                placeholder="Affiliation number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="school-established-year">ESTD</Label>
              <Input
                id="school-established-year"
                value={establishedYear}
                onChange={(event) => setEstablishedYear(event.target.value)}
                placeholder="2021"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">School Logo</Label>
                <Badge variant="outline" className="text-[10px]">Max 200 KB</Badge>
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(event) => readImageFile(event.target.files?.[0], {
                  title: 'Logo',
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
                <Badge variant="outline" className="text-[10px]">Max 200 KB</Badge>
              </div>
              <input
                ref={faviconInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/x-icon,image/vnd.microsoft.icon"
                className="hidden"
                onChange={(event) => readImageFile(event.target.files?.[0], {
                  title: 'Favicon',
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
              <Badge variant="outline" className="text-[10px]">Max 200 KB</Badge>
            </div>
            <input
              ref={printHeaderInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(event) => readImageFile(event.target.files?.[0], {
                title: 'Print Header',
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

          <div className="rounded-lg border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Principal Signature</Label>
              <Badge variant="outline" className="text-[10px]">Max 200 KB</Badge>
            </div>
            <input
              ref={principalSignatureInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(event) => readImageFile(event.target.files?.[0], {
                title: 'Principal Signature',
                onLoad: setPrincipalSignature,
              })}
            />
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <div className="flex h-24 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                {principalSignature ? (
                  <img src={principalSignature} alt="Principal signature preview" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <ImagePlus className="size-6" />
                    <span className="text-[11px]">No signature</span>
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-col justify-center gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => principalSignatureInputRef.current?.click()}>
                    <ImagePlus className="size-3.5" />
                    {principalSignature ? 'Change Signature' : 'Upload Signature'}
                  </Button>
                  {principalSignature && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-destructive hover:text-destructive"
                      onClick={() => {
                        setPrincipalSignature('')
                        if (principalSignatureInputRef.current) principalSignatureInputRef.current.value = ''
                      }}
                    >
                      <X className="size-3.5" />
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Used by ID card templates through the principal signature token.
                </p>
              </div>
            </div>
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
                <span className="bg-brand-soft flex size-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
                  <Hash className="size-4" />
                </span>
                School Numbering
              </CardTitle>
              <CardDescription>
                Configure admission, registration, and employee ID prefixes, formats, and serial sequence for this school.
              </CardDescription>
            </div>
            <Button onClick={saveAdmissionSettings} disabled={settingsLoading || settingsSaving}>
              {settingsSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Formats
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
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

            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Employee ID</h3>
                  <p className="text-xs text-muted-foreground">Used for teachers, staff, and transport drivers.</p>
                </div>
                <Badge variant="outline" className="font-mono">{admissionSamples.employeeId}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Prefix</Label>
                  <Input
                    value={admissionSettings.employeeNumberPrefix}
                    onChange={(event) => updateAdmissionSetting('employeeNumberPrefix', event.target.value.toUpperCase())}
                    placeholder="EMP"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Input
                    value={admissionSettings.employeeNumberFormat}
                    onChange={(event) => updateAdmissionSetting('employeeNumberFormat', event.target.value.toUpperCase())}
                    placeholder="{PREFIX}-{SEQ}"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Start From</Label>
                  <Input
                    type="number"
                    min={1}
                    value={admissionSettings.employeeSequenceStart}
                    onChange={(event) => updateAdmissionSetting('employeeSequenceStart', Number(event.target.value) || 1)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Serial Digits</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={admissionSettings.employeeSequenceDigits}
                    onChange={(event) => updateAdmissionSetting('employeeSequenceDigits', Number(event.target.value) || 4)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                <Label htmlFor="reset-employee-number" className="text-sm">Reset serial every year</Label>
                <Switch
                  id="reset-employee-number"
                  checked={admissionSettings.employeeResetYearly}
                  onCheckedChange={(checked) => updateAdmissionSetting('employeeResetYearly', checked)}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Available tokens: <span className="font-mono">{'{PREFIX}'}</span>, <span className="font-mono">{'{YEAR}'}</span>, <span className="font-mono">{'{YY}'}</span>, <span className="font-mono">{'{SEQ}'}</span>. Admission and registration also support <span className="font-mono">{'{CLASS}'}</span>.
          </p>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="bg-brand-soft flex size-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
              <Banknote className="size-4" />
            </span>
            Fee Demand & Reminders
          </CardTitle>
          <CardDescription>
            Configure when monthly demand slips are due, late fee policy, and WhatsApp delivery for parents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={() => router.push('/settings/fee-demand-config')}
            className="group flex w-full items-center justify-between rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Open fee demand settings</p>
              <p className="text-xs text-muted-foreground">
                Set due day, preview late fine policy, and configure your school's WhatsApp number.
              </p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="bg-brand-soft flex size-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
              <Package className="size-4" />
            </span>
            Store / Inventory
          </CardTitle>
          <CardDescription>
            Control where unpaid dues from store (inventory) sales are collected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-3">
            <div className="space-y-0.5">
              <Label htmlFor="inventory-dues-on-fee-page" className="text-sm font-medium">
                Show store dues on the Collect Fee page
              </Label>
              <p className="text-xs text-muted-foreground">
                When <strong>off</strong>, a partial/unpaid store sale stays a store due, collected from
                {' '}<strong>Inventory → Sales</strong>. When <strong>on</strong>, the same due also appears on the
                {' '}<strong>Collect Fee</strong> page and can be collected from either place (one shared balance).
              </p>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              {savingInventoryDues && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              <Switch
                id="inventory-dues-on-fee-page"
                checked={inventoryDuesOnFeePage}
                disabled={savingInventoryDues}
                onCheckedChange={handleToggleInventoryDues}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
