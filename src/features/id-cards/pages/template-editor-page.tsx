'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Save, Sparkles, AlertTriangle, Copy, Code, IdCard } from 'lucide-react'
import {
  IdCardHtmlRenderer,
  DEMO_HTML_CARD,
  type HtmlRenderTemplate,
} from '../components/id-card-html-renderer'
import { PresetGalleryDialog } from '../components/preset-gallery-dialog'
import type { IdCardPreset } from '@/features/id-cards/presets'
import { useAppStore } from '@/lib/store'

type Side = 'front' | 'back'

interface DraftTemplate {
  name: string
  description: string
  orientation: 'portrait' | 'landscape'
  widthMm: number
  heightMm: number
  hasBackSide: boolean
  isDefault: boolean
  isActive: boolean
  frontHtml: string
  frontCss: string
  backHtml: string
  backCss: string
}

interface TemplateApiPayload {
  id: string
  name: string
  description: string | null
  templateMode: 'html' | 'element'
  orientation: 'portrait' | 'landscape'
  widthMm: number
  heightMm: number
  hasBackSide: boolean
  isDefault: boolean
  isActive: boolean
  frontHtml: string | null
  backHtml: string | null
  frontCss: string | null
  backCss: string | null
}

const EMPTY_DRAFT: DraftTemplate = {
  name: 'New ID Card Template',
  description: '',
  orientation: 'landscape',
  widthMm: 86,
  heightMm: 54,
  hasBackSide: false,
  isDefault: false,
  isActive: true,
  frontHtml: `<div class="card">
  <div class="header">
    <img src="{{logo}}" alt="" class="logo" />
    <div class="school">{{school.name}}</div>
  </div>
  <img src="{{photo}}" alt="" class="photo" />
  <div class="name">{{student.name}}</div>
  <div class="meta">
    <div><span>Adm</span> {{student.admissionNumber}}</div>
    <div><span>Class</span> {{student.classSection}}</div>
    <div><span>Roll</span> {{student.rollNumber}}</div>
  </div>
  <img src="{{qr}}" alt="" class="qr" />
</div>`,
  frontCss: `.card { width: 100%; height: 100%; padding: 3mm; box-sizing: border-box; font-family: system-ui, sans-serif; color: #0f172a; background: #ffffff; }
.header { display: flex; gap: 2mm; align-items: center; }
.logo { width: 6mm; height: 6mm; object-fit: contain; }
.school { font-size: 9px; font-weight: 700; color: #0d9488; }
.photo { width: 22mm; height: 26mm; object-fit: cover; margin: 1mm 0; border-radius: 1mm; }
.name { font-size: 11px; font-weight: 800; }
.meta { font-size: 6.5px; line-height: 1.4; }
.meta span { color: #64748b; }
.qr { position: absolute; right: 3mm; bottom: 3mm; width: 12mm; height: 12mm; }`,
  backHtml: '',
  backCss: '',
}

const TOKEN_REFERENCE = [
  { group: 'Student', tokens: [
    { token: '{{student.name}}', desc: 'Full name' },
    { token: '{{student.admissionNumber}}', desc: 'Admission no.' },
    { token: '{{student.rollNumber}}', desc: 'Roll number' },
    { token: '{{student.class}}', desc: 'Class' },
    { token: '{{student.section}}', desc: 'Section' },
    { token: '{{student.classSection}}', desc: 'Class - Section' },
    { token: '{{student.dateOfBirth}}', desc: 'DOB' },
    { token: '{{student.bloodGroup}}', desc: 'Blood group' },
    { token: '{{student.gender}}', desc: 'Gender' },
    { token: '{{student.address}}', desc: 'Address' },
    { token: '{{student.parentName}}', desc: 'Parent / guardian' },
    { token: '{{student.fatherName}}', desc: 'Father' },
    { token: '{{student.motherName}}', desc: 'Mother' },
    { token: '{{student.parentPhone}}', desc: 'Parent phone' },
    { token: '{{student.academicYear}}', desc: 'Academic year' },
  ] },
  { group: 'School', tokens: [
    { token: '{{school.name}}', desc: 'School name' },
    { token: '{{school.address}}', desc: 'Full address' },
    { token: '{{school.phone}}', desc: 'Contact phone' },
    { token: '{{school.email}}', desc: 'Contact email' },
    { token: '{{school.website}}', desc: 'Website' },
  ] },
  { group: 'Media', tokens: [
    { token: '{{photo}}', desc: 'Student photo (use in <img src>)' },
    { token: '{{logo}}', desc: 'School logo' },
    { token: '{{qr}}', desc: 'Signed QR code' },
  ] },
]

