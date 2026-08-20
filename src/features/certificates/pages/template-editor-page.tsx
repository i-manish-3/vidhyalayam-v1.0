'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { GradientHero, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Save, LayoutTemplate, Braces, Info, Settings2, Eye, Hash, Type, Tag, FileCode2 } from 'lucide-react'
import {
  CERTIFICATE_TYPES,
  CERTIFICATE_PLACEHOLDERS,
  defaultBodyForType,
  type CertificateSnapshot,
} from '../lib/certificate-types'
import { CertificatePreview } from '../components/certificate-preview'

interface TemplateData {
  id?: string
  type: string
  name: string
  description: string
  numberPrefix: string
  bodyHtml: string
  isDefault: boolean
  isActive: boolean
}

const SAMPLE_SNAPSHOT: CertificateSnapshot = {
  issuedAt: new Date().toISOString(),
  student: {
    id: 'sample',
    firstName: 'Aarav',
    lastName: 'Sharma',
    fullName: 'Aarav Sharma',
    admissionNumber: 'STD-2025-001',
    rollNumber: '12',
    className: 'Class 8',
    sectionName: ', Section A',
    academicYear: '2025-2026',
    dateOfBirth: '12 Aug 2012',
    gender: 'Male',
    nationality: 'Indian',
    religion: 'Hindu',
    category: 'General',
    motherTongue: 'Hindi',
    bloodGroup: 'B+',
    address: '12, Gandhi Nagar',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110001',
    dateOfAdmission: '02 Apr 2019',
    previousSchool: 'ABC Public School',
    previousClass: 'Class 4',
    fatherName: 'Ramesh Sharma',
    motherName: 'Sunita Sharma',
    parentPhone: '9876543210',
  },
  school: {
    id: 'sample-school',
    name: 'Vidyalayam Public School',
    address: '1, Main Road',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110001',
    phone: '011-12345678',
    email: 'office@vidyalayam.edu',
    website: 'www.vidyalayam.edu',
    board: 'CBSE',
    registrationNumber: 'REG-001',
    affiliationNumber: 'AFF-001',
    udiseNumber: 'UDISE-001',
    principalName: 'Dr. Meera Krishnan',
    trustName: 'Vidyalayam Educational Trust',
    academicYear: '2025-2026',
  },
}

