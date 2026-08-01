'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { GradientHero } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { DatabaseBackup, Download, Trash2, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface ExportJob {
  id: string
  schoolId: string
  schoolName: string | null
  status: JobStatus
  format: string
  fileSize: number | null
  tableCount: number | null
  recordCount: number | null
  error: string | null
  startedAt: string | null
  completedAt: string | null
  expiresAt: string | null
  createdAt: string
}

interface SchoolOption {
  id: string
  name: string
}

const STATUS_META: Record<JobStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  pending: { label: 'Queued', cls: 'bg-muted text-muted-foreground', Icon: Clock },
  processing: {
    label: 'Processing',
    cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200',
    Icon: Loader2,
  },
  completed: {
    label: 'Completed',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200',
    Icon: CheckCircle2,
  },
  failed: { label: 'Failed', cls: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200', Icon: XCircle },
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let u = 0
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024
    u++
  }
  return `${n.toFixed(n < 10 && u > 0 ? 1 : 0)} ${units[u]}`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function TenantExportsPage() {
  const { toast } = useToast()
  const [jobs, setJobs] = useState<ExportJob[]>([])
  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSchool, setSelectedSchool] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ExportJob | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await api.get<{ jobs: ExportJob[] }>('/api/super-admin/exports')
      setJobs(res.jobs || [])
    } catch {
      toast({ title: "Couldn't load exports", description: 'Please refresh and try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  const fetchSchools = useCallback(async () => {
    try {
      const res = await api.get<{ schools: SchoolOption[] }>('/api/super-admin/schools')
      setSchools((res.schools || []).map((s) => ({ id: s.id, name: s.name })))
    } catch {
      /* picker stays empty */
    }
  }, [])

  useEffect(() => {
    void fetchJobs()
    void fetchSchools()
  }, [fetchJobs, fetchSchools])

  // Poll while any job is in flight, so status + download button update live.
  const hasActive = useMemo(
    () => jobs.some((j) => j.status === 'pending' || j.status === 'processing'),
    [jobs],
  )
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!hasActive) return
    pollRef.current = setInterval(() => void fetchJobs(), 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [hasActive, fetchJobs])

  const requestExport = useCallback(async () => {
    if (!selectedSchool) {
      toast({ title: 'Select a school', description: 'Please choose a school to export.', variant: 'destructive' })
      return
    }
    try {
      setRequesting(true)
      await api.post('/api/super-admin/exports', { schoolId: selectedSchool })
      toast({ title: 'Export started', description: 'It will appear below as it processes.' })
      setSelectedSchool('')
      await fetchJobs()
    } catch (err) {
      toast({
        title: "Couldn't start export",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setRequesting(false)
    }
  }, [selectedSchool, fetchJobs, toast])

  const downloadJob = useCallback((job: ExportJob) => {
    // Auth-gated route; same-origin GET sends the session cookie. A hidden anchor
    // triggers the browser's native download for the streamed gzip.
    const a = document.createElement('a')
    a.href = `/api/super-admin/exports/${job.id}/download`
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      setBusyId(deleteTarget.id)
      await api.delete(`/api/super-admin/exports/${deleteTarget.id}`)
      toast({ title: 'Export deleted' })
      setDeleteTarget(null)
      await fetchJobs()
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }, [deleteTarget, fetchJobs, toast])

  return (
    <div className="space-y-6">
      <GradientHero
        icon={DatabaseBackup}
        title="Data Exports"
        description="Back up a single school's full data to a downloadable, compressed file. Export-only — restoring is not supported."
      />

      {/* Request a new export */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium">School</label>
            <Select value={selectedSchool} onValueChange={setSelectedSchool}>
              <SelectTrigger>
                <SelectValue placeholder="Select a school to export" />
              </SelectTrigger>
              <SelectContent>
                {schools.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void requestExport()} disabled={requesting || !selectedSchool}>
            <DatabaseBackup className="mr-1 size-4" />
            {requesting ? 'Starting…' : 'Start export'}
          </Button>
        </CardContent>
      </Card>

      {/* Jobs list */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <DatabaseBackup className="size-7 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">No exports yet</h3>
              <p className="max-w-sm text-sm text-muted-foreground">
                Choose a school above and start an export. The compressed file appears here when ready.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const meta = STATUS_META[job.status] ?? STATUS_META.pending
            const StatusIcon = meta.Icon
            const expired = !!job.expiresAt && new Date(job.expiresAt).getTime() <= Date.now()
            return (
              <Card key={job.id}>
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}
                      >
                        <StatusIcon className={`size-3 ${job.status === 'processing' ? 'animate-spin' : ''}`} />
                        {meta.label}
                      </span>
                      {expired && job.status === 'completed' && (
                        <Badge variant="outline" className="text-xs">
                          Expired
                        </Badge>
                      )}
                    </div>
                    <h3 className="truncate font-semibold">{job.schoolName || job.schoolId}</h3>
                    <p className="text-xs text-muted-foreground">
                      Requested {formatDate(job.createdAt)}
                      {job.status === 'completed' && (
                        <>
                          {' · '}
                          {job.tableCount} tables · {job.recordCount?.toLocaleString()} rows ·{' '}
                          {formatBytes(job.fileSize)}
                        </>
                      )}
                    </p>
                    {job.status === 'completed' && job.expiresAt && !expired && (
                      <p className="text-xs text-muted-foreground">Available until {formatDate(job.expiresAt)}</p>
                    )}
                    {job.status === 'failed' && job.error && (
                      <p className="text-xs text-destructive">{job.error}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {job.status === 'completed' && !expired && (
                      <Button size="sm" onClick={() => downloadJob(job)}>
                        <Download className="mr-1 size-3.5" /> Download
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={busyId === job.id || job.status === 'processing'}
                      title={job.status === 'processing' ? 'Wait for it to finish' : undefined}
                      onClick={() => setDeleteTarget(job)}
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this export?</AlertDialogTitle>
            <AlertDialogDescription>
              The export record and its downloadable file for “{deleteTarget?.schoolName || deleteTarget?.schoolId}”
              will be permanently removed.
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