export function TemplateEditorPage({ templateId }: { templateId?: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const currentSchool = useAppStore((s) => s.currentSchool)
  const isNew = !templateId

  const [draft, setDraft] = useState<DraftTemplate>(EMPTY_DRAFT)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [side, setSide] = useState<Side>('front')
  const [legacyMode, setLegacyMode] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)

  useEffect(() => {
    if (isNew) return
    setLoading(true)
    api
      .get<{ template: TemplateApiPayload }>(`/api/school/id-cards/templates/${templateId}`)
      .then((res) => {
        const t = res.template
        setLegacyMode(t.templateMode === 'element')
        setDraft({
          name: t.name,
          description: t.description || '',
          orientation: t.orientation,
          widthMm: t.widthMm,
          heightMm: t.heightMm,
          hasBackSide: t.hasBackSide,
          isDefault: t.isDefault,
          isActive: t.isActive,
          frontHtml: t.frontHtml || '',
          frontCss: t.frontCss || '',
          backHtml: t.backHtml || '',
          backCss: t.backCss || '',
        })
      })
      .catch((err) => {
        toast({
          variant: 'destructive',
          title: 'Could not load template',
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      })
      .finally(() => setLoading(false))
  }, [isNew, templateId, toast])

  const renderTpl: HtmlRenderTemplate = useMemo(
    () => ({
      widthMm: draft.widthMm,
      heightMm: draft.heightMm,
      frontHtml: draft.frontHtml,
      frontCss: draft.frontCss,
      backHtml: draft.backHtml,
      backCss: draft.backCss,
      hasBackSide: draft.hasBackSide,
    }),
    [draft],
  )

  const swapOrientation = () => {
    setDraft((prev) => ({
      ...prev,
      orientation: prev.orientation === 'portrait' ? 'landscape' : 'portrait',
      widthMm: prev.heightMm,
      heightMm: prev.widthMm,
    }))
  }

  const applyPreset = useCallback(
    (preset: IdCardPreset) => {
      setDraft((prev) => ({
        ...prev,
        orientation: preset.orientation,
        widthMm: preset.widthMm,
        heightMm: preset.heightMm,
        hasBackSide: preset.hasBackSide,
        frontHtml: preset.frontHtml,
        frontCss: preset.frontCss,
        backHtml: preset.backHtml || '',
        backCss: preset.backCss || '',
      }))
      setLegacyMode(false)
      setGalleryOpen(false)
      toast({ title: 'Preset applied', description: `Loaded "${preset.name}" into the editor.` })
    },
    [toast],
  )

  const save = async () => {
    if (!draft.name.trim()) {
      toast({ variant: 'destructive', title: 'Please give the template a name.' })
      return
    }
    if (!draft.frontHtml.trim()) {
      toast({ variant: 'destructive', title: 'Front HTML is required.' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        templateMode: 'html' as const,
        orientation: draft.orientation,
        widthMm: draft.widthMm,
        heightMm: draft.heightMm,
        backgroundColor: '#ffffff',
        hasBackSide: draft.hasBackSide,
        frontHtml: draft.frontHtml,
        frontCss: draft.frontCss,
        backHtml: draft.hasBackSide ? draft.backHtml : null,
        backCss: draft.hasBackSide ? draft.backCss : null,
        isDefault: draft.isDefault,
        isActive: draft.isActive,
      }
      if (isNew) {
        const res = await api.post<{ template: { id: string } }>('/api/school/id-cards/templates', payload)
        toast({ title: 'Template created' })
        router.replace(`/id-cards/templates/${res.template.id}`)
      } else {
        await api.put(`/api/school/id-cards/templates/${templateId}`, payload)
        toast({ title: 'Template saved' })
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not save template',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />

  const activeHtml = side === 'front' ? draft.frontHtml : draft.backHtml
  const activeCss = side === 'front' ? draft.frontCss : draft.backCss
  const setActiveHtml = (v: string) =>
    setDraft((prev) => (side === 'front' ? { ...prev, frontHtml: v } : { ...prev, backHtml: v }))
  const setActiveCss = (v: string) =>
    setDraft((prev) => (side === 'front' ? { ...prev, frontCss: v } : { ...prev, backCss: v }))

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token)
      toast({ title: 'Copied', description: token })
    } catch {
      toast({ variant: 'destructive', title: 'Could not copy to clipboard' })
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={isNew ? 'New ID Card Template' : 'Edit Template'}
        description="Pick a preset or write HTML/CSS directly. The preview updates live as you type."
        backAction={{ onClick: () => router.push('/id-cards/templates') }}
        action={{ label: saving ? 'Saving…' : 'Save Template', icon: Save, onClick: save }}
        secondaryAction={{
          label: 'Browse Presets',
          icon: Sparkles,
          onClick: () => setGalleryOpen(true),
        }}
      />

      {legacyMode && (
        <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">This is a legacy element-based template.</p>
            <p className="mt-0.5 text-xs">
              The visual element designer has been replaced with HTML/CSS. Apply a preset or paste your own
              HTML to migrate, then save.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* LEFT — template settings + token reference */}
        <div className="space-y-3">
          <Card>
            <CardContent className="space-y-3 p-3 text-xs">
              <div className="space-y-1">
                <Label className="text-[11px]">Template name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Description</Label>
                <Textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="min-h-[44px] text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Width (mm)"
                  value={draft.widthMm}
                  onChange={(v) => setDraft({ ...draft, widthMm: v })}
                  min={40}
                  max={200}
                />
                <NumberField
                  label="Height (mm)"
                  value={draft.heightMm}
                  onChange={(v) => setDraft({ ...draft, heightMm: v })}
                  min={40}
                  max={200}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px]">Orientation</Label>
                <Button variant="outline" size="sm" className="h-7 text-xs capitalize" onClick={swapOrientation}>
                  {draft.orientation} ↔
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px]">Back side</Label>
                <Switch
                  checked={draft.hasBackSide}
                  onCheckedChange={(c) => {
                    setDraft({ ...draft, hasBackSide: c })
                    if (!c && side === 'back') setSide('front')
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px]">Default template</Label>
                <Switch checked={draft.isDefault} onCheckedChange={(c) => setDraft({ ...draft, isDefault: c })} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px]">Active</Label>
                <Switch checked={draft.isActive} onCheckedChange={(c) => setDraft({ ...draft, isActive: c })} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-3">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">Available tokens</p>
              <ScrollArea className="h-[260px] pr-2">
                <div className="space-y-3">
                  {TOKEN_REFERENCE.map((g) => (
                    <div key={g.group}>
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground/70">
                        {g.group}
                      </p>
                      <div className="mt-1 space-y-0.5">
                        {g.tokens.map((t) => (
                          <button
                            key={t.token}
                            type="button"
                            onClick={() => copyToken(t.token)}
                            className="group flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-accent/60"
                          >
                            <code className="font-mono text-[10px] text-primary">{t.token}</code>
                            <Copy className="size-3 opacity-0 group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — editor + preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Tabs
              value={side}
              onValueChange={(v) => setSide(v as Side)}
            >
              <TabsList>
                <TabsTrigger value="front">Front Side</TabsTrigger>
                <TabsTrigger value="back" disabled={!draft.hasBackSide}>
                  Back Side
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Code className="size-3" /> HTML mode
            </Badge>
          </div>

          <Tabs value={side}>
            <TabsContent value={side} className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-2">
                <Card>
                  <CardContent className="space-y-1 p-3">
                    <Label className="text-[11px] font-semibold uppercase text-muted-foreground">
                      HTML
                    </Label>
                    <Textarea
                      value={activeHtml}
                      onChange={(e) => setActiveHtml(e.target.value)}
                      className="min-h-[260px] resize-none font-mono text-[11px] leading-relaxed"
                      spellCheck={false}
                      placeholder={
                        side === 'back'
                          ? 'Enable "Back side" to author the back of the card.'
                          : '<div class="card">…</div>'
                      }
                      disabled={side === 'back' && !draft.hasBackSide}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="space-y-1 p-3">
                    <Label className="text-[11px] font-semibold uppercase text-muted-foreground">CSS</Label>
                    <Textarea
                      value={activeCss}
                      onChange={(e) => setActiveCss(e.target.value)}
                      className="min-h-[260px] resize-none font-mono text-[11px] leading-relaxed"
                      spellCheck={false}
                      placeholder=".card { ... }"
                      disabled={side === 'back' && !draft.hasBackSide}
                    />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2 font-semibold uppercase text-muted-foreground">
                      <IdCard className="size-3.5" /> Live Preview
                    </div>
                    <Badge variant="secondary" className="font-mono text-[10px] capitalize">
                      {side} · {draft.widthMm}×{draft.heightMm}mm
                    </Badge>
                  </div>
                  <div
                    className="flex items-center justify-center rounded-lg border bg-gradient-to-br from-slate-50 via-white to-slate-50 px-6 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle at 50% 30%, rgba(99,102,241,0.06), transparent 60%)',
                    }}
                  >
                    <div className="pointer-events-none">
                      <IdCardHtmlRenderer
                        template={renderTpl}
                        card={DEMO_HTML_CARD}
                        schoolLogo={currentSchool?.logo || null}
                        scale={draft.orientation === 'portrait' ? 1.6 : 2}
                        side={side}
                      />
                    </div>
                  </div>
                  {draft.hasBackSide && (
                    <p className="text-center text-[11px] text-muted-foreground">
                      Use the tabs above to preview the {side === 'front' ? 'back' : 'front'} side.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <PresetGalleryDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        onApply={applyPreset}
      />
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={0.5}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v)) onChange(v)
        }}
        className="h-8 text-xs"
      />
    </div>
  )
}
