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
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save, Sparkles, AlertTriangle, Copy, Code, IdCard, Wand2, Palette } from 'lucide-react'
import {
  IdCardHtmlRenderer,
  DEMO_HTML_CARD,
  type HtmlRenderTemplate,
} from '../components/id-card-html-renderer'
import { PresetGalleryDialog } from '../components/preset-gallery-dialog'
import type { IdCardPreset } from '@/features/id-cards/presets'
import { useAppStore } from '@/lib/store'
import {
  buildEasyTemplate,
  DEFAULT_EASY_TEMPLATE_SETTINGS,
  EASY_TEMPLATE_FIELDS,
  EASY_TEMPLATE_PALETTES,
  EASY_TEMPLATE_STYLES,
  type EasyFieldKey,
  type EasyTemplateSettings,
} from '@/features/id-cards/easy-template-builder'

type Side = 'front' | 'back'
type EditorMode = 'easy' | 'advanced'

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
  <div class="sig"><img src="{{signature}}" alt="" />Principal</div>
</div>`,
  frontCss: `.card { width: 100%; height: 100%; padding: 3mm; box-sizing: border-box; font-family: system-ui, sans-serif; color: #0f172a; background: #ffffff; }
.header { display: flex; gap: 2mm; align-items: center; }
.logo { width: 6mm; height: 6mm; object-fit: contain; }
.school { font-size: 9px; font-weight: 700; color: #0d9488; }
.photo { width: 22mm; height: 26mm; object-fit: cover; margin: 1mm 0; border-radius: 1mm; }
.name { font-size: 11px; font-weight: 800; }
.meta { font-size: 6.5px; line-height: 1.4; }
.meta span { color: #64748b; }
.sig { position: absolute; right: 3mm; bottom: 3mm; width: 18mm; text-align: center; font-size: 5px; font-weight: 700; }
.sig img { display: block; width: 100%; height: 7mm; object-fit: contain; }`,
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
    { token: '{{student.registrationNumber}}', desc: 'Student registration no.' },
    { token: '{{student.udiseId}}', desc: 'Student UDISE ID' },
  ] },
  { group: 'School', tokens: [
    { token: '{{school.name}}', desc: 'School name' },
    { token: '{{school.address}}', desc: 'Full address' },
    { token: '{{school.phone}}', desc: 'Contact phone' },
    { token: '{{school.email}}', desc: 'Contact email' },
    { token: '{{school.website}}', desc: 'Website' },
    { token: '{{school.registrationNumber}}', desc: 'School registration no.' },
    { token: '{{school.udiseNumber}}', desc: 'School UDISE' },
    { token: '{{school.affiliationNumber}}', desc: 'Affiliation no.' },
    { token: '{{school.establishedYear}}', desc: 'ESTD' },
  ] },
  { group: 'Media', tokens: [
    { token: '{{photo}}', desc: 'Student photo (use in <img src>)' },
    { token: '{{logo}}', desc: 'School logo' },
    { token: '{{signature}}', desc: 'Principal signature' },
  ] },
]

export function TemplateEditorPage({ templateId }: { templateId?: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const currentSchool = useAppStore((s) => s.currentSchool)
  const isNew = !templateId

  const [draft, setDraft] = useState<DraftTemplate>(() => {
    if (!isNew) return EMPTY_DRAFT
    const easy = buildEasyTemplate(DEFAULT_EASY_TEMPLATE_SETTINGS)
    return {
      ...EMPTY_DRAFT,
      orientation: DEFAULT_EASY_TEMPLATE_SETTINGS.orientation,
      widthMm: DEFAULT_EASY_TEMPLATE_SETTINGS.widthMm,
      heightMm: DEFAULT_EASY_TEMPLATE_SETTINGS.heightMm,
      hasBackSide: DEFAULT_EASY_TEMPLATE_SETTINGS.hasBackSide,
      frontHtml: easy.frontHtml,
      frontCss: easy.frontCss,
      backHtml: easy.backHtml,
      backCss: easy.backCss,
    }
  })
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [side, setSide] = useState<Side>('front')
  const [legacyMode, setLegacyMode] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<EditorMode>(isNew ? 'easy' : 'advanced')
  const [easySettings, setEasySettings] = useState<EasyTemplateSettings>(DEFAULT_EASY_TEMPLATE_SETTINGS)

  const applyEasySettings = useCallback((nextSettings: EasyTemplateSettings) => {
    const easy = buildEasyTemplate(nextSettings)
    setEasySettings(nextSettings)
    setDraft((prev) => ({
      ...prev,
      orientation: nextSettings.orientation,
      widthMm: nextSettings.widthMm,
      heightMm: nextSettings.heightMm,
      hasBackSide: nextSettings.hasBackSide,
      frontHtml: easy.frontHtml,
      frontCss: easy.frontCss,
      backHtml: easy.backHtml,
      backCss: easy.backCss,
    }))
    if (!nextSettings.hasBackSide) setSide('front')
  }, [])

  useEffect(() => {
    if (isNew) return
    let alive = true

    const loadTemplate = async () => {
      setLoading(true)
      try {
        const res = await api.get<{ template: TemplateApiPayload }>(`/api/school/id-cards/templates/${templateId}`)
        if (!alive) return
        const t = res.template
        setLegacyMode(t.templateMode === 'element')
        setEditorMode('advanced')
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
      } catch (err) {
        if (!alive) return
        toast({
          variant: 'destructive',
          title: 'Could not load template',
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      } finally {
        if (alive) setLoading(false)
      }
    }

    void loadTemplate()

    return () => { alive = false }
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
    if (editorMode === 'easy') {
      applyEasySettings({
        ...easySettings,
        orientation: easySettings.orientation === 'portrait' ? 'landscape' : 'portrait',
        widthMm: easySettings.heightMm,
        heightMm: easySettings.widthMm,
      })
      return
    }
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
      setEditorMode('advanced')
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
        description="Use the easy designer for a clean printable card, or switch to HTML for full control."
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

      <Tabs value={editorMode} onValueChange={(value) => setEditorMode(value as EditorMode)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:w-[360px]">
          <TabsTrigger value="easy" className="gap-1.5">
            <Wand2 className="size-3.5" />
            Easy Designer
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-1.5">
            <Code className="size-3.5" />
            Advanced HTML
          </TabsTrigger>
        </TabsList>

        <TabsContent value="easy" className="mt-0">
          <EasyDesigner
            draft={draft}
            settings={easySettings}
            onDraftChange={setDraft}
            onSettingsChange={applyEasySettings}
            renderTemplate={renderTpl}
            currentSchoolLogo={currentSchool?.logo || null}
          />
        </TabsContent>

        <TabsContent value="advanced" className="mt-0">
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
        </TabsContent>
      </Tabs>

      <PresetGalleryDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        onApply={applyPreset}
      />
    </div>
  )
}

function EasyDesigner({
  draft,
  settings,
  onDraftChange,
  onSettingsChange,
  renderTemplate,
  currentSchoolLogo,
}: {
  draft: DraftTemplate
  settings: EasyTemplateSettings
  onDraftChange: (next: DraftTemplate | ((prev: DraftTemplate) => DraftTemplate)) => void
  onSettingsChange: (next: EasyTemplateSettings) => void
  renderTemplate: HtmlRenderTemplate
  currentSchoolLogo: string | null
}) {
  const updateSettings = (patch: Partial<EasyTemplateSettings>) => {
    onSettingsChange({ ...settings, ...patch })
  }

  const updateField = (field: EasyFieldKey, checked: boolean) => {
    onSettingsChange({
      ...settings,
      fields: { ...settings.fields, [field]: checked },
    })
  }

  const setSizePreset = (preset: string) => {
    if (preset === 'portrait') {
      updateSettings({ orientation: 'portrait', widthMm: 54, heightMm: 86 })
      return
    }
    if (preset === 'landscape') {
      updateSettings({ orientation: 'landscape', widthMm: 86, heightMm: 54 })
      return
    }
    updateSettings({ orientation: 'portrait', widthMm: 86, heightMm: 135 })
  }

  const previewScale = getDesignerPreviewScale(settings.widthMm, settings.heightMm)
  const backPreviewScale = Math.max(0.58, previewScale * 0.78)
  const selectedFieldCount = EASY_TEMPLATE_FIELDS.filter((field) => settings.fields[field.key]).length
  const isSmallCardCrowded = settings.heightMm <= 90 && selectedFieldCount > 5 && !settings.hasBackSide

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <div className="space-y-3">
        <Card>
          <CardContent className="space-y-3 p-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="space-y-1">
                <Label className="text-[11px]">Template name</Label>
                <Input
                  value={draft.name}
                  onChange={(event) => onDraftChange((prev) => ({ ...prev, name: event.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Card size</Label>
                <Select
                  value={settings.widthMm === 86 && settings.heightMm === 54 ? 'landscape' : settings.widthMm === 86 ? 'large' : 'portrait'}
                  onValueChange={setSizePreset}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">CR80 Portrait - 54 x 86 mm</SelectItem>
                    <SelectItem value="landscape">CR80 Landscape - 86 x 54 mm</SelectItem>
                    <SelectItem value="large">Large Portrait - 86 x 135 mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Description</Label>
              <Textarea
                value={draft.description}
                onChange={(event) => onDraftChange((prev) => ({ ...prev, description: event.target.value }))}
                className="min-h-[48px] text-xs"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <Wand2 className="size-3.5" />
              Layout
            </div>
            <div className="grid gap-2">
              {EASY_TEMPLATE_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => updateSettings({ styleId: style.id })}
                  className={[
                    'rounded-md border p-2 text-left transition hover:border-primary/50',
                    settings.styleId === style.id ? 'border-primary bg-primary/5' : 'border-border',
                  ].join(' ')}
                >
                  <div className="text-xs font-semibold">{style.name}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{style.description}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <Palette className="size-3.5" />
              Color
            </div>
            <div className="grid grid-cols-2 gap-2">
              {EASY_TEMPLATE_PALETTES.map((palette) => (
                <button
                  key={palette.id}
                  type="button"
                  onClick={() => updateSettings({ paletteId: palette.id })}
                  className={[
                    'flex items-center gap-2 rounded-md border p-2 text-left text-xs transition hover:border-primary/50',
                    settings.paletteId === palette.id ? 'border-primary bg-primary/5' : 'border-border',
                  ].join(' ')}
                >
                  <span
                    className="size-5 rounded-full border"
                    style={{ background: palette.primary, borderColor: palette.accent }}
                  />
                  <span className="font-medium">{palette.name}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <Card>
          <CardContent className="grid gap-4 p-3 lg:grid-cols-[1fr_260px]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Card fields</div>
                  <div className="text-[11px] text-muted-foreground">Tick only the details you want on the card.</div>
                </div>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {settings.widthMm}x{settings.heightMm}mm
                </Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {EASY_TEMPLATE_FIELDS.map((field) => (
                  <label
                    key={field.key}
                    className="flex items-center gap-2 rounded-md border p-2 text-xs"
                  >
                    <Checkbox
                      checked={settings.fields[field.key]}
                      onCheckedChange={(checked) => updateField(field.key, checked === true)}
                    />
                    <span className="font-medium">{field.label}</span>
                  </label>
                ))}
              </div>

              {isSmallCardCrowded && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                  Too many fields on one small side can crowd the card. Enable Back side or remove long fields like Address.
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex items-center gap-2 rounded-md border p-2 text-xs">
                  <Checkbox
                    checked={settings.photoShape === 'circle'}
                    onCheckedChange={(checked) => updateSettings({ photoShape: checked ? 'circle' : 'rounded' })}
                  />
                  <span className="font-medium">Round photo</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border p-2 text-xs">
                  <Checkbox
                    checked={settings.showSignature}
                    onCheckedChange={(checked) => updateSettings({ showSignature: checked === true })}
                  />
                  <span className="font-medium">Signature</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border p-2 text-xs">
                  <Checkbox
                    checked={settings.showQr}
                    onCheckedChange={(checked) => updateSettings({ showQr: checked === true })}
                  />
                  <span className="font-medium">QR box</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border p-2 text-xs">
                  <Checkbox
                    checked={settings.hasBackSide}
                    onCheckedChange={(checked) => updateSettings({ hasBackSide: checked === true })}
                  />
                  <span className="font-medium">Back side</span>
                </label>
              </div>

              <div className="flex items-center justify-between rounded-md border p-2">
                <Label className="text-xs">Default template</Label>
                <Switch
                  checked={draft.isDefault}
                  onCheckedChange={(checked) => onDraftChange((prev) => ({ ...prev, isDefault: checked }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-2">
                <Label className="text-xs">Active</Label>
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(checked) => onDraftChange((prev) => ({ ...prev, isActive: checked }))}
                />
              </div>
            </div>

            <div className="rounded-md border bg-slate-100 p-3">
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase text-muted-foreground">
                <span>Live Preview</span>
                <IdCard className="size-3.5" />
              </div>
              <div className="flex min-h-[430px] items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-300 bg-white p-4 shadow-inner">
                <div className="pointer-events-none">
                  <IdCardHtmlRenderer
                    template={renderTemplate}
                    card={DEMO_HTML_CARD}
                    schoolLogo={currentSchoolLogo}
                    scale={previewScale}
                    side="front"
                  />
                </div>
              </div>
              {settings.hasBackSide && (
                <div className="mt-3 flex justify-center">
                  <div className="pointer-events-none">
                    <IdCardHtmlRenderer
                      template={renderTemplate}
                      card={DEMO_HTML_CARD}
                      schoolLogo={currentSchoolLogo}
                      scale={backPreviewScale}
                      side="back"
                    />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function getDesignerPreviewScale(widthMm: number, heightMm: number) {
  const maxWidthPx = 220
  const maxHeightPx = 390
  const mmToPx = 3.78
  const fitWidth = maxWidthPx / (widthMm * mmToPx)
  const fitHeight = maxHeightPx / (heightMm * mmToPx)
  return Math.min(1.55, Math.max(0.72, Math.min(fitWidth, fitHeight)))
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
