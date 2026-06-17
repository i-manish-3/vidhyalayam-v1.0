'use client'

/**
 * Admit Card Template editor — school-level visual customization for the admit
 * card, with a live A4 preview. Lives in the Exams module (consistent with
 * Report Card Templates). Saves the visual config + admit-card branding
 * (trust/principal/instructions) via /api/school/exams/admit-card-template.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { PageHeader, LoadingState } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save, RotateCcw, Loader2 } from 'lucide-react'
import { AdmitCardRenderer } from '../components/admit-card-renderer'
import {
  type AdmitCardTemplateConfig,
  DEFAULT_ADMIT_CARD_TEMPLATE,
} from '../lib/admit-card-template'
import type { AdmitCardData } from '../lib/admit-card-generator'

interface Branding {
  name: string
  logo: string | null
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

export function AdmitCardTemplatePage() {
  const router = useRouter()
  const { toast } = useToast()
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
      <PageHeader
        title="Admit Card Template"
        description="Customize how admit cards look and what they show. Changes apply to every admit card you print."
        backAction={{ onClick: () => router.back() }}
        action={{ label: saving ? 'Saving…' : 'Save template', icon: saving ? Loader2 : Save, onClick: handleSave }}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* ── Controls ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Appearance</CardTitle></CardHeader>
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
                    className="h-8 w-24 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Header style</Label>
                <Select value={cfg.headerStyle} onValueChange={(v) => set('headerStyle', v as AdmitCardTemplateConfig['headerStyle'])}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="logo-left">Logo left + details right</SelectItem>
                    <SelectItem value="centered">Centered (logo on top)</SelectItem>
                    <SelectItem value="banner">Banner image (uses logo full-width)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">Title text</Label>
                <Input id="title" value={cfg.titlePrefix} onChange={(e) => set('titlePrefix', e.target.value)} placeholder="Admit Card" className="h-9" />
              </div>
              <ToggleRow label="Show student photo" checked={cfg.showPhoto} onChange={(v) => set('showPhoto', v)} />
              <ToggleRow label="Show verification QR" checked={cfg.showQr} onChange={(v) => set('showQr', v)} />
              <ToggleRow label="Show instructions box" checked={cfg.showInstructions} onChange={(v) => set('showInstructions', v)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Student fields to show</CardTitle></CardHeader>
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

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Schedule columns</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <ToggleRow label="Day" checked={cfg.scheduleColumns.day} onChange={(v) => setCol('day', v)} compact />
              <ToggleRow label="Time" checked={cfg.scheduleColumns.time} onChange={(v) => setCol('time', v)} compact />
              <ToggleRow label="Duration" checked={cfg.scheduleColumns.duration} onChange={(v) => setCol('duration', v)} compact />
              <ToggleRow label="Room" checked={cfg.scheduleColumns.room} onChange={(v) => setCol('room', v)} compact />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Signatures</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <LabeledInput label="Left label" value={cfg.signatures.left} onChange={(v) => setSig('left', v)} />
              <LabeledInput label="Middle label" value={cfg.signatures.middle} onChange={(v) => setSig('middle', v)} />
              <LabeledInput label="Right label" value={cfg.signatures.right} onChange={(v) => setSig('right', v)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Branding &amp; instructions</CardTitle></CardHeader>
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
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
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
          <div className="overflow-x-auto rounded-lg border bg-muted/30 p-4">
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
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-9" />
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
