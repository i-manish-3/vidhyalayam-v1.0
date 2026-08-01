'use client'

import { useEffect, useRef, useState } from 'react'
import { Banknote, Calendar, CheckCircle2, Loader2, Lock, MessageCircle, QrCode, Save, Sparkles, Unplug } from 'lucide-react'
import { GradientHero, GradientDialogHeader } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'

type ConfigState = {
  dueDay: number
  slipNumberFormat: string
  lateFeeEnabled: boolean
  lateFeeType: 'FLAT' | 'PER_DAY'
  lateFeeAmount: number
  lateFeeGraceDays: number
  whatsappEnabled: boolean
  whatsappProvider: 'BAILEYS' | 'META_CLOUD' | null
  metaPhoneNumberId: string
  metaAccessToken: string // local-only: write-only entry; '__UNCHANGED__' if unedited
  metaAccessTokenMask: string
  metaAccessTokenSet: boolean
  metaBusinessId: string
  metaTemplateName: string
  baileysConnected: boolean
  baileysPhoneNumber: string
}

const UNCHANGED_TOKEN = '__UNCHANGED__'

const DEFAULTS: ConfigState = {
  dueDay: 10,
  slipNumberFormat: 'DS/{academicYear}/{month}/{sequence}',
  lateFeeEnabled: false,
  lateFeeType: 'FLAT',
  lateFeeAmount: 0,
  lateFeeGraceDays: 0,
  whatsappEnabled: false,
  whatsappProvider: null,
  metaPhoneNumberId: '',
  metaAccessToken: UNCHANGED_TOKEN,
  metaAccessTokenMask: '',
  metaAccessTokenSet: false,
  metaBusinessId: '',
  metaTemplateName: '',
  baileysConnected: false,
  baileysPhoneNumber: '',
}

