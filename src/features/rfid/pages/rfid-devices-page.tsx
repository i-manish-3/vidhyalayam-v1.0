'use client'

/**
 * RFID device administration — manages the gate readers that POST to
 * /api/rfid/webhook.
 *
 * Critical UX requirement: the plaintext API key is shown ONCE at creation
 * time and never again. We display it in a copy-to-clipboard dialog and
 * make the admin click "I've saved it" before dismissing.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  Copy,
  Plus,
  RadioTower,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'

interface Device {
  id: string
  name: string
  location: string | null
  isActive: boolean
  lastSeenAt: string | null
  lastSeenIp?: string | null
  createdAt: string
}

export function RfidDevicesPage() {
  const [loading, setLoading] = useState(true)
  const [devices, setDevices] = useState<Device[]>([])

  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createLocation, setCreateLocation] = useState('')
  const [creating, setCreating] = useState(false)

  const [newKey, setNewKey] = useState<{ apiKey: string; deviceName: string } | null>(null)

  // Delete confirmation — drives the themed AlertDialog instead of window.confirm().
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/school/rfid/devices', { credentials: 'include' })
      if (!res.ok) {
        toast.error('Could not load devices.')
        return
      }
      const j: { devices: Device[] } = await res.json()
      setDevices(j.devices)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (createName.trim().length < 2 || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/school/rfid/devices', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: createName,
          location: createLocation || undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j.message || 'Could not create device.')
        return
      }
      setNewKey({ apiKey: j.apiKey, deviceName: j.device.name })
      setShowCreate(false)
      setCreateName('')
      setCreateLocation('')
      await load()
    } finally {
      setCreating(false)
    }
  }

  async function toggleActive(device: Device) {
    const res = await fetch(`/api/school/rfid/devices/${device.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: !device.isActive }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.message || 'Could not update device.')
      return
    }
    await load()
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/school/rfid/devices/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.message || 'Could not remove device.')
        return
      }
      toast.success('Device removed.')
      setDeleteTarget(null)
      await load()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <RadioTower className="size-5 text-primary" />
            RFID Reader Devices
          </h1>
          <p className="text-xs text-muted-foreground">
            Networked gate readers that post taps to the webhook endpoint.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus className="size-4" />
          Add device
        </Button>
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : devices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
            <RadioTower className="size-10 opacity-50" />
            <div>
              <p className="text-sm font-medium">No devices yet.</p>
              <p className="text-xs">
                Add one to issue an API key for an ESP32 or commercial reader.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {devices.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={
                      'flex size-10 items-center justify-center rounded-md ' +
                      (d.isActive
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : 'bg-muted text-muted-foreground')
                    }
                  >
                    <RadioTower className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{d.name}</h3>
                      <Badge variant={d.isActive ? 'default' : 'secondary'} className="text-[10px]">
                        {d.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {d.location || 'No location set'} ·{' '}
                      {d.lastSeenAt
                        ? `Last seen ${new Date(d.lastSeenAt).toLocaleString()}`
                        : 'Never seen'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Active</span>
                    <Switch
                      checked={d.isActive}
                      onCheckedChange={() => toggleActive(d)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(d)}
                    title="Remove device"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create device dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Add RFID device</DialogTitle>
              <DialogDescription>
                A unique API key will be generated. Copy it from the next
                screen — it is not stored in plaintext and cannot be retrieved
                later.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="dev-name">Name</Label>
                <Input
                  id="dev-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Main Gate"
                  required
                  maxLength={80}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dev-location">Location (optional)</Label>
                <Input
                  id="dev-location"
                  value={createLocation}
                  onChange={(e) => setCreateLocation(e.target.value)}
                  placeholder="Block A, entrance"
                  maxLength={120}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreate(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating || createName.trim().length < 2}>
                {creating ? 'Creating…' : 'Create device'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* One-time key reveal dialog */}
      <Dialog
        open={!!newKey}
        onOpenChange={(open) => {
          if (!open) setNewKey(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-emerald-600" />
              Copy this API key now
            </DialogTitle>
            <DialogDescription>
              This key is shown once. Paste it into the device firmware's
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">x-device-key</code>
              header configuration. If you lose it, delete the device and
              create a new one.
            </DialogDescription>
          </DialogHeader>
          {newKey && (
            <div className="space-y-3">
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                <p className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  Anyone with this key can post attendance taps as{' '}
                  <strong>{newKey.deviceName}</strong>. Treat it like a password.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
                <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">
                  {newKey.apiKey}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(newKey.apiKey)
                      toast.success('Key copied to clipboard.')
                    } catch {
                      toast.error('Could not copy. Select the text and copy manually.')
                    }
                  }}
                  className="gap-1.5"
                >
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              </div>
              <div className="rounded-md bg-muted/30 p-3 text-xs">
                <p className="mb-1 font-semibold">Test it:</p>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono">
{`curl -X POST /api/rfid/webhook \\
  -H "x-device-key: ${newKey.apiKey}" \\
  -H "content-type: application/json" \\
  -d '{"uid":"045AB28E"}'`}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setNewKey(null)} className="gap-1.5">
              <Activity className="size-3.5" />
              I've saved the key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Themed delete confirmation — replaces window.confirm() to match the rest of the app. */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this device?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <strong>&ldquo;{deleteTarget.name}&rdquo;</strong> will stop accepting taps
                  immediately. Past tap logs are kept for audit, but the device&apos;s API key
                  will no longer work. You&apos;ll need to create a new device if you want to
                  re-enable this gate reader.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault() // keep dialog open while the request is in-flight
                void handleDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Removing…' : 'Remove device'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
