'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  Send,
  Archive,
  Info,
  AlertTriangle,
  AlertOctagon,
  BellRing,
  CalendarClock,
  Link2,
  Save,
  Settings2,
} from 'lucide-react'
import {
  SEVERITIES,
  AUDIENCES,
  type AnnouncementSeverity,
  type AnnouncementAudience,
} from '@/lib/platform-announcements-shared'

interface AnnouncementItem {
  id: string
  title: string
  message: string
  severity: AnnouncementSeverity
  status: 'draft' | 'active' | 'archived'
  audience: AnnouncementAudience
  dismissible: boolean
  linkUrl: string | null
  linkLabel: string | null
  startsAt: string | null
  expiresAt: string | null
  createdAt: string
  dismissCount: number
}

interface FormState {
  title: string
  message: string
  severity: AnnouncementSeverity
  audience: AnnouncementAudience
  dismissible: boolean
  linkUrl: string
  linkLabel: string
  startsAt: string
  expiresAt: string
  publishNow: boolean
}

const EMPTY_FORM: FormState = {
  title: '',
  message: '',
  severity: 'info',
  audience: 'all',
  dismissible: true,
  linkUrl: '',
  linkLabel: '',
  startsAt: '',
  expiresAt: '',
  publishNow: false,
}

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all: 'Everyone',
  school_admins: 'School admins',
  teachers: 'Teachers',
  students: 'Students',
  parents: 'Parents',
}

const SEVERITY_META: Record<AnnouncementSeverity, { label: string; Icon: React.ElementType; cls: string }> = {
  info: { label: 'Info', Icon: Info, cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200' },
  warning: {
    label: 'Warning',
    Icon: AlertTriangle,
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
  },
  critical: {
    label: 'Critical',
    Icon: AlertOctagon,
    cls: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200',
  },
}

const STATUS_CLS: Record<AnnouncementItem['status'], string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200',
  draft: 'bg-muted text-muted-foreground',
  archived: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700/40 dark:text-zinc-300',
}