export function FeeDemandConfigPage() {
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission(PERMISSIONS.SETTINGS_UPDATE)
  const [config, setConfig] = useState<ConfigState>(DEFAULTS)
  const [original, setOriginal] = useState<ConfigState>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const data = await api.get<{ config: Partial<ConfigState> }>('/api/school/fees/demand-config')
        if (!active) return
        const merged: ConfigState = {
          ...DEFAULTS,
          ...data.config,
          metaPhoneNumberId: data.config.metaPhoneNumberId || '',
          metaAccessToken: UNCHANGED_TOKEN,
          metaBusinessId: data.config.metaBusinessId || '',
          metaTemplateName: data.config.metaTemplateName || '',
          baileysPhoneNumber: data.config.baileysPhoneNumber || '',
        }
        setConfig(merged)
        setOriginal(merged)
      } catch (err) {
        toast({
          title: "Couldn't load fee demand settings",
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        })
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [toast])

  const hasChanges =
    config.dueDay !== original.dueDay ||
    config.slipNumberFormat !== original.slipNumberFormat ||
    config.lateFeeEnabled !== original.lateFeeEnabled ||
    config.lateFeeType !== original.lateFeeType ||
    config.lateFeeAmount !== original.lateFeeAmount ||
    config.lateFeeGraceDays !== original.lateFeeGraceDays ||
    config.whatsappEnabled !== original.whatsappEnabled ||
    config.whatsappProvider !== original.whatsappProvider ||
    config.metaPhoneNumberId !== original.metaPhoneNumberId ||
    config.metaBusinessId !== original.metaBusinessId ||
    config.metaTemplateName !== original.metaTemplateName ||
    config.metaAccessToken !== UNCHANGED_TOKEN

  const save = async () => {
    if (config.dueDay < 1 || config.dueDay > 28) {
      toast({
        title: 'Invalid due day',
        description: 'Due day must be between 1 and 28.',
        variant: 'destructive',
      })
      return
    }
    if (config.whatsappEnabled && !config.whatsappProvider) {
      toast({
        title: 'Choose a WhatsApp provider',
        description: 'Pick Meta Cloud (or Baileys when available) before enabling WhatsApp delivery.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        dueDay: config.dueDay,
        slipNumberFormat: config.slipNumberFormat,
        lateFeeEnabled: config.lateFeeEnabled,
        lateFeeType: config.lateFeeType,
        lateFeeAmount: config.lateFeeAmount,
        lateFeeGraceDays: config.lateFeeGraceDays,
        whatsappEnabled: config.whatsappEnabled,
        whatsappProvider: config.whatsappProvider,
        metaPhoneNumberId: config.metaPhoneNumberId,
        metaBusinessId: config.metaBusinessId,
        metaTemplateName: config.metaTemplateName,
      }
      // Only ship the access token if the admin actually edited it; otherwise
      // the API treats __UNCHANGED__ as "leave token alone" (Phase 1 contract).
      if (config.metaAccessToken !== UNCHANGED_TOKEN) {
        payload.metaAccessToken = config.metaAccessToken
      }
      const data = await api.patch<{ config: Partial<ConfigState> }>(
        '/api/school/fees/demand-config',
        payload,
      )
      const merged: ConfigState = {
        ...DEFAULTS,
        ...data.config,
        metaPhoneNumberId: data.config.metaPhoneNumberId || '',
        metaAccessToken: UNCHANGED_TOKEN,
        metaBusinessId: data.config.metaBusinessId || '',
        metaTemplateName: data.config.metaTemplateName || '',
        baileysPhoneNumber: data.config.baileysPhoneNumber || '',
      }
      setConfig(merged)
      setOriginal(merged)
      toast({ title: 'Settings saved', description: 'Fee demand preferences updated.' })
    } catch (err) {
      toast({
        title: "Couldn't save settings",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <GradientHero
        icon={Banknote}
        title="Fee Demand & Reminders"
        description="Configure when monthly demand slips are due, late fee policy, and WhatsApp delivery for parents."
        primaryAction={{ label: 'Save Changes', icon: Save, onClick: save, disabled: !hasChanges || saving || !canManage }}
      />

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 h-11 p-1 bg-muted/60">
          <TabsTrigger value="general" className="gap-1.5 data-[state=active]:shadow-sm">
            <Calendar className="size-3.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="late-fee" className="gap-1.5 data-[state=active]:shadow-sm">
            <Banknote className="size-3.5" />
            <span className="hidden sm:inline">Late Fine</span>
            <span className="sm:hidden">Fine</span>
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-1.5 data-[state=active]:shadow-sm">
            <MessageCircle className="size-3.5" />
            WhatsApp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab config={config} setConfig={setConfig} />
        </TabsContent>

        <TabsContent value="late-fee">
          <LateFeeTab config={config} />
        </TabsContent>

        <TabsContent value="whatsapp">
          <WhatsAppTab config={config} setConfig={setConfig} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function GeneralTab({
  config,
  setConfig,
}: {
  config: ConfigState
  setConfig: (next: ConfigState) => void
}) {
  return (
    <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50/60 via-card to-violet-50/60 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10">
      <CardHeader className="border-b border-current/10 px-4 py-3">
        <CardTitle className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
            <Sparkles className="size-4" />
          </span>
          Monthly Demand Slip
        </CardTitle>
        <CardDescription>
          Each month a demand slip will be generated for every active student. The slip totals current month fees plus any unpaid dues from previous months.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="due-day">Due Day of Month</Label>
            <Input
              id="due-day"
              type="number"
              min={1}
              max={28}
              value={config.dueDay}
              onChange={(e) => setConfig({ ...config, dueDay: Number(e.target.value) || 10 })}
            />
            <p className="text-xs text-muted-foreground">
              Parents receive the slip on the 1st and have until this day to pay. Allowed range: 1-28.
            </p>
          </div>
          <div className="rounded-xl border border-sky-200/80 bg-gradient-to-r from-sky-50/70 via-white to-violet-50/70 p-3 text-sm shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
            <p className="font-medium">Sample timeline</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>• <strong>1st</strong> — admin generates slip for the month</li>
              <li>• Slip shows up on parent portal + WhatsApp (when enabled)</li>
              <li>• <strong>{config.dueDay}{getDaySuffix(config.dueDay)}</strong> — payment due date</li>
              <li>• After due date — late fine kicks in (when enabled)</li>
            </ul>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="slip-format">Slip Number Format</Label>
          <Input
            id="slip-format"
            value={config.slipNumberFormat}
            onChange={(e) => setConfig({ ...config, slipNumberFormat: e.target.value })}
            placeholder="DS/{academicYear}/{month}/{sequence}"
          />
          <p className="text-xs text-muted-foreground">
            Available variables: <code className="rounded bg-muted px-1 py-0.5">{'{academicYear}'}</code>, <code className="rounded bg-muted px-1 py-0.5">{'{month}'}</code>, <code className="rounded bg-muted px-1 py-0.5">{'{year}'}</code>, <code className="rounded bg-muted px-1 py-0.5">{'{sequence}'}</code>
          </p>
          <div className="rounded-md border border-sky-200/80 bg-gradient-to-r from-sky-50/70 via-white to-violet-50/70 p-2 text-xs shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
            <span className="text-muted-foreground">Preview: </span>
            <span className="font-mono">
              {config.slipNumberFormat
                .replace('{academicYear}', '2026-2027')
                .replace('{month}', 'MAY')
                .replace('{year}', '2026')
                .replace('{sequence}', '00001')}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function LateFeeTab({ config }: { config: ConfigState }) {
  return (
    <Card className="gap-0 overflow-hidden border-amber-200/80 bg-gradient-to-br from-amber-50/60 via-card to-orange-50/60 py-0 shadow-sm dark:border-amber-500/25 dark:from-amber-500/10 dark:via-card dark:to-orange-500/10">
      <CardHeader className="border-b border-current/10 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
                <Banknote className="size-4" />
              </span>
              Late Fine Policy
            </CardTitle>
            <CardDescription>
              When the demand slip due date passes, an automatic late fine can be added to the next slip.
            </CardDescription>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <Lock className="size-3" />
            Coming soon
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-dashed border-amber-200/80 bg-gradient-to-r from-amber-50/70 via-white to-orange-50/70 p-3 text-xs text-muted-foreground shadow-sm dark:border-amber-500/25 dark:from-amber-500/12 dark:via-card dark:to-orange-500/10">
          Late fine collection will activate in a future release. The fields below are previewed so you can see the planned options.
        </div>

        <fieldset disabled className="space-y-4 opacity-60">
          <div className="flex items-center justify-between rounded-md border border-amber-200/80 bg-gradient-to-r from-amber-50/70 via-white to-orange-50/70 px-3 py-2 shadow-sm dark:border-amber-500/25 dark:from-amber-500/12 dark:via-card dark:to-orange-500/10">
            <Label htmlFor="late-fee-enabled" className="text-sm">Charge late fine after due date</Label>
            <Switch id="late-fee-enabled" checked={config.lateFeeEnabled} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Input value={config.lateFeeType === 'FLAT' ? 'Flat amount' : 'Per day'} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input type="number" value={config.lateFeeAmount} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Grace days</Label>
              <Input type="number" value={config.lateFeeGraceDays} readOnly />
            </div>
          </div>
        </fieldset>
      </CardContent>
    </Card>
  )
}

function WhatsAppTab({
  config,
  setConfig,
}: {
  config: ConfigState
  setConfig: (next: ConfigState) => void
}) {
  const { toast } = useToast()
  const [testPhone, setTestPhone] = useState('')
  const [testing, setTesting] = useState(false)
  const [editingToken, setEditingToken] = useState(false)

  const runTest = async () => {
    if (!testPhone.trim()) {
      toast({ title: 'Enter a phone number', description: 'Provide a number with country code, e.g. +919876543210.', variant: 'destructive' })
      return
    }
    if (config.metaAccessToken !== UNCHANGED_TOKEN) {
      toast({ title: 'Save changes first', description: 'You\'ve edited the access token but not saved yet. Save settings, then test.', variant: 'destructive' })
      return
    }
    setTesting(true)
    try {
      const res = await api.post<{ success: boolean; recipient: string; messageId: string }>(
        '/api/school/fees/demand-config/test-whatsapp',
        { toPhone: testPhone.trim() }
      )
      toast({ title: 'Test message sent', description: `Sent to ${res.recipient} (msg ${res.messageId.slice(-8)}).` })
    } catch (err) {
      toast({
        title: 'Test failed',
        description: err instanceof Error ? err.message : 'Check phone number and credentials.',
        variant: 'destructive',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card className="gap-0 overflow-hidden border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 via-card to-cyan-50/60 py-0 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/10 dark:via-card dark:to-cyan-500/10">
      <CardHeader className="border-b border-current/10 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 text-white shadow-sm">
                <MessageCircle className="size-4" />
              </span>
              WhatsApp Delivery
            </CardTitle>
            <CardDescription>
              Send each demand slip to parents on WhatsApp from your school&apos;s own number.
            </CardDescription>
          </div>
          {!config.whatsappEnabled && (
            <Badge variant="outline" className="gap-1.5">
              <Lock className="size-3" />
              Inactive
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border border-emerald-200/80 bg-gradient-to-r from-emerald-50/70 via-white to-cyan-50/70 px-3 py-2 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-cyan-500/10">
          <div>
            <Label htmlFor="wa-enabled" className="text-sm">Enable WhatsApp delivery</Label>
            <p className="text-xs text-muted-foreground">When on, the slip page shows a Send button next to each slip.</p>
          </div>
          <Switch
            id="wa-enabled"
            checked={config.whatsappEnabled}
            onCheckedChange={(value) => setConfig({ ...config, whatsappEnabled: value })}
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Provider</Label>
          <RadioGroup
            value={config.whatsappProvider || ''}
            onValueChange={(value) => setConfig({ ...config, whatsappProvider: value as 'META_CLOUD' | 'BAILEYS' })}
            className="mt-2 gap-3"
          >
            <Label
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/70 via-white to-cyan-50/70 p-3 shadow-sm transition-colors hover:border-emerald-400/60 dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-cyan-500/10"
              htmlFor="prov-meta"
            >
              <RadioGroupItem value="META_CLOUD" id="prov-meta" className="mt-1" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Meta WhatsApp Cloud API</p>
                <p className="text-xs text-muted-foreground">
                  Official business API with 1,000 free conversations per number per month. Verified sender, no ban risk.
                </p>
              </div>
            </Label>
            <Label
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/70 via-white to-cyan-50/70 p-3 shadow-sm transition-colors hover:border-emerald-400/60 dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-cyan-500/10"
              htmlFor="prov-baileys"
            >
              <RadioGroupItem value="BAILEYS" id="prov-baileys" className="mt-1" />
              <div className="space-y-1 flex-1">
                <p className="text-sm font-medium">Quick Setup (QR scan)</p>
                <p className="text-xs text-muted-foreground">
                  Scan a QR with your school&apos;s WhatsApp number. Free, no monthly limits. Best for under 200 sends per day &mdash; mass blasts can trigger a number ban.
                </p>
              </div>
            </Label>
          </RadioGroup>
        </div>

        {config.whatsappProvider === 'BAILEYS' && (
          <BaileysConnectBlock
            connected={config.baileysConnected}
            phoneNumber={config.baileysPhoneNumber}
            onChange={(next) => setConfig({
              ...config,
              baileysConnected: next.connected,
              baileysPhoneNumber: next.phoneNumber || '',
            })}
          />
        )}

        {config.whatsappProvider === 'META_CLOUD' && (
          <div className="space-y-3 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/70 via-white to-cyan-50/70 p-3 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-cyan-500/10">
            <p className="text-xs text-muted-foreground">
              Get these from your <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="underline">Meta Developer App</a> &rarr; WhatsApp &rarr; API Setup.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="meta-phone-id" className="text-xs">Phone Number ID</Label>
                <Input
                  id="meta-phone-id"
                  value={config.metaPhoneNumberId}
                  onChange={(e) => setConfig({ ...config, metaPhoneNumberId: e.target.value })}
                  placeholder="e.g. 123456789012345"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meta-business-id" className="text-xs">Business Account ID (optional)</Label>
                <Input
                  id="meta-business-id"
                  value={config.metaBusinessId}
                  onChange={(e) => setConfig({ ...config, metaBusinessId: e.target.value })}
                  placeholder="optional"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meta-token" className="text-xs">Access Token</Label>
              {!editingToken && config.metaAccessTokenSet && config.metaAccessToken === UNCHANGED_TOKEN ? (
                <div className="flex items-center justify-between rounded-md border border-emerald-200/80 bg-gradient-to-r from-emerald-50/70 via-white to-cyan-50/70 px-3 py-2 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-cyan-500/10">
                  <div className="text-xs">
                    <span className="text-muted-foreground">Configured · </span>
                    <span className="font-mono">{config.metaAccessTokenMask}</span>
                  </div>
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingToken(true); setConfig({ ...config, metaAccessToken: '' }) }}>
                    Replace
                  </Button>
                </div>
              ) : (
                <Input
                  id="meta-token"
                  type="password"
                  value={config.metaAccessToken === UNCHANGED_TOKEN ? '' : config.metaAccessToken}
                  onChange={(e) => setConfig({ ...config, metaAccessToken: e.target.value })}
                  placeholder="Paste the access token from Meta"
                  autoComplete="off"
                />
              )}
              <p className="text-xs text-muted-foreground">Stored encrypted server-side; never visible after save.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meta-template" className="text-xs">Template Name (optional)</Label>
              <Input
                id="meta-template"
                value={config.metaTemplateName}
                onChange={(e) => setConfig({ ...config, metaTemplateName: e.target.value })}
                placeholder="e.g. fee_demand_slip_v1"
              />
              <p className="text-xs text-muted-foreground">Required for cold outreach outside Meta&apos;s 24h customer-care window.</p>
            </div>
            <div className="rounded-md border border-emerald-200/80 bg-gradient-to-r from-emerald-50/70 via-white to-cyan-50/70 p-3 shadow-sm space-y-2 dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-cyan-500/10">
              <Label htmlFor="test-phone" className="text-xs font-medium">Test connection</Label>
              <div className="flex gap-2">
                <Input
                  id="test-phone"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+919876543210"
                  className="h-9"
                />
                <Button type="button" onClick={runTest} disabled={testing || !canManage} className="shrink-0">
                  {testing ? <Loader2 className="size-4 animate-spin" /> : 'Send Test'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Sends a sample message to confirm credentials work. Number must be a verified test recipient on your Meta sandbox, or any number once your business is approved.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function getDaySuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th'
  switch (day % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

interface BaileysStatus {
  qrDataUrl: string | null
  connected: boolean
  phoneNumber: string | null
}

function BaileysConnectBlock({
  connected,
  phoneNumber,
  onChange,
}: {
  connected: boolean
  phoneNumber: string
  onChange: (next: { connected: boolean; phoneNumber: string | null }) => void
}) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [success, setSuccess] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function stopPolling() {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current)
      pollTimer.current = null
    }
    setPolling(false)
  }

  async function pollOnce(): Promise<BaileysStatus | null> {
    try {
      const res = await api.post<BaileysStatus>('/api/school/fees/demand-config/baileys-connect', {})
      return res
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start QR'
      toast({ title: 'Connect failed', description: msg, variant: 'destructive' })
      return null
    }
  }

  function schedulePoll() {
    pollTimer.current = setTimeout(async () => {
      const r = await pollOnce()
      if (!r) { stopPolling(); return }
      setQrDataUrl(r.qrDataUrl)
      if (r.connected) {
        setSuccess(true)
        onChange({ connected: true, phoneNumber: r.phoneNumber })
        stopPolling()
        setTimeout(() => { setOpen(false); setSuccess(false); setQrDataUrl(null) }, 1500)
        return
      }
      schedulePoll()
    }, 2000)
  }

  async function handleConnectClick() {
    setOpen(true)
    setSuccess(false)
    setPolling(true)
    const r = await pollOnce()
    if (!r) { stopPolling(); return }
    setQrDataUrl(r.qrDataUrl)
    if (r.connected) {
      setSuccess(true)
      onChange({ connected: true, phoneNumber: r.phoneNumber })
      stopPolling()
      setTimeout(() => { setOpen(false); setSuccess(false); setQrDataUrl(null) }, 1500)
      return
    }
    schedulePoll()
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await api.delete('/api/school/fees/demand-config/baileys-connect')
      onChange({ connected: false, phoneNumber: null })
      toast({ title: 'Disconnected' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed'
      toast({ title: 'Disconnect failed', description: msg, variant: 'destructive' })
    } finally {
      setDisconnecting(false)
    }
  }

  useEffect(() => () => stopPolling(), [])

  return (
    <div className="space-y-3 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/70 via-white to-cyan-50/70 p-3 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-cyan-500/10">
      {connected ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="size-4 text-emerald-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Connected</p>
              <p className="text-xs text-muted-foreground">
                Sending as <span className="font-mono">{phoneNumber || 'unknown'}</span>
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={handleDisconnect}
            disabled={disconnecting || !canManage}
          >
            {disconnecting ? <Loader2 className="size-3 animate-spin" /> : <Unplug className="size-3" />}
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <QrCode className="size-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm font-medium">Not connected</p>
              <p className="text-xs text-muted-foreground">
                Scan a QR with the school&apos;s WhatsApp number to start sending demand slips.
              </p>
            </div>
          </div>
          <Button type="button" size="sm" className="h-8 text-xs" onClick={handleConnectClick} disabled={!canManage}>
            <QrCode className="size-3" />
            Connect via QR
          </Button>
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) { stopPolling(); setQrDataUrl(null); setSuccess(false) }
        }}
      >
        <DialogContent className="overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-md [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <GradientDialogHeader
            icon={QrCode}
            title="Connect WhatsApp via QR"
            description="Open WhatsApp on the school phone → Settings → Linked Devices → Link a Device, then scan this code."
          />
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 bg-gradient-to-br from-primary/[0.025] via-background to-violet-500/[0.035] p-4 sm:p-5">
            {success ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="size-12 text-emerald-600" />
                <p className="text-sm font-medium">Connected</p>
              </div>
            ) : qrDataUrl ? (
              <img src={qrDataUrl} alt="WhatsApp QR" className="rounded-md border bg-white p-2" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="size-8 animate-spin" />
                <p className="text-xs">Generating QR&hellip;</p>
              </div>
            )}
            {polling && !success && qrDataUrl && (
              <p className="text-[11px] text-muted-foreground mt-2">Waiting for scan&hellip;</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

