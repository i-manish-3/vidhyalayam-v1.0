'use client'

/**
 * Admit Card Template editor — school-level visual customization for the admit
 * card, with a live A4 preview. Lives in the Exams module (consistent with
 * Report Card Templates). Saves the visual config + admit-card branding
 * (trust/principal/instructions) via /api/school/exams/admit-card-template.
 */

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { PERMISSIONS, usePermissions } from '@/hooks/use-permissions'
import { GradientHero, LoadingState } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Save, RotateCcw, Loader2, TicketCheck, Palette, UserRound, CalendarDays, PenLine, Building2 } from 'lucide-react'
import { AdmitCardRenderer } from '../components/admit-card-renderer'
import {
  type AdmitCardTemplateConfig,
  DEFAULT_ADMIT_CARD_TEMPLATE,
} from '../lib/admit-card-template'
import type { AdmitCardData } from '../lib/admit-card-generator'

interface Branding {
  name: string
  logo: string | null
  printHeader: string | null
  address: string
  board: string | null
  registrationNumber: string | null
  udiseNumber: string | null
  affiliationNumber: string | null
  establishedYear: string | null
  principalSignature: string | null
  principalName: string | null
  trustName: string | null
  academicYear: string | null
}

interface LoadResponse {
  template: AdmitCardTemplateConfig
  branding: Branding
  instructions: string[]
}

const TINTED_CARD =
  'gap-0 overflow-hidden rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10'