export function CertificateTemplateEditorPage({ templateId }: { templateId?: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const params = useParams()
  const isEdit = !!templateId || !!params.id
  const id = templateId || (typeof params.id === 'string' ? params.id : '')

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<TemplateData>({
    type: 'tc',
    name: '',
    description: '',
    numberPrefix: 'CERT',
    bodyHtml: defaultBodyForType('tc', true),
    isDefault: false,
    isActive: true,
  })

  useEffect(() => {
    if (!isEdit) return
    api
      .get<{ template: TemplateData }>(`/api/school/certificates/templates/${id}`)
      .then((res) => {
        setForm({
          type: res.template.type,
          name: res.template.name,
          description: res.template.description || '',
          numberPrefix: res.template.numberPrefix,
          bodyHtml: res.template.bodyHtml,
          isDefault: res.template.isDefault,
          isActive: res.template.isActive,
        })
      })
      .catch((err) => {
        toast({ title: 'Could not load template', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
        router.push('/certificates/templates')
      })
      .finally(() => setLoading(false))
  }, [isEdit, id, router, toast])

  function set<K extends keyof TemplateData>(key: K, value: TemplateData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function changeType(value: string) {
    const def = defaultBodyForType(value, true)
    setForm((f) => ({
      ...f,
      type: value,
      numberPrefix: f.numberPrefix === 'CERT' ? certificatePrefixFor(value) : f.numberPrefix,
      bodyHtml: f.bodyHtml === defaultBodyForType(f.type, true) ? def : f.bodyHtml,
    }))
  }

  function insertPlaceholder(token: string) {
    const el = document.getElementById('certificate-body') as HTMLTextAreaElement | null
    const start = el?.selectionStart ?? form.bodyHtml.length
    const end = el?.selectionEnd ?? form.bodyHtml.length
    const next = form.bodyHtml.slice(0, start) + token + form.bodyHtml.slice(end)
    set('bodyHtml', next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast({ title: 'Template name is required', variant: 'destructive' })
      return
    }
    if (!form.bodyHtml.trim()) {
      toast({ title: 'Certificate body is required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        type: form.type,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        numberPrefix: form.numberPrefix.trim(),
        bodyHtml: form.bodyHtml,
        isDefault: form.isDefault,
        isActive: form.isActive,
      }
      if (isEdit) {
        await api.patch(`/api/school/certificates/templates/${id}`, payload)
        toast({ title: 'Template updated' })
      } else {
        await api.post('/api/school/certificates/templates', payload)
        toast({ title: 'Template created' })
      }
      router.push('/certificates/templates')
    } catch (err) {
      toast({ title: isEdit ? 'Update failed' : 'Create failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const previewBody = useMemo(() => form.bodyHtml, [form.bodyHtml])

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      <GradientHero
        icon={LayoutTemplate}
        title={isEdit ? 'Edit Template' : 'New Template'}
        badge={isEdit ? 'Editing' : 'Draft'}
        description="Compose the certificate body with {{placeholders}} — they are replaced with the student's data at issue time."
        primaryAction={{
          label: 'Save Template',
          icon: Save,
          onClick: handleSave,
          disabled: saving,
        }}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
            <div className="flex items-center gap-3 border-b border-current/10 bg-gradient-to-r from-sky-500/[0.08] via-white/40 to-cyan-500/[0.08] p-3.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm">
                <Settings2 className="size-4 text-white" />
              </span>
              <div>
                <h3 className="text-sm font-semibold leading-tight">Template details</h3>
                <p className="text-[10px] text-muted-foreground">Type, name, numbering and visibility.</p>
              </div>
            </div>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Certificate type *</Label>
                  <Select value={form.type} onValueChange={changeType}>
                    <SelectTrigger
                      leadingIcon={<Type className="size-3.5 text-white" />}
                      leadingIconClassName="from-sky-500 to-cyan-600"
                      className="h-9 w-full border-sky-200 bg-white dark:border-sky-500/25 dark:bg-input/30"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CERTIFICATE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Template name *</Label>
                  <Input
                    className="h-9 border-sky-200 bg-white shadow-sm focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-input/30"
                    placeholder="e.g. TC — Standard"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Hash className="size-3 text-muted-foreground" />
                    <Label>Number prefix</Label>
                  </div>
                  <Input
                    className="h-9 border-sky-200 bg-white shadow-sm focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-input/30"
                    placeholder="CERT"
                    value={form.numberPrefix}
                    onChange={(e) => set('numberPrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Numbers are issued as <span className="font-mono">{form.numberPrefix || 'CERT'}-{new Date().getFullYear()}-0001</span>
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Tag className="size-3 text-muted-foreground" />
                    <Label>Description</Label>
                  </div>
                  <Input
                    className="h-9 border-sky-200 bg-white shadow-sm focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-input/30"
                    placeholder="Internal note"
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox id="is-default" checked={form.isDefault} onCheckedChange={(v) => set('isDefault', v === true)} />
                  <Label htmlFor="is-default" className="text-sm">Set as default for this type</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="is-active" checked={form.isActive} onCheckedChange={(v) => set('isActive', v === true)} />
                  <Label htmlFor="is-active" className="text-sm">Active</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 py-0 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10">
            <div className="flex items-center gap-3 border-b border-current/10 bg-gradient-to-r from-violet-500/[0.08] via-white/40 to-purple-500/[0.08] p-3.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
                <FileCode2 className="size-4 text-white" />
              </span>
              <div>
                <h3 className="text-sm font-semibold leading-tight">Certificate body</h3>
                <p className="text-[10px] text-muted-foreground">HTML with {'{{placeholders}}'}. Sanitized on save.</p>
              </div>
              <Badge variant="outline" className="ml-auto shrink-0 gap-1 border-violet-200 bg-violet-50 text-violet-700 text-[10px] dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300">
                <Braces className="size-3" /> HTML
              </Badge>
            </div>
            <CardContent className="space-y-3 p-4">
              <Textarea
                id="certificate-body"
                rows={16}
                className="border-violet-200 bg-white font-mono text-xs leading-relaxed shadow-sm focus-visible:border-violet-400 focus-visible:ring-violet-400/20 dark:border-violet-500/25 dark:bg-input/30"
                value={form.bodyHtml}
                onChange={(e) => set('bodyHtml', e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5">
                {CERTIFICATE_PLACEHOLDERS.map((p) => (
                  <Button
                    key={p.token}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 border-violet-200 bg-violet-50/70 px-2 font-mono text-[10px] text-violet-700 hover:bg-violet-100 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300"
                    title={p.label}
                    onClick={() => insertPlaceholder(p.token)}
                  >
                    {p.token}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="gap-0 overflow-hidden border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 py-0 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
            <div className="flex items-center gap-3 border-b border-current/10 bg-gradient-to-r from-emerald-500/[0.08] via-white/40 to-teal-500/[0.08] p-3.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                <Eye className="size-4 text-white" />
              </span>
              <div>
                <h3 className="text-sm font-semibold leading-tight">Live preview</h3>
                <p className="text-[10px] text-muted-foreground">Sample student data — updates as you type.</p>
              </div>
            </div>
            <CardContent className="space-y-3 p-4">
              <CertificatePreview
                bodyHtml={previewBody}
                snapshot={SAMPLE_SNAPSHOT}
                certificateNumber={`${form.numberPrefix || 'CERT'}-${new Date().getFullYear()}-0001`}
                purpose="bank loan"
              />
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <p>
                  Preview uses sample data. Values are HTML-escaped before injection, and scripts/event handlers are
                  stripped on save.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {saving && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Saving template…
        </div>
      )}
    </div>
  )
}

function certificatePrefixFor(type: string): string {
  return CERTIFICATE_TYPES.find((t) => t.value === type)?.numberPrefix || 'CERT'
}