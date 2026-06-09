'use client'

import { useCallback, useEffect, useState } from 'react'
import { PageHeader, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface Preference {
  id: string
  channel: string
  category: string
  enabled: boolean
}

// Channels surfaced to end users. IN_APP can't be disabled (it's the inbox);
// the others are opt-out. SMS/push are shown but flagged "coming soon".
const CHANNELS: { key: string; label: string; hint?: string; disabled?: boolean }[] = [
  { key: 'IN_APP', label: 'In-app', hint: 'Always on — your notification inbox', disabled: true },
  { key: 'EMAIL', label: 'Email' },
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'SMS', label: 'SMS', hint: 'Coming soon', disabled: true },
  { key: 'WEB_PUSH', label: 'Web push', hint: 'Coming soon', disabled: true },
  { key: 'MOBILE_PUSH', label: 'Mobile push', hint: 'Coming soon', disabled: true },
]

export function NotificationPreferencesPage() {
  const { toast } = useToast()
  const [prefs, setPrefs] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ preferences: Preference[] }>('/api/school/notifications/preferences')
      const map: Record<string, boolean> = {}
      for (const p of res.preferences) {
        if (p.category === 'all') map[p.channel] = p.enabled
      }
      setPrefs(map)
    } catch {
      toast({ title: "Couldn't Load Preferences", description: 'Please refresh and try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const toggle = async (channel: string, enabled: boolean) => {
    setSaving(channel)
    // Optimistic update.
    setPrefs((prev) => ({ ...prev, [channel]: enabled }))
    try {
      await api.patch('/api/school/notifications/preferences', { channel, category: 'all', enabled })
    } catch {
      setPrefs((prev) => ({ ...prev, [channel]: !enabled })) // rollback
      toast({ title: 'Update Failed', description: 'We couldn\'t save that change. Please try again.', variant: 'destructive' })
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader title="Notification Preferences" description="Choose how you'd like to be notified. Critical alerts are always delivered." />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Delivery channels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {CHANNELS.map((c) => {
            // Default enabled when no explicit pref row exists.
            const checked = c.key === 'IN_APP' ? true : prefs[c.key] ?? true
            return (
              <div key={c.key} className="flex items-center justify-between border-b py-3 last:border-b-0">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">{c.label}</Label>
                  {c.hint && <p className="text-xs text-muted-foreground">{c.hint}</p>}
                </div>
                <Switch
                  checked={checked}
                  disabled={c.disabled || saving === c.key}
                  onCheckedChange={(v) => toggle(c.key, v)}
                  aria-label={`Toggle ${c.label} notifications`}
                />
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
