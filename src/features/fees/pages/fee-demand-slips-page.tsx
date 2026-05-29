'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Check, CheckCheck, CheckCircle2, ChevronDown, ChevronRight, Eye, History, Layers, MessageCircle, Printer, Receipt, Search, Send, Sparkles, User as UserIcon, X, XCircle } from 'lucide-react'
import { useAppStore, type School } from '@/lib/store'
import { buildPrintHeaderHtml } from '@/lib/print-header'

// ── Types ─────────────────────────────────────────────────────────────

interface SlipRow {
  id: string
  invoiceNumber: string
  billingMonth: number
  billingYear: number
  invoiceDate: string
  dueDate: string | null
  subtotal: number
  previousBalance: number
  totalAmount: number
  paidAmount: number
  status: string
  demandRunId: string | null
  lineCount: number
  student: {
    id: string
    firstName: string
    lastName: string
    admissionNumber: string | null
    class: { id: string; name: string } | null
    section: { id: string; name: string } | null
  }
}

interface SlipDetail extends Omit<SlipRow, 'lineCount'> {
  notes: string | null
  lines: Array<{
    id: string
    feeHeadName: string
    installmentName: string
    amount: number
    totalAmount: number
    dueDate: string | null
    status: string
  }>
}

interface RunRow {
  id: string
  billingMonth: number
  billingYear: number
  triggerType: string
  triggeredBy: string | null
  triggeredByName: string | null
  status: string
  totalStudents: number
  successCount: number
  skippedCount: number
  failedCount: number
  totalAmount: number
  filters: { classId?: string; sectionId?: string; studentIds?: string[] } | null
  startedAt: string
  completedAt: string | null
}

interface ClassOption { id: string; name: string }
interface SectionOption { id: string; name: string; classId?: string }

interface NotificationRow {
  id: string
  invoiceId: string
  studentId: string
  recipient: string
  status: string
  providerMsgId: string | null
  errorMessage: string | null
  sentAt: string | null
  createdAt: string
}

interface NotificationSummary {
  pending: number
  sending: number
  sent: number
  failed: number
  total: number
}

interface FeeDemandConfigSummary {
  whatsappEnabled: boolean
  whatsappProvider: 'BAILEYS' | 'META_CLOUD' | null
}
interface StudentOption {
  id: string
  firstName: string
  lastName: string
  admissionNumber?: string | null
  class?: { id: string; name: string } | null
  section?: { id: string; name: string } | null
}

interface BulkResultPayload {
  runId: string | null
  totalStudents: number
  successCount: number
  skippedCount: number
  failedCount: number
  totalAmount: number
  errors: Array<{ studentId: string; error: string }>
}

interface SinglePreview {
  itemCount: number
  subtotal: number
  previousBalance: number
  totalAmount: number
}

// ── Constants ─────────────────────────────────────────────────────────

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
]

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'paid') return 'default'
  if (status === 'partial') return 'secondary'
  if (status === 'cancelled') return 'destructive'
  return 'outline'
}

function runStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default'
  if (status === 'partial') return 'secondary'
  if (status === 'failed') return 'destructive'
  return 'outline'
}

