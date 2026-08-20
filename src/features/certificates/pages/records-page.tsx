'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState, GradientEmptyState, GradientDialogHeader } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Printer, Loader2, ShieldX, Award, Search, Ban, Filter, FileStack, CalendarDays, X, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CERTIFICATE_TYPES, certificateTypeDef } from '../lib/certificate-types'
import { CARD_TONES, certificateStatusMeta, TEMPORARY_BADGE } from '../lib/certificate-ui'

interface CertificateRow {
  id: string
  certificateNumber: string
  type: string
  issueDate: string
  effectiveDate: string | null
  purpose: string | null
  isTemporary: boolean
  status: string
  voidReason: string | null
  student: {
    id: string
    firstName: string
    lastName: string
    admissionNumber: string | null
    class: { name: string } | null
    section: { name: string } | null
  } | null
  template: { id: string; name: string } | null
  issuedByUser: { id: string; name: string } | null
}

const PAGE_SIZE = 25

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function CertificateRecordsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [records, setRecords] = useState<CertificateRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [type, setType] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [voidTarget, setVoidTarget] = useState<CertificateRow | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { page: String(page), pageSize: String(PAGE_SIZE) }
      if (type) params.type = type
      if (status) params.status = status
      if (search.trim()) params.search = search.trim()
      if (from) params.from = from
      if (to) params.to = to
      const res = await api.get<{ records: CertificateRow[]; total: number }>('/api/school/certificates', params)
      setRecords(res.records)
      setTotal(res.total)
    } catch (err) {
      toast({ title: 'Could not load certificates', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [page, type, status, search, from, to, toast])

  useEffect(() => {
    load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const counts = useMemo(() => {
    const byType: Record<string, number> = {}
    for (const t of CERTIFICATE_TYPES) byType[t.value] = 0
    for (const r of records) byType[r.type] = (byType[r.type] || 0) + 1
    return byType
  }, [records])

  async function confirmVoid() {
    if (!voidTarget) return
    if (!voidReason.trim()) {
      toast({ title: 'A void reason is required', variant: 'destructive' })
      return
    }
    setVoiding(true)
    try {
      await api.post(`/api/school/certificates/${voidTarget.id}/void`, { reason: voidReason.trim() })
      toast({ title: 'Certificate voided', description: `${voidTarget.certificateNumber} is now void.` })
      setVoidTarget(null)
      setVoidReason('')
      load()
    } catch (err) {
      toast({ title: 'Void failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setVoiding(false)
    }
  }

  return (
    <div className="space-y-4">
      <GradientHero
        icon={Award}
        title="Certificate Records"
        badge={`${total} record${total === 1 ? '' : 's'}`}
        description="Every issued certificate — including temporary TCs — stored for audit and re-printing."
        primaryAction={{
          label: 'Issue Certificate',
          icon: Award,
          onClick: () => router.push('/certificates/issue'),
        }}
      />

      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 border-sky-200 bg-white pl-9 pr-9 shadow-sm focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-input/30"
              placeholder="Search number / student / admission no.…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setPage(1) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Select value={type || 'all'} onValueChange={(v) => { setType(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger
              leadingIcon={<Filter className="size-3.5 text-white" />}
              leadingIconClassName="from-violet-500 to-purple-600"
              className="h-9 w-44 border-violet-200 bg-white dark:border-violet-500/25 dark:bg-input/30"
            >
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {CERTIFICATE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status || 'all'} onValueChange={(v) => { setStatus(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger
              leadingIcon={<FileStack className="size-3.5 text-white" />}
              leadingIconClassName="from-sky-500 to-cyan-600"
              className="h-9 w-40 border-sky-200 bg-white dark:border-sky-500/25 dark:bg-input/30"
            >
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1) }}
              aria-label="From date"
              className="h-9 w-40 border-emerald-200 bg-white pl-8 shadow-sm focus-visible:border-emerald-400 focus-visible:ring-emerald-400/20 dark:border-emerald-500/25 dark:bg-input/30"
            />
          </div>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1) }}
              aria-label="To date"
              className="h-9 w-40 border-amber-200 bg-white pl-8 shadow-sm focus-visible:border-amber-400 focus-visible:ring-amber-400/20 dark:border-amber-500/25 dark:bg-input/30"
            />
          </div>
          {total > 0 && (
            <Badge className="h-9 w-fit rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
              {total} record{total === 1 ? '' : 's'}
            </Badge>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <LoadingState />
      ) : records.length === 0 ? (
        <GradientEmptyState
          icon={Search}
          title="No certificates found"
          description="Adjust the filters or issue a new certificate to see records here."
          actionLabel="Issue certificate"
          onAction={() => router.push('/certificates/issue')}
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {records.map((r, index) => {
            const status = certificateStatusMeta(r.status)
            const tone = CARD_TONES[index % CARD_TONES.length]
            return (
              <Card
                key={r.id}
                className={cn('group gap-0 overflow-hidden border bg-gradient-to-br py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', tone.card)}
              >
                <div className={cn('flex items-start gap-3 border-b border-current/10 bg-gradient-to-r p-3.5', tone.header)}>
                  <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md', tone.icon)}>
                    <FileText className="size-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <h3 className="mr-1 truncate text-base font-semibold leading-tight">
                        {r.student ? [r.student.firstName, r.student.lastName].filter(Boolean).join(' ') : 'Unknown student'}
                      </h3>
                      <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 text-[10px]">
                        {certificateTypeDef(r.type).label}
                      </Badge>
                      {r.isTemporary && (
                        <Badge variant="outline" className={cn('h-5 shrink-0 rounded-md px-1.5 text-[10px]', TEMPORARY_BADGE)}>
                          Temporary
                        </Badge>
                      )}
                      <Badge variant="outline" className={status.tone}>{status.label}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">{r.certificateNumber}</span> · {formatDate(r.issueDate)}
                      {r.student?.class ? ` · ${r.student.class.name}${r.student.section ? `-${r.student.section.name}` : ''}` : ''}
                      {r.template ? ` · ${r.template.name}` : ''}
                      {r.issuedByUser ? ` · by ${r.issuedByUser.name}` : ''}
                    </p>
                    {r.purpose && (
                      <p className="mt-0.5 text-xs text-muted-foreground">Purpose: {r.purpose}</p>
                    )}
                    {r.status === 'void' && r.voidReason && (
                      <p className="mt-0.5 text-xs text-destructive">Void reason: {r.voidReason}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <p className="text-xs text-muted-foreground">
                    {r.status === 'void' ? 'Marked void — kept for audit' : 'Valid certificate — re-printable'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300"
                      onClick={() => window.open(`/print/certificates/${r.id}`, '_blank')}
                    >
                      <Printer className="size-3.5" /> Print
                    </Button>
                    {r.status === 'active' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
                        onClick={() => { setVoidTarget(r); setVoidReason('') }}
                      >
                        <Ban className="size-3.5" /> Void
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {total} record{total === 1 ? '' : 's'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!voidTarget} onOpenChange={(open) => !open && setVoidTarget(null)}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-destructive/20 bg-card p-0 shadow-2xl shadow-destructive/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <GradientDialogHeader
            icon={ShieldX}
            title="Void certificate"
            description={`${voidTarget?.certificateNumber} will be marked void and kept for audit. It can no longer be printed as a valid certificate.`}
          />
          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-rose/[0.03] via-background to-rose/[0.055] p-4 sm:p-5">
            <div className="relative overflow-hidden rounded-xl border border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-rose-50 p-4 shadow-sm dark:border-rose-500/25 dark:from-rose-500/15 dark:via-card dark:to-rose-500/10">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-sm">
                  <Ban className="size-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">Void reason *</h3>
                  <p className="text-[10px] text-muted-foreground">This reason is stored with the record for audit.</p>
                </div>
              </div>
              <Input
                placeholder="e.g. issued in error, wrong student"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="mt-3 h-9"
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setVoidTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" className="h-8 px-4 text-xs" onClick={confirmVoid} disabled={voiding}>
              {voiding && <Loader2 className="mr-1.5 size-4 animate-spin" />} Void certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}