export function AdmitCardTemplatePage() {
  const { toast } = useToast()
  const { hasAnyPermission } = usePermissions()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [branding, setBranding] = useState<Branding | null>(null)
  const [cfg, setCfg] = useState<AdmitCardTemplateConfig>(DEFAULT_ADMIT_CARD_TEMPLATE)
  const [instructions, setInstructions] = useState('')
  const [trustName, setTrustName] = useState('')
  const [principalName, setPrincipalName] = useState('')
  const [accentText, setAccentText] = useState(DEFAULT_ADMIT_CARD_TEMPLATE.accentColor)

  useEffect(() => {
    let alive = true
    api.get<LoadResponse>('/api/school/exams/admit-card-template')
      .then((res) => {
        if (!alive) return
        setCfg(res.template)
        setAccentText(res.template.accentColor)
        setBranding(res.branding)
        setInstructions((res.instructions || []).join('\n'))
        setTrustName(res.branding.trustName || '')
        setPrincipalName(res.branding.principalName || '')
      })
      .catch((e) => toast({ title: 'Could not load template', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' }))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [toast])

  const set = <K extends keyof AdmitCardTemplateConfig>(key: K, value: AdmitCardTemplateConfig[K]) =>
    setCfg((c) => ({ ...c, [key]: value }))
  const setField = (key: keyof AdmitCardTemplateConfig['fields'], value: boolean) =>
    setCfg((c) => ({ ...c, fields: { ...c.fields, [key]: value } }))
  const setCol = (key: keyof AdmitCardTemplateConfig['scheduleColumns'], value: boolean) =>
    setCfg((c) => ({ ...c, scheduleColumns: { ...c.scheduleColumns, [key]: value } }))
  const setSig = (key: keyof AdmitCardTemplateConfig['signatures'], value: string) =>
    setCfg((c) => ({ ...c, signatures: { ...c.signatures, [key]: value } }))

  const instructionLines = useMemo(
    () => instructions.split('\n').map((l) => l.trim()).filter(Boolean),
    [instructions],
  )

  // Sample data for the live preview, using the real branding + edited values.
  const previewData: AdmitCardData = useMemo(() => buildPreviewData(branding, trustName, principalName, instructionLines), [branding, trustName, principalName, instructionLines])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.patch('/api/school/exams/admit-card-template', {
        template: cfg,
        instructions: instructionLines,
        trustName: trustName.trim() || null,
        principalName: principalName.trim() || null,
      })
      toast({ title: 'Template saved', description: 'New admit cards will use this design.' })
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4 pb-20 sm:pb-0">
      <GradientHero
        icon={TicketCheck}
        title="Admit Card Template"
        description="Customize how admit cards look and what they show. Changes apply to every admit card you print."
        primaryAction={
          hasAnyPermission([PERMISSIONS.EXAM_MANAGE])
            ? {
                label: saving ? 'Saving…' : 'Save template',
                icon: saving ? Loader2 : Save,
                onClick: handleSave,
              }
            : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* ── Controls ── */}
        <div className="space-y-4">
          <Card className={TINTED_CARD}>
            <CardHeader className="relative overflow-hidden border-b border-current/10 bg-gradient-to-r from-sky-500/[0.08] via-white/40 to-violet-500/[0.08] py-2">
              <div className="relative flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
                  <Palette className="size-4 text-white" />
                </span>
                <CardTitle className="text-sm">Appearance</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="accent">Accent colour</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="accent"
                    type="color"
                    value={cfg.accentColor}
                    onChange={(e) => { set('accentColor', e.target.value); setAccentText(e.target.value) }}
                    className="h-8 w-10 cursor-pointer rounded border"
                  />
                  <Input
                    value={accentText}
                    onChange={(e) => {
                      const v = e.target.value
                      setAccentText(v)
                      // Only commit a valid #rrggbb to the live style; keep typing free.
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) set('accentColor', v)
                    }}
                    className="h-8 w-24 bg-white font-mono text-xs dark:bg-input/30"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Header</Label>
                <p className="rounded-md border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 px-3 py-2 text-xs text-muted-foreground dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
                  The admit card uses the school&apos;s standard print header — the same one used on fee receipts and other documents.{' '}
                  Upload the banner in <strong>Settings → School Identity → Print Header Banner</strong>. Without a banner, the logo, name, address, contact, and board are shown automatically.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">Title text</Label>
                <Input id="title" value={cfg.titlePrefix} onChange={(e) => set('titlePrefix', e.target.value)} placeholder="Admit Card" className="h-9 bg-white dark:bg-input/30" />
              </div>
              <ToggleRow label="Show student photo" checked={cfg.showPhoto} onChange={(v) => set('showPhoto', v)} />
              <ToggleRow label="Show verification QR" checked={cfg.showQr} onChange={(v) => set('showQr', v)} />
              <ToggleRow label="Show instructions box" checked={cfg.showInstructions} onChange={(v) => set('showInstructions', v)} />
            </CardContent>
          </Card>

          <Card className={TINTED_CARD}>
            <CardHeader className="relative overflow-hidden border-b border-current/10 bg-gradient-to-r from-sky-500/[0.08] via-white/40 to-violet-500/[0.08] py-2">
              <div className="relative flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
                  <UserRound className="size-4 text-white" />
                </span>
                <CardTitle className="text-sm">Student fields to show</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <ToggleRow label="Roll No" checked={cfg.fields.rollNumber} onChange={(v) => setField('rollNumber', v)} compact />
              <ToggleRow label="Admission No" checked={cfg.fields.admissionNumber} onChange={(v) => setField('admissionNumber', v)} compact />
              <ToggleRow label="Father's Name" checked={cfg.fields.fatherName} onChange={(v) => setField('fatherName', v)} compact />
              <ToggleRow label="Mother's Name" checked={cfg.fields.motherName} onChange={(v) => setField('motherName', v)} compact />
              <ToggleRow label="Class & Section" checked={cfg.fields.classSection} onChange={(v) => setField('classSection', v)} compact />
              <ToggleRow label="Session" checked={cfg.fields.session} onChange={(v) => setField('session', v)} compact />
              <ToggleRow label="Date of Birth" checked={cfg.fields.dateOfBirth} onChange={(v) => setField('dateOfBirth', v)} compact />
              <ToggleRow label="Gender" checked={cfg.fields.gender} onChange={(v) => setField('gender', v)} compact />
            </CardContent>
          </Card>

          <Card className={TINTED_CARD}>
            <CardHeader className="relative overflow-hidden border-b border-current/10 bg-gradient-to-r from-sky-500/[0.08] via-white/40 to-violet-500/[0.08] py-2">
              <div className="relative flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
                  <CalendarDays className="size-4 text-white" />
                </span>
                <CardTitle className="text-sm">Schedule columns</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <ToggleRow label="Day" checked={cfg.scheduleColumns.day} onChange={(v) => setCol('day', v)} compact />
              <ToggleRow label="Time" checked={cfg.scheduleColumns.time} onChange={(v) => setCol('time', v)} compact />
              <ToggleRow label="Duration" checked={cfg.scheduleColumns.duration} onChange={(v) => setCol('duration', v)} compact />
              <ToggleRow label="Room" checked={cfg.scheduleColumns.room} onChange={(v) => setCol('room', v)} compact />
            </CardContent>
          </Card>

          <Card className={TINTED_CARD}>
            <CardHeader className="relative overflow-hidden border-b border-current/10 bg-gradient-to-r from-sky-500/[0.08] via-white/40 to-violet-500/[0.08] py-2">
              <div className="relative flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
                  <PenLine className="size-4 text-white" />
                </span>
                <CardTitle className="text-sm">Signatures</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <LabeledInput label="Left label" value={cfg.signatures.left} onChange={(v) => setSig('left', v)} />
              <LabeledInput label="Middle label" value={cfg.signatures.middle} onChange={(v) => setSig('middle', v)} />
              <LabeledInput label="Right label" value={cfg.signatures.right} onChange={(v) => setSig('right', v)} />
            </CardContent>
          </Card>

          <Card className={TINTED_CARD}>
            <CardHeader className="relative overflow-hidden border-b border-current/10 bg-gradient-to-r from-sky-500/[0.08] via-white/40 to-violet-500/[0.08] py-2">
              <div className="relative flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
                  <Building2 className="size-4 text-white" />
                </span>
                <CardTitle className="text-sm">Branding &amp; instructions</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <LabeledInput label="Trust / Society name" value={trustName} onChange={setTrustName} placeholder="e.g. Dayaramka Educational & Charitable Trust" />
              <LabeledInput label="Principal name" value={principalName} onChange={setPrincipalName} placeholder="e.g. Amit Kumar" />
              <div className="space-y-1.5">
                <Label htmlFor="instr">Instructions (one per line)</Label>
                <Textarea id="instr" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={5} placeholder={'Arrive 30 minutes before exam time\nBring admit card and school ID\nNo electronic devices allowed'} />
                <p className="text-xs text-muted-foreground">Leave blank to use the standard defaults.</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Logo, board, reg no. and other identity fields are set in Settings → School Identity.
              </p>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving || !hasAnyPermission([PERMISSIONS.EXAM_MANAGE])}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save template
            </Button>
            <Button variant="outline" onClick={() => { setCfg(DEFAULT_ADMIT_CARD_TEMPLATE); setAccentText(DEFAULT_ADMIT_CARD_TEMPLATE.accentColor) }} className="gap-1.5">
              <RotateCcw className="size-4" /> Reset to default
            </Button>
          </div>
        </div>

        {/* ── Live preview ── */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live preview (sample data)</div>
          <div className={`overflow-x-auto rounded-lg border p-4 ${TINTED_CARD}`}>
            <div className="mx-auto bg-white shadow-sm" style={{ width: 794, maxWidth: '100%' }}>
              <AdmitCardRenderer data={previewData} template={cfg} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToggleRow({ label, checked, onChange, compact }: { label: string; checked: boolean; onChange: (v: boolean) => void; compact?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className={compact ? 'text-xs font-normal' : ''}>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function LabeledInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9 bg-white dark:bg-input/30" />
    </div>
  )
}

function buildPreviewData(b: Branding | null, trustName: string, principalName: string, instructions: string[]): AdmitCardData {
  const ay = b?.academicYear || '2025-2026'
  return {
    title: 'ADMIT CARD',
    school: {
      name: b?.name || 'Your School Name',
      logo: b?.logo ?? null,
      printHeader: b?.printHeader ?? null,
      address: b?.address || 'School address, City, State',
      contact: null,
      affiliationNumber: b?.affiliationNumber ?? null,
      udiseNumber: b?.udiseNumber ?? null,
      principalSignature: b?.principalSignature ?? null,
      board: b?.board ?? 'CBSE',
      registrationNumber: b?.registrationNumber ?? null,
      establishedYear: b?.establishedYear ?? null,
      trustName: trustName || null,
      principalName: principalName || null,
    },
    examMeta: { name: 'Pre-Mid Term', group: null, paradigm: null, academicYear: ay, dateRange: null },
    student: {
      fullName: 'Aradhya Kumari',
      admissionNumber: 'ADM-0006',
      rollNumber: '6',
      className: 'I',
      sectionName: 'A',
      fatherName: 'Subhash Kumar',
      motherName: 'Neetu Kumari',
      dateOfBirth: '13 Mar 2019',
      gender: 'Female',
      profileImage: null,
    },
    datesheet: [
      { subjectName: 'English', date: '03 Jul 2026 (Fri)', dateShort: '03 Jul 2026', day: 'Friday', time: '09:00 – 11:00', room: 'R-1', duration: '2h' },
      { subjectName: 'Hindi', date: '04 Jul 2026 (Sat)', dateShort: '04 Jul 2026', day: 'Saturday', time: '09:00 – 11:00', room: 'R-1', duration: '2h' },
      { subjectName: 'Mathematics', date: '06 Jul 2026 (Mon)', dateShort: '06 Jul 2026', day: 'Monday', time: '09:00 – 11:00', room: 'R-1', duration: '2h' },
      { subjectName: 'Science', date: '07 Jul 2026 (Tue)', dateShort: '07 Jul 2026', day: 'Tuesday', time: '09:00 – 11:00', room: 'R-1', duration: '2h' },
    ],
    instructions: instructions.length > 0 ? instructions : [
      'Arrive 30 minutes before exam time',
      'Bring admit card and school ID',
      'No electronic devices allowed',
      'Maintain silence in exam hall',
    ],
    qrPayload: 'preview',
  }
}