function formatCurrency(value: number): string {
  return `₹${(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  try { return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return '-' }
}

// ── Main page ─────────────────────────────────────────────────────────

export function FeeDemandSlipsPage() {
  const { toast } = useToast()

  const today = new Date()
  const defaultMonth = today.getMonth() + 1
  const defaultYear = today.getFullYear()

  // Filters
  const [month, setMonth] = useState<number>(defaultMonth)
  const [year, setYear] = useState<number>(defaultYear)
  const [classId, setClassId] = useState<string>('')
  const [sectionId, setSectionId] = useState<string>('')
  const [runFilter, setRunFilter] = useState<string>('')

  // Data
  const [slips, setSlips] = useState<SlipRow[]>([])
  const [runs, setRuns] = useState<RunRow[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [loading, setLoading] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)

  // Generator dialog
  const [generatorOpen, setGeneratorOpen] = useState(false)

  // Bulk WhatsApp send
  const [bulkSendOpen, setBulkSendOpen] = useState(false)
  const [bulkSending, setBulkSending] = useState(false)
  const [progressSummary, setProgressSummary] = useState<NotificationSummary | null>(null)
  const [waConfig, setWaConfig] = useState<FeeDemandConfigSummary | null>(null)

  // Detail dialog
  const [viewingId, setViewingId] = useState<string | null>(null)

  // Year options: AY ±2 years around current
  const yearOptions = useMemo(() => {
    const base = today.getFullYear()
    return [base - 1, base, base + 1]
  }, [today])

  const sectionsForClass = useMemo(
    () => sections.filter((s) => !classId || s.classId === classId),
    [sections, classId]
  )

  // Initial loads
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [classesRes, sectionsRes, configRes] = await Promise.all([
          api.get<{ classes: ClassOption[] }>('/api/school/classes'),
          api.get<{ sections: SectionOption[] }>('/api/school/sections'),
          api.get<{ config: FeeDemandConfigSummary }>('/api/school/fees/demand-config').catch(() => ({ config: { whatsappEnabled: false, whatsappProvider: null } as FeeDemandConfigSummary })),
        ])
        if (!cancelled) {
          setClasses(classesRes.classes || [])
          setSections(sectionsRes.sections || [])
          setWaConfig(configRes.config || { whatsappEnabled: false, whatsappProvider: null })
        }
      } catch {
        if (!cancelled) toast({ title: "Couldn't load classes", description: 'Please refresh the page.', variant: 'destructive' })
      }
    })()
    return () => { cancelled = true }
  }, [toast])

  const fetchSlips = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { month: String(month), year: String(year), limit: '200' }
      if (classId) params.classId = classId
      if (sectionId) params.sectionId = sectionId
      if (runFilter) params.runId = runFilter
      const res = await api.get<{ slips: SlipRow[] }>('/api/school/fees/demand-slips', params)
      setSlips(res.slips || [])
    } catch {
      toast({ title: "Couldn't load demand slips", description: 'Please try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [month, year, classId, sectionId, runFilter, toast])

  const fetchRuns = useCallback(async () => {
    try {
      const res = await api.get<{ runs: RunRow[] }>('/api/school/fees/demand-slips/runs')
      setRuns(res.runs || [])
    } catch {
      // History panel can stay empty — no toast (avoid noise on every refresh)
    }
  }, [])

  useEffect(() => { fetchSlips() }, [fetchSlips])
  useEffect(() => { fetchRuns() }, [fetchRuns])

  const onGenerated = useCallback(() => {
    setGeneratorOpen(false)
    fetchSlips()
    fetchRuns()
  }, [fetchSlips, fetchRuns])

  // Poll notifications while a bulk send is active so the progress banner ticks.
  useEffect(() => {
    if (!progressSummary) return
    const stillRunning = progressSummary.pending + progressSummary.sending > 0
    if (!stillRunning) return
    const t = window.setTimeout(async () => {
      try {
        const res = await api.get<{ summary: NotificationSummary }>(
          '/api/school/fees/demand-slips/notifications',
          { month: String(month), year: String(year) }
        )
        setProgressSummary(res.summary)
      } catch { /* silent */ }
    }, 2500)
    return () => window.clearTimeout(t)
  }, [progressSummary, month, year])

  const runBulkSend = useCallback(async () => {
    setBulkSending(true)
    try {
      const res = await api.post<{ totalQueued: number; immediatelySent: number; skipped: number; message?: string }>(
        '/api/school/fees/demand-slips/send-bulk',
        {
          filters: {
            month, year,
            ...(classId ? { classId } : {}),
            ...(sectionId ? { sectionId } : {}),
            ...(runFilter ? { runId: runFilter } : {}),
          },
        }
      )
      setBulkSendOpen(false)
      if (res.totalQueued === 0) {
        toast({ title: 'Nothing to send', description: res.message || 'No slips matched the filters.', variant: 'destructive' })
        return
      }
      toast({
        title: 'Sending in background',
        description: `Queued ${res.totalQueued} · already sent ${res.immediatelySent}${res.skipped ? ` · skipped ${res.skipped} (recently sent)` : ''}.`,
      })
      // Seed the progress summary so the polling effect kicks in.
      setProgressSummary({
        pending: Math.max(res.totalQueued - res.immediatelySent, 0),
        sending: 0,
        sent: res.immediatelySent,
        failed: 0,
        total: res.totalQueued + res.skipped,
      })
    } catch (err) {
      toast({
        title: 'Bulk send failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBulkSending(false)
    }
  }, [month, year, classId, sectionId, runFilter, toast])

  const totalDemanded = useMemo(() => slips.reduce((s, r) => s + (r.totalAmount || 0), 0), [slips])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Fee Demand Slips</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {slips.length > 0
              ? `${slips.length} slips · ${formatCurrency(totalDemanded)} demanded for ${MONTHS[month - 1].label} ${year}`
              : `Generate monthly demand slips for ${MONTHS[month - 1].label} ${year}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {waConfig?.whatsappEnabled && (waConfig?.whatsappProvider === 'META_CLOUD' || waConfig?.whatsappProvider === 'BAILEYS') && slips.length > 0 && (
            <Button variant="outline" onClick={() => setBulkSendOpen(true)} className="gap-2">
              <Send className="size-4" />
              Send All ({slips.length})
            </Button>
          )}
          <Button onClick={() => setGeneratorOpen(true)} className="gap-2">
            <Sparkles className="size-4" />
            Generate Slips
          </Button>
        </div>
      </div>

      {/* Filter row */}
      <div className="rounded-lg border bg-background p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Month</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Class</Label>
            <Select value={classId || 'all'} onValueChange={(v) => { setClassId(v === 'all' ? '' : v); setSectionId('') }}>
              <SelectTrigger className="h-9"><SelectValue placeholder="All classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Section</Label>
            <Select value={sectionId || 'all'} onValueChange={(v) => setSectionId(v === 'all' ? '' : v)} disabled={!classId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="All sections" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {sectionsForClass.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {runFilter && (
          <div className="mt-3 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Filtered to one run.</span>
            <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs" onClick={() => setRunFilter('')}>
              <X className="size-3" /> Clear
            </Button>
          </div>
        )}
      </div>

      {/* List */}
      {loading ? (
        <LoadingState />
      ) : slips.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No demand slips yet"
          description={`No slips generated for ${MONTHS[month - 1].label} ${year}${classId ? ' in the selected class' : ''}.`}
          action={{ label: 'Generate Slips', onClick: () => setGeneratorOpen(true) }}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-11 px-4 text-xs font-semibold uppercase text-muted-foreground">Slip No</TableHead>
                <TableHead className="h-11 px-4 text-xs font-semibold uppercase text-muted-foreground">Student</TableHead>
                <TableHead className="h-11 px-4 text-xs font-semibold uppercase text-muted-foreground">Class</TableHead>
                <TableHead className="h-11 px-4 text-right text-xs font-semibold uppercase text-muted-foreground">Items</TableHead>
                <TableHead className="h-11 px-4 text-right text-xs font-semibold uppercase text-muted-foreground">Prev Bal</TableHead>
                <TableHead className="h-11 px-4 text-right text-xs font-semibold uppercase text-muted-foreground">Total</TableHead>
                <TableHead className="h-11 px-4 text-xs font-semibold uppercase text-muted-foreground">Status</TableHead>
                <TableHead className="h-11 w-24 px-4 text-right text-xs font-semibold uppercase text-muted-foreground">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slips.map((slip) => (
                <TableRow key={slip.id} className="group">
                  <TableCell className="px-4 py-3 font-mono text-xs">{slip.invoiceNumber}</TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{slip.student.firstName} {slip.student.lastName}</span>
                      <span className="text-xs text-muted-foreground">{slip.student.admissionNumber || '-'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                    {slip.student.class?.name || '-'}{slip.student.section ? ` / ${slip.student.section.name}` : ''}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-sm">{slip.lineCount}</TableCell>
                  <TableCell className="px-4 py-3 text-right text-sm">{formatCurrency(slip.previousBalance)}</TableCell>
                  <TableCell className="px-4 py-3 text-right text-sm font-semibold">{formatCurrency(slip.totalAmount)}</TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge variant={statusVariant(slip.status)} className="capitalize">{slip.status}</Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 px-3" onClick={() => setViewingId(slip.id)}>
                        <Eye className="size-4" /> View
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Run history */}
      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="rounded-lg border bg-background shadow-sm">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/40">
            <span className="flex items-center gap-2 text-sm font-medium">
              <History className="size-4 text-muted-foreground" />
              Run History
              <span className="text-xs text-muted-foreground">({runs.length})</span>
            </span>
            {historyOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t">
            {runs.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">No runs yet.</div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-10 px-4 text-xs">When</TableHead>
                    <TableHead className="h-10 px-4 text-xs">Period</TableHead>
                    <TableHead className="h-10 px-4 text-xs">Trigger</TableHead>
                    <TableHead className="h-10 px-4 text-right text-xs">Created</TableHead>
                    <TableHead className="h-10 px-4 text-right text-xs">Skipped</TableHead>
                    <TableHead className="h-10 px-4 text-right text-xs">Failed</TableHead>
                    <TableHead className="h-10 px-4 text-right text-xs">Total</TableHead>
                    <TableHead className="h-10 px-4 text-xs">Status</TableHead>
                    <TableHead className="h-10 w-32 px-4 text-right text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id} className="group">
                      <TableCell className="px-4 py-2 text-xs">
                        <div className="flex flex-col">
                          <span>{formatDate(run.startedAt)}</span>
                          <span className="text-muted-foreground">{run.triggeredByName || run.triggerType}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-xs">{MONTHS[run.billingMonth - 1]?.label.slice(0, 3)} {run.billingYear}</TableCell>
                      <TableCell className="px-4 py-2 text-xs capitalize">{run.triggerType.toLowerCase()}</TableCell>
                      <TableCell className="px-4 py-2 text-right text-xs font-medium">{run.successCount}</TableCell>
                      <TableCell className="px-4 py-2 text-right text-xs text-muted-foreground">{run.skippedCount}</TableCell>
                      <TableCell className="px-4 py-2 text-right text-xs text-destructive">{run.failedCount || ''}</TableCell>
                      <TableCell className="px-4 py-2 text-right text-xs">{formatCurrency(run.totalAmount)}</TableCell>
                      <TableCell className="px-4 py-2">
                        <Badge variant={runStatusVariant(run.status)} className="capitalize">{run.status}</Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setMonth(run.billingMonth)
                            setYear(run.billingYear)
                            setRunFilter(run.id)
                          }}
                        >
                          View slips
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Generator dialog */}
      <GeneratorDialog
        open={generatorOpen}
        onOpenChange={setGeneratorOpen}
        month={month}
        year={year}
        classes={classes}
        sections={sections}
        onGenerated={onGenerated}
      />

      {/* Detail dialog */}
      <SlipDetailDialog
        slipId={viewingId}
        onClose={() => setViewingId(null)}
        whatsappEnabled={!!(waConfig?.whatsappEnabled && (waConfig?.whatsappProvider === 'META_CLOUD' || waConfig?.whatsappProvider === 'BAILEYS'))}
        onAfterSend={() => fetchSlips()}
      />

      {/* Bulk send confirmation */}
      <AlertDialog open={bulkSendOpen} onOpenChange={setBulkSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send {slips.length} demand slips via WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Each parent will receive a message with a link to view and save their child&apos;s slip. Slips already sent in the last hour are skipped automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkSending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); runBulkSend() }}
              disabled={bulkSending}
            >
              {bulkSending ? 'Queueing…' : 'Send All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk send progress banner */}
      {progressSummary && (progressSummary.pending + progressSummary.sending > 0 || progressSummary.total > 0) && (
        <div className="fixed bottom-4 right-4 z-40 w-[320px] rounded-lg border bg-background p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">WhatsApp send</span>
            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setProgressSummary(null)}>
              <X className="size-3" />
            </Button>
          </div>
          <div className="mt-2 space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-green-600" />
              <span>Sent: <strong>{progressSummary.sent}</strong></span>
            </div>
            {progressSummary.pending + progressSummary.sending > 0 && (
              <div className="flex items-center gap-2">
                <span className="size-3.5 inline-block animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>In progress: <strong>{progressSummary.pending + progressSummary.sending}</strong></span>
              </div>
            )}
            {progressSummary.failed > 0 && (
              <div className="flex items-center gap-2">
                <XCircle className="size-3.5 text-destructive" />
                <span>Failed: <strong>{progressSummary.failed}</strong></span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Generator dialog ──────────────────────────────────────────────────

interface GeneratorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  month: number
  year: number
  classes: ClassOption[]
  sections: SectionOption[]
  onGenerated: () => void
}

function GeneratorDialog({ open, onOpenChange, month, year, classes, sections, onGenerated }: GeneratorDialogProps) {
  const { toast } = useToast()
  const [tab, setTab] = useState<'bulk' | 'single'>('bulk')

  // Bulk mode
  const [bulkClassId, setBulkClassId] = useState<string>('')
  const [bulkSectionId, setBulkSectionId] = useState<string>('')
  const [bulkForce, setBulkForce] = useState(false)
  const [bulkPreview, setBulkPreview] = useState<BulkResultPayload | null>(null)

  // Single mode
  const [search, setSearch] = useState('')
  const [studentResults, setStudentResults] = useState<StudentOption[]>([])
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null)
  const [singleForce, setSingleForce] = useState(false)
  const [singlePreview, setSinglePreview] = useState<SinglePreview | null>(null)
  const [searchState, setSearchState] = useState<'idle' | 'searching' | 'done' | 'error'>('idle')
  const [searchError, setSearchError] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)

  // Reset when opened/closed
  useEffect(() => {
    if (!open) {
      setTab('bulk')
      setBulkClassId(''); setBulkSectionId(''); setBulkForce(false); setBulkPreview(null)
      setSearch(''); setStudentResults([]); setSelectedStudent(null); setSingleForce(false); setSinglePreview(null)
      setSearchState('idle'); setSearchError(null)
      setBusy(false)
    }
  }, [open])

  // Student debounce
  useEffect(() => {
    if (tab !== 'single') return
    const value = search.trim()
    if (selectedStudent) return
    if (value.length < 2) {
      setSearchState('idle')
      setStudentResults([])
      setSearchError(null)
      return
    }
    setSearchState('searching')
    setSearchError(null)
    const t = window.setTimeout(async () => {
      try {
        // Use the demand-slip-specific endpoint, which mirrors resolveStudentIds
        // (school + active only, no academic-year filter). The generic students
        // search would miss billable students enrolled under older AYs.
        const data = await api.get<{ students: StudentOption[] }>(
          '/api/school/fees/demand-slips/students/search',
          { q: value, limit: '20' }
        )
        setStudentResults(data.students || [])
        setSearchState('done')
      } catch (err) {
        setStudentResults([])
        setSearchState('error')
        setSearchError(err instanceof Error ? err.message : 'Search failed')
      }
    }, 300)
    return () => window.clearTimeout(t)
  }, [search, selectedStudent, tab])

  const sectionsForBulk = useMemo(
    () => sections.filter((s) => !bulkClassId || s.classId === bulkClassId),
    [sections, bulkClassId]
  )

  const submit = async (dryRun: boolean) => {
    setBusy(true)
    try {
      if (tab === 'bulk') {
        const filters: Record<string, string> = {}
        if (bulkClassId) filters.classId = bulkClassId
        if (bulkSectionId) filters.sectionId = bulkSectionId
        const res = await api.post<{ result: BulkResultPayload }>('/api/school/fees/demand-slips', {
          scope: 'bulk', month, year, filters, dryRun, force: bulkForce,
        })
        if (dryRun) {
          setBulkPreview(res.result)
        } else {
          toast({
            title: 'Demand slips generated',
            description: `${res.result.successCount} created · ${res.result.skippedCount} skipped · ${res.result.failedCount} failed`,
          })
          onGenerated()
        }
      } else {
        if (!selectedStudent) return
        const res = await api.post<SinglePreview & { result?: { status: string; reason?: string; invoiceNumber?: string } }>(
          '/api/school/fees/demand-slips',
          { scope: 'single', month, year, studentId: selectedStudent.id, dryRun, force: singleForce }
        )
        if (dryRun) {
          setSinglePreview({
            itemCount: res.itemCount,
            subtotal: res.subtotal,
            previousBalance: res.previousBalance,
            totalAmount: res.totalAmount,
          })
        } else {
          const r = res.result
          if (r?.status === 'created') {
            toast({ title: 'Slip generated', description: `Slip ${r.invoiceNumber} created.` })
            onGenerated()
          } else if (r?.status === 'skipped') {
            toast({ title: 'Skipped', description: `Reason: ${r.reason}.`, variant: 'destructive' })
          } else {
            toast({ title: 'Could not generate', description: 'Please try again.', variant: 'destructive' })
          }
        }
      }
    } catch (err) {
      toast({
        title: dryRun ? "Couldn't load preview" : "Couldn't generate",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const canPreviewBulk = !!bulkClassId
  const canPreviewSingle = !!selectedStudent

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Demand Slips · {MONTHS[month - 1].label} {year}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'bulk' | 'single')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="bulk" className="gap-2"><Layers className="size-4" /> Bulk (Class/Section)</TabsTrigger>
            <TabsTrigger value="single" className="gap-2"><UserIcon className="size-4" /> Single Student</TabsTrigger>
          </TabsList>

          <TabsContent value="bulk" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Class</Label>
                <Select value={bulkClassId} onValueChange={(v) => { setBulkClassId(v); setBulkSectionId(''); setBulkPreview(null) }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select a class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Section (optional)</Label>
                <Select value={bulkSectionId || 'all'} onValueChange={(v) => { setBulkSectionId(v === 'all' ? '' : v); setBulkPreview(null) }} disabled={!bulkClassId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="All sections" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sections</SelectItem>
                    {sectionsForBulk.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <Checkbox id="bulk-force" checked={bulkForce} onCheckedChange={(v) => { setBulkForce(!!v); setBulkPreview(null) }} />
              <div>
                <Label htmlFor="bulk-force" className="cursor-pointer text-sm font-medium">Force regenerate</Label>
                <p className="text-xs text-muted-foreground">Replaces existing slips for this month with a fresh sequence number.</p>
              </div>
            </div>
            {bulkPreview && (
              <div className="rounded-md border bg-background p-4">
                <div className="text-sm font-medium">Preview</div>
                <div className="mt-2 grid grid-cols-2 gap-y-1 text-sm sm:grid-cols-4">
                  <div className="text-muted-foreground">Students</div>
                  <div>{bulkPreview.totalStudents}</div>
                  <div className="text-muted-foreground">Will create</div>
                  <div className="font-medium text-foreground">{bulkPreview.successCount}</div>
                  <div className="text-muted-foreground">Will skip</div>
                  <div>{bulkPreview.skippedCount}</div>
                  <div className="text-muted-foreground">Total demand</div>
                  <div className="font-semibold">{formatCurrency(bulkPreview.totalAmount)}</div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="single" className="space-y-4 pt-4">
            {selectedStudent ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                <div>
                  <div className="font-medium">{selectedStudent.firstName} {selectedStudent.lastName}</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedStudent.admissionNumber || '-'}{selectedStudent.class ? ` · ${selectedStudent.class.name}` : ''}{selectedStudent.section ? ` / ${selectedStudent.section.name}` : ''}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedStudent(null); setSinglePreview(null) }}>
                  <X className="size-4" /> Change
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs">Search student</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Type a name or admission number"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 pl-9"
                  />
                </div>
                {studentResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-md border bg-background">
                    {studentResults.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50"
                        onClick={() => { setSelectedStudent(s); setStudentResults([]); setSearch(''); setSearchState('idle') }}
                      >
                        <span className="font-medium">{s.firstName} {s.lastName}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.admissionNumber || '-'}{s.class ? ` · ${s.class.name}` : ''}{s.section ? ` / ${s.section.name}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {searchState === 'searching' && (
                  <p className="px-1 text-xs text-muted-foreground">Searching…</p>
                )}
                {searchState === 'done' && studentResults.length === 0 && (
                  <p className="px-1 text-xs text-muted-foreground">
                    No students matched &ldquo;{search.trim()}&rdquo;. Try a name or full admission number.
                  </p>
                )}
                {searchState === 'error' && (
                  <p className="px-1 text-xs text-destructive">
                    {searchError || 'Search failed. Try again.'}
                  </p>
                )}
              </div>
            )}
            <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <Checkbox id="single-force" checked={singleForce} onCheckedChange={(v) => { setSingleForce(!!v); setSinglePreview(null) }} />
              <div>
                <Label htmlFor="single-force" className="cursor-pointer text-sm font-medium">Force regenerate</Label>
                <p className="text-xs text-muted-foreground">Replaces existing slip for this student/month.</p>
              </div>
            </div>
            {singlePreview && (
              <div className="rounded-md border bg-background p-4">
                <div className="text-sm font-medium">Preview</div>
                {singlePreview.itemCount === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No fee items due for this month — nothing to generate.</p>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
                    <div className="text-muted-foreground">Items</div>
                    <div>{singlePreview.itemCount}</div>
                    <div className="text-muted-foreground">Subtotal</div>
                    <div>{formatCurrency(singlePreview.subtotal)}</div>
                    <div className="text-muted-foreground">Previous balance</div>
                    <div>{formatCurrency(singlePreview.previousBalance)}</div>
                    <div className="text-muted-foreground">Total demand</div>
                    <div className="font-semibold">{formatCurrency(singlePreview.totalAmount)}</div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          {tab === 'bulk' && !bulkPreview && (
            <Button onClick={() => submit(true)} disabled={busy || !canPreviewBulk}>
              {busy ? 'Loading…' : 'Preview'}
            </Button>
          )}
          {tab === 'bulk' && bulkPreview && (
            <>
              <Button variant="outline" onClick={() => setBulkPreview(null)} disabled={busy}>Back</Button>
              <Button onClick={() => submit(false)} disabled={busy}>
                {busy ? 'Generating…' : `Confirm & Generate (${bulkPreview.successCount})`}
              </Button>
            </>
          )}
          {tab === 'single' && !singlePreview && (
            <Button onClick={() => submit(true)} disabled={busy || !canPreviewSingle}>
              {busy ? 'Loading…' : 'Preview'}
            </Button>
          )}
          {tab === 'single' && singlePreview && (
            <>
              <Button variant="outline" onClick={() => setSinglePreview(null)} disabled={busy}>Back</Button>
              <Button onClick={() => submit(false)} disabled={busy || singlePreview.itemCount === 0}>
                {busy ? 'Generating…' : 'Confirm & Generate'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Print helper ──────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtINR(value: number): string {
  return `₹${(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPrintDate(value: string | null | undefined): string {
  if (!value) return '-'
  try { return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return '-' }
}

function printSlip(slip: SlipDetail, school: School | null) {
  const printWindow = window.open('', '_blank', 'width=820,height=1100')
  if (!printWindow) {
    window.print()
    return
  }

  const headerHtml = buildPrintHeaderHtml(school, { fallbackToAutoHeader: true })
  const studentName = `${slip.student.firstName} ${slip.student.lastName}`
  const classLabel = [slip.student.class?.name, slip.student.section?.name].filter(Boolean).join(' / ') || '-'
  const monthLabel = MONTHS[slip.billingMonth - 1]?.label || ''
  const amountDue = (slip.totalAmount || 0) - (slip.paidAmount || 0)

  const linesHtml = slip.lines.map((line) => `
    <tr>
      <td>${escapeHtml(line.feeHeadName)}</td>
      <td>${escapeHtml(line.installmentName)}</td>
      <td class="due">${fmtPrintDate(line.dueDate)}</td>
      <td class="amt">${fmtINR(line.totalAmount)}</td>
    </tr>
  `).join('')

  const notesHtml = slip.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(slip.notes)}</div>` : ''

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Demand Slip ${escapeHtml(slip.invoiceNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12mm; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
  .slip-root { width: 100%; max-width: 186mm; margin: 0 auto; }
  .slip-header { margin-bottom: 8px; }
  .slip-title {
    text-align: center; font-size: 14px; font-weight: 700; letter-spacing: 1.5px;
    text-transform: uppercase; padding: 6px 0; margin: 8px 0 0;
    border-top: 2px solid #000; border-bottom: 2px solid #000;
  }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; padding: 8px 0; border-bottom: 1px dashed #000; }
  .meta div { display: flex; gap: 6px; }
  .meta .lbl { color: #444; min-width: 70px; }
  .meta .val { font-weight: 600; }
  .student-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; padding: 8px 0; border-bottom: 1px dashed #000; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.lines th, table.lines td { border: 1px solid #000; padding: 6px 8px; text-align: left; font-size: 12px; }
  table.lines th { background: #eee; font-weight: 700; text-transform: uppercase; font-size: 11px; }
  table.lines td.due { white-space: nowrap; font-size: 11px; color: #444; }
  table.lines td.amt, table.lines th.amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals { margin-top: 0; }
  .totals table { width: 100%; border-collapse: collapse; }
  .totals td { padding: 4px 8px; font-size: 12px; }
  .totals td.lbl { text-align: right; color: #444; }
  .totals td.amt { text-align: right; width: 130px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .totals tr.grand td { border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 13px; font-weight: 800; padding: 6px 8px; }
  .totals tr.due-row td { font-size: 13px; font-weight: 700; }
  .notes { margin-top: 12px; padding: 8px; border: 1px dashed #000; font-size: 11px; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 36px; }
  .footer .stamp { font-size: 11px; color: #555; }
  .footer .signature { text-align: center; min-width: 200px; }
  .footer .signature .line { border-top: 1px solid #000; padding-top: 4px; font-size: 11px; font-weight: 600; }
  @media print { @page { size: A4 portrait; margin: 10mm; } body { padding: 0; } }
</style>
</head>
<body>
  <div class="slip-root">
    ${headerHtml ? `<div class="slip-header">${headerHtml}</div>` : ''}
    <div class="slip-title">Monthly Fee Demand Slip</div>
    <div class="meta">
      <div><span class="lbl">Slip #:</span><span class="val">${escapeHtml(slip.invoiceNumber)}</span></div>
      <div><span class="lbl">Period:</span><span class="val">${escapeHtml(monthLabel)} ${slip.billingYear}</span></div>
      <div><span class="lbl">Issued:</span><span class="val">${fmtPrintDate(slip.invoiceDate)}</span></div>
      <div><span class="lbl">Due by:</span><span class="val">${fmtPrintDate(slip.dueDate)}</span></div>
    </div>
    <div class="student-row">
      <div><span class="lbl">Student:</span> <strong>${escapeHtml(studentName)}</strong></div>
      <div><span class="lbl">Adm. No.:</span> <strong>${escapeHtml(slip.student.admissionNumber || '-')}</strong></div>
      <div><span class="lbl">Class:</span> <strong>${escapeHtml(classLabel)}</strong></div>
      <div><span class="lbl">Status:</span> <strong style="text-transform:capitalize">${escapeHtml(slip.status)}</strong></div>
    </div>
    <table class="lines">
      <thead>
        <tr><th>Fee Head</th><th>Installment</th><th>Due Date</th><th class="amt">Amount</th></tr>
      </thead>
      <tbody>${linesHtml}</tbody>
    </table>
    <div class="totals">
      <table>
        <tr><td class="lbl">Subtotal</td><td class="amt">${fmtINR(slip.subtotal)}</td></tr>
        <tr><td class="lbl">Previous Balance</td><td class="amt">${fmtINR(slip.previousBalance)}</td></tr>
        <tr class="grand"><td class="lbl">TOTAL DEMANDED</td><td class="amt">${fmtINR(slip.totalAmount)}</td></tr>
        <tr><td class="lbl">Paid So Far</td><td class="amt">${fmtINR(slip.paidAmount)}</td></tr>
        <tr class="due-row"><td class="lbl">AMOUNT DUE</td><td class="amt">${fmtINR(amountDue)}</td></tr>
      </table>
    </div>
    ${notesHtml}
    <div class="footer">
      <div class="stamp">This is a computer-generated demand slip.</div>
      <div class="signature"><div class="line">Authorised Signatory</div></div>
    </div>
  </div>
</body>
</html>`

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()

  // Wait for any banner/logo images to load before invoking print, otherwise
  // the printed page may be missing the school header on slow image loads.
  const triggerPrint = () => {
    try { printWindow.focus(); printWindow.print() } catch { /* noop */ }
  }
  if (printWindow.document.readyState === 'complete') {
    setTimeout(triggerPrint, 50)
  } else {
    printWindow.onload = () => setTimeout(triggerPrint, 50)
  }
}

// ── Slip detail dialog ────────────────────────────────────────────────

interface SlipDetailDialogProps {
  slipId: string | null
  onClose: () => void
  whatsappEnabled: boolean
  onAfterSend: () => void
}

function SlipDetailDialog({ slipId, onClose, whatsappEnabled, onAfterSend }: SlipDetailDialogProps) {
  const { toast } = useToast()
  const currentSchool = useAppStore((state) => state.currentSchool)
  const [slip, setSlip] = useState<SlipDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastNotification, setLastNotification] = useState<NotificationRow | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!slipId) { setSlip(null); setLastNotification(null); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [slipRes, notifRes] = await Promise.all([
          api.get<{ slip: SlipDetail }>(`/api/school/fees/demand-slips/${slipId}`),
          api.get<{ notifications: NotificationRow[] }>('/api/school/fees/demand-slips/notifications', { invoiceId: slipId }).catch(() => ({ notifications: [] as NotificationRow[] })),
        ])
        if (!cancelled) {
          setSlip(slipRes.slip)
          setLastNotification(notifRes.notifications[0] || null)
        }
      } catch {
        if (!cancelled) {
          toast({ title: "Couldn't load slip", description: 'Please try again.', variant: 'destructive' })
          onClose()
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [slipId, toast, onClose])

  const sendWhatsApp = async (force = false) => {
    if (!slip) return
    setSending(true)
    try {
      const res = await api.post<{ notification: NotificationRow }>(`/api/school/fees/demand-slips/${slip.id}/send-whatsapp`, { force })
      setLastNotification(res.notification)
      if (res.notification.status === 'sent') {
        toast({ title: 'Sent', description: `Message delivered to ${res.notification.recipient}.` })
      } else if (res.notification.status === 'failed') {
        toast({ title: 'Send failed', description: res.notification.errorMessage || 'See settings.', variant: 'destructive' })
      } else {
        toast({ title: 'Queued', description: 'Send is in progress — check back in a moment.' })
      }
      onAfterSend()
    } catch (err) {
      toast({
        title: "Couldn't send",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={!!slipId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Demand Slip Detail</DialogTitle>
        </DialogHeader>
        {loading || !slip ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs uppercase text-muted-foreground">Student</div>
                <div className="mt-1 font-medium">{slip.student.firstName} {slip.student.lastName}</div>
                <div className="text-xs text-muted-foreground">
                  {slip.student.admissionNumber || '-'}{slip.student.class ? ` · ${slip.student.class.name}` : ''}{slip.student.section ? ` / ${slip.student.section.name}` : ''}
                </div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs uppercase text-muted-foreground">Slip</div>
                <div className="mt-1 font-mono text-sm">{slip.invoiceNumber}</div>
                <div className="text-xs text-muted-foreground">
                  {MONTHS[slip.billingMonth - 1]?.label} {slip.billingYear} · Due {formatDate(slip.dueDate)}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="h-9 px-3 text-xs">Fee Head</TableHead>
                    <TableHead className="h-9 px-3 text-xs">Installment</TableHead>
                    <TableHead className="h-9 px-3 text-xs">Due</TableHead>
                    <TableHead className="h-9 px-3 text-right text-xs">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slip.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="px-3 py-2 text-sm">{line.feeHeadName}</TableCell>
                      <TableCell className="px-3 py-2 text-sm text-muted-foreground">{line.installmentName}</TableCell>
                      <TableCell className="px-3 py-2 text-xs">{formatDate(line.dueDate)}</TableCell>
                      <TableCell className="px-3 py-2 text-right text-sm font-medium">{formatCurrency(line.totalAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-md border bg-muted/20 p-3">
              <div className="grid grid-cols-2 gap-y-1 text-sm">
                <div className="text-muted-foreground">Subtotal</div>
                <div className="text-right">{formatCurrency(slip.subtotal)}</div>
                <div className="text-muted-foreground">Previous balance</div>
                <div className="text-right">{formatCurrency(slip.previousBalance)}</div>
                <div className="border-t pt-1 font-medium">Total demanded</div>
                <div className="border-t pt-1 text-right font-semibold">{formatCurrency(slip.totalAmount)}</div>
                <div className="text-muted-foreground">Paid so far</div>
                <div className="text-right">{formatCurrency(slip.paidAmount)}</div>
                <div className="text-muted-foreground">Status</div>
                <div className="text-right"><Badge variant={statusVariant(slip.status)} className="capitalize">{slip.status}</Badge></div>
              </div>
            </div>

            {whatsappEnabled && lastNotification && (
              <div className="rounded-md border bg-muted/20 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <MessageCircle className="size-3.5 text-muted-foreground" />
                  <span className="font-medium">Last WhatsApp send</span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-y-0.5">
                  <span className="text-muted-foreground">Status</span>
                  <span className="text-right capitalize">
                    <Badge
                      variant={
                        lastNotification.status === 'failed' ? 'destructive'
                        : lastNotification.status === 'read' ? 'default'
                        : lastNotification.status === 'delivered' ? 'secondary'
                        : lastNotification.status === 'sent' ? 'default'
                        : 'outline'
                      }
                      className={`capitalize gap-1 ${lastNotification.status === 'read' ? 'bg-emerald-600 hover:bg-emerald-600' : ''}`}
                    >
                      {lastNotification.status === 'read' && <CheckCheck className="size-3" />}
                      {lastNotification.status === 'delivered' && <Check className="size-3" />}
                      {lastNotification.status}
                    </Badge>
                  </span>
                  <span className="text-muted-foreground">Recipient</span>
                  <span className="text-right">{lastNotification.recipient}</span>
                  <span className="text-muted-foreground">When</span>
                  <span className="text-right">{lastNotification.sentAt ? formatDate(lastNotification.sentAt) : formatDate(lastNotification.createdAt)}</span>
                  {lastNotification.errorMessage && (
                    <>
                      <span className="text-destructive">Error</span>
                      <span className="text-right text-destructive">{lastNotification.errorMessage}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={() => slip && printSlip(slip, currentSchool)} className="gap-2" disabled={!slip} variant="outline">
            <Printer className="size-4" />
            Print / PDF
          </Button>
          {whatsappEnabled && (
            <Button
              onClick={() => sendWhatsApp(lastNotification?.status === 'sent')}
              disabled={!slip || sending}
              className="gap-2"
            >
              <Send className="size-4" />
              {sending ? 'Sending…' : lastNotification?.status === 'sent' ? 'Resend' : 'Send via WhatsApp'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