/** Convert an ISO string to a value a <input type="datetime-local"> accepts. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Convert a datetime-local value to an ISO string (or null when empty). */
function localInputToIso(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function formatWindow(item: AnnouncementItem): string {
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null
  const from = fmt(item.startsAt)
  const to = fmt(item.expiresAt)
  if (!from && !to) return 'Always (while active)'
  if (from && !to) return `From ${from}`
  if (!from && to) return `Until ${to}`
  return `${from} → ${to}`
}

export function PlatformAnnouncementsPage() {
  const { toast } = useToast()
  const [items, setItems] = useState<AnnouncementItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get<{ announcements: AnnouncementItem[] }>('/api/super-admin/announcements')
      setItems(res.announcements || [])
    } catch {
      toast({
        title: "Couldn't load announcements",
        description: 'Please refresh the page and try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void fetchItems()
  }, [fetchItems])

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const openCreate = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }, [])

  const openEdit = useCallback((item: AnnouncementItem) => {
    setEditingId(item.id)
    setForm({
      title: item.title,
      message: item.message,
      severity: item.severity,
      audience: item.audience,
      dismissible: item.dismissible,
      linkUrl: item.linkUrl || '',
      linkLabel: item.linkLabel || '',
      startsAt: isoToLocalInput(item.startsAt),
      expiresAt: isoToLocalInput(item.expiresAt),
      publishNow: false,
    })
    setDialogOpen(true)
  }, [])

  const buildPayload = useCallback(
    (): Record<string, unknown> => ({
      title: form.title.trim(),
      message: form.message.trim(),
      severity: form.severity,
      audience: form.audience,
      dismissible: form.dismissible,
      linkUrl: form.linkUrl.trim() || null,
      linkLabel: form.linkLabel.trim() || null,
      startsAt: localInputToIso(form.startsAt),
      expiresAt: localInputToIso(form.expiresAt),
    }),
    [form],
  )

  const handleSave = useCallback(async () => {
    if (!form.title.trim()) {
      toast({ title: 'Title required', description: 'Please enter a title.', variant: 'destructive' })
      return
    }
    if (!form.message.trim()) {
      toast({ title: 'Message required', description: 'Please enter a message.', variant: 'destructive' })
      return
    }
    try {
      setSaving(true)
      if (editingId) {
        await api.patch(`/api/super-admin/announcements/${editingId}`, buildPayload())
        toast({ title: 'Announcement updated' })
      } else {
        await api.post('/api/super-admin/announcements', {
          ...buildPayload(),
          status: form.publishNow ? 'active' : 'draft',
        })
        toast({
          title: form.publishNow ? 'Announcement published' : 'Draft saved',
          description: form.publishNow ? 'It is now live for the selected audience.' : undefined,
        })
      }
      setDialogOpen(false)
      await fetchItems()
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [editingId, form, buildPayload, fetchItems, toast])

  const changeStatus = useCallback(
    async (item: AnnouncementItem, status: 'active' | 'archived') => {
      try {
        setBusyId(item.id)
        await api.patch(`/api/super-admin/announcements/${item.id}`, { status })
        toast({ title: status === 'active' ? 'Announcement published' : 'Announcement archived' })
        await fetchItems()
      } catch (err) {
        toast({
          title: 'Action failed',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        })
      } finally {
        setBusyId(null)
      }
    },
    [fetchItems, toast],
  )

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      setBusyId(deleteTarget.id)
      await api.delete(`/api/super-admin/announcements/${deleteTarget.id}`)
      toast({ title: 'Announcement deleted' })
      setDeleteTarget(null)
      await fetchItems()
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }, [deleteTarget, fetchItems, toast])

  const activeCount = useMemo(() => items.filter((i) => i.status === 'active').length, [items])
  const dialogSeverity = SEVERITY_META[form.severity] ?? SEVERITY_META.info
  const DialogSeverityIcon = dialogSeverity.Icon
  const SaveIcon = !editingId && form.publishNow ? Send : Save

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Broadcasts"
        description="Send platform-wide banners to every school (maintenance windows, new features, outages)."
        action={{ label: 'New broadcast', icon: Plus, onClick: openCreate }}
      />

      {activeCount > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{activeCount}</span> live broadcast
          {activeCount === 1 ? '' : 's'} currently showing.
        </p>
      )}

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Megaphone className="size-7 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">No broadcasts yet</h3>
              <p className="max-w-sm text-sm text-muted-foreground">
                Create a broadcast to show a banner across every school — perfect for maintenance
                notices and feature announcements.
              </p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="mr-1 size-4" /> New broadcast
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const sev = SEVERITY_META[item.severity] ?? SEVERITY_META.info
            const SevIcon = sev.Icon
            return (
              <Card key={item.id}>
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${sev.cls}`}
                      >
                        <SevIcon className="size-3" /> {sev.label}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_CLS[item.status]}`}
                      >
                        {item.status}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {AUDIENCE_LABELS[item.audience]}
                      </Badge>
                      {!item.dismissible && (
                        <Badge variant="outline" className="text-xs">
                          Pinned
                        </Badge>
                      )}
                    </div>
                    <h3 className="truncate font-semibold">{item.title}</h3>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{item.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatWindow(item)}
                      {item.status === 'active' && ` · ${item.dismissCount} dismissed`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {item.status !== 'active' && (
                      <Button
                        size="sm"
                        variant="default"
                        disabled={busyId === item.id}
                        onClick={() => void changeStatus(item, 'active')}
                      >
                        <Send className="mr-1 size-3.5" /> Publish
                      </Button>
                    )}
                    {item.status === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === item.id}
                        onClick={() => void changeStatus(item, 'archived')}
                      >
                        <Archive className="mr-1 size-3.5" /> Archive
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                      <Pencil className="mr-1 size-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={item.status === 'active' || busyId === item.id}
                      title={item.status === 'active' ? 'Archive before deleting' : undefined}
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b bg-muted/30 px-5 py-4 text-left sm:px-6">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-white shadow-sm">
                <Megaphone className="size-5" />
              </span>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-xl font-semibold">
                  {editingId ? 'Edit broadcast' : 'New broadcast'}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  Create a platform banner for the selected audience across every school.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${dialogSeverity.cls}`}
                >
                  <DialogSeverityIcon className="size-3.5" />
                  {dialogSeverity.label}
                </span>
                <Badge variant="outline" className="text-xs">
                  {AUDIENCE_LABELS[form.audience]}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {form.dismissible ? 'Dismissible' : 'Pinned'}
                </Badge>
              </div>
              <div className="mt-3 space-y-1">
                <h3 className="line-clamp-1 text-base font-semibold text-foreground">
                  {form.title.trim() || 'Broadcast title preview'}
                </h3>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {form.message.trim() ||
                    'Your message preview will appear here exactly like a platform notice.'}
                </p>
              </div>
            </div>

            <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <BellRing className="size-4 text-brand" />
                Broadcast content
              </div>

              <div className="space-y-1.5">
              <Label htmlFor="pa-title">Title</Label>
              <Input
                id="pa-title"
                value={form.title}
                maxLength={120}
                placeholder="Scheduled maintenance tonight"
                onChange={(e) => setField('title', e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pa-message">Message</Label>
              <Textarea
                id="pa-message"
                value={form.message}
                rows={4}
                placeholder="The platform will be unavailable from 2:00-2:30 AM IST for upgrades."
                onChange={(e) => setField('message', e.target.value)}
              />
            </div>
            </section>

            <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Settings2 className="size-4 text-brand" />
                Audience and priority
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setField('severity', v as AnnouncementSeverity)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {SEVERITY_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Audience</Label>
                <Select value={form.audience} onValueChange={(v) => setField('audience', v as AnnouncementAudience)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCES.map((a) => (
                      <SelectItem key={a} value={a}>
                        {AUDIENCE_LABELS[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            </section>

            <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CalendarClock className="size-4 text-brand" />
                Schedule
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pa-start">Starts at</Label>
                <Input
                  id="pa-start"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setField('startsAt', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pa-end">Expires at</Label>
                <Input
                  id="pa-end"
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) => setField('expiresAt', e.target.value)}
                />
              </div>
            </div>
            </section>

            <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Link2 className="size-4 text-brand" />
                Optional link
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pa-link">Link URL</Label>
                <Input
                  id="pa-link"
                  value={form.linkUrl}
                  placeholder="https://example.com/status"
                  onChange={(e) => setField('linkUrl', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pa-link-label">Link label</Label>
                <Input
                  id="pa-link-label"
                  value={form.linkLabel}
                  placeholder="Learn more"
                  onChange={(e) => setField('linkLabel', e.target.value)}
                />
              </div>
            </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4 shadow-sm">
              <div className="min-w-0">
                <Label htmlFor="pa-dismissible">Dismissible</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Users can close the banner after reading it.
                </p>
              </div>
              <Switch
                id="pa-dismissible"
                checked={form.dismissible}
                onCheckedChange={(v) => setField('dismissible', v)}
              />
            </div>

            {!editingId && (
              <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4 shadow-sm">
                <div className="min-w-0">
                  <Label htmlFor="pa-publish">Publish now</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Turn on to make this broadcast live immediately.
                  </p>
                </div>
                <Switch
                  id="pa-publish"
                  checked={form.publishNow}
                  onCheckedChange={(v) => setField('publishNow', v)}
                />
              </div>
            )}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t bg-muted/20 px-5 py-4 sm:px-6">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              <SaveIcon className="mr-2 size-4" />
              {saving ? 'Saving...' : editingId ? 'Save changes' : form.publishNow ? 'Publish' : 'Save draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this broadcast?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.title}” will be permanently removed. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
