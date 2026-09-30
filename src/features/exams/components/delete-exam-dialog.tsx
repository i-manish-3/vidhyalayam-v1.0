'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Calendar,
  CheckCircle2,
  Layers,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { evaluateExamProtection, ExamCheckTarget } from '../lib/exam-protection'
import { examStatusMeta } from '../lib/status-meta'

export interface ExamToDelete extends ExamCheckTarget {
  id: string
  name: string
  shortCode?: string | null
  examType?: string
  academicYear?: string
  group?: { id?: string; name: string }
}

interface DeleteExamDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  exam: ExamToDelete | null
  onDeleted?: () => void
}

function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function DeleteExamDialog({
  open,
  onOpenChange,
  exam,
  onDeleted,
}: DeleteExamDialogProps) {
  const { toast } = useToast()
  const [deleting, setDeleting] = useState(false)

  if (!exam) return null

  const protection = evaluateExamProtection(exam)
  const isProtected = protection.isProtected
  const statusMeta = examStatusMeta(exam.status)

  const handleDelete = async () => {
    if (isProtected || deleting) return
    setDeleting(true)
    try {
      const res = await api.delete<{ message?: string }>(`/api/school/exams/${exam.id}`)
      toast({
        title: 'Exam deleted',
        description: res.message || `Exam "${exam.name}" has been deleted.`,
      })
      onOpenChange(false)
      onDeleted?.()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not delete exam',
        description: err instanceof Error ? err.message : 'An unexpected error occurred.',
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!deleting ? onOpenChange(next) : null)}>
      <DialogContent
        className={
          isProtected
            ? 'flex max-h-[90svh] flex-col overflow-hidden border-amber-500/20 bg-card p-0 shadow-2xl shadow-amber-500/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100'
            : 'flex max-h-[90svh] flex-col overflow-hidden border-rose-500/20 bg-card p-0 shadow-2xl shadow-rose-500/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100'
        }
      >
        {/* Header */}
        <DialogHeader
          className={
            isProtected
              ? 'relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#b45309_0%,#d97706_45%,#ea580c_100%)] px-5 py-4 pr-12 text-white sm:px-6'
              : 'relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#dc2626_0%,#e11d48_48%,#7c3aed_100%)] px-5 py-4 pr-12 text-white sm:px-6'
          }
        >
          <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
          <div
            aria-hidden
            className={`absolute -bottom-14 left-10 size-28 rounded-full ${
              isProtected ? 'bg-amber-300/20' : 'bg-rose-300/20'
            } blur-2xl`}
          />
          <div
            aria-hidden
            className={`absolute bottom-0 right-24 h-24 w-44 rounded-full ${
              isProtected ? 'bg-orange-300/20' : 'bg-violet-300/15'
            } blur-2xl`}
          />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
              {isProtected ? <ShieldAlert className="size-5 text-white" /> : <Trash2 className="size-5 text-white" />}
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold tracking-normal text-white">
                {isProtected ? 'Exam Protected From Deletion' : 'Delete Exam'}
              </DialogTitle>
              <DialogDescription className="mt-0.5 truncate text-xs text-white/75">
                {isProtected
                  ? `"${exam.name}" cannot be deleted due to active academic or historical records.`
                  : `Are you sure you want to permanently remove "${exam.name}"?`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div
          className={`themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5 ${
            isProtected
              ? 'bg-gradient-to-br from-amber-500/[0.03] via-background to-orange-500/[0.055]'
              : 'bg-gradient-to-br from-rose-500/[0.03] via-background to-rose-500/[0.055]'
          }`}
        >
          {/* Exam Summary Tile */}
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground text-sm">{exam.name}</span>
                  {exam.shortCode && (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {exam.shortCode}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {exam.group?.name ? `${exam.group.name} · ` : ''}
                  {exam.academicYear ? `${exam.academicYear} · ` : ''}
                  {formatDate(exam.startDate)}
                  {exam.endDate && exam.endDate !== exam.startDate ? ` – ${formatDate(exam.endDate)}` : ''}
                </p>
              </div>
              <Badge variant="outline" className={statusMeta.tone}>
                {statusMeta.label}
              </Badge>
            </div>
          </div>

          {isProtected ? (
            <>
              {/* Protection Reasons Section */}
              <section className="relative overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
                    <Lock className="size-4 text-white" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Active Protection Rules Triggered</h3>
                    <p className="text-[10px] text-muted-foreground">
                      This exam satisfies institutional protection criteria and cannot be deleted
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {protection.reasons.map((reason, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 rounded-lg border border-amber-300/60 bg-amber-100/40 p-2.5 text-xs text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200"
                    >
                      <XCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span className="font-medium leading-relaxed">{reason}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Data Safety Note */}
              <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-blue-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-blue-500/10">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm">
                    <AlertCircle className="size-4 text-white" />
                  </span>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">Why are exams protected?</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Conducted exams and exams with recorded marks represent official student academic history.
                      Deleting them would destroy gradebook integrity, report cards, and parent-accessible records.
                      To update exam details or adjust dates, please use the <strong>Edit Exam</strong> feature instead.
                    </p>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <>
              {/* Safety Check Passed Section */}
              <section className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                    <ShieldCheck className="size-4 text-white" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Protection Check Passed</h3>
                    <p className="text-[10px] text-muted-foreground">
                      This exam has no recorded marks or conducted schedules and is safe to delete
                    </p>
                  </div>
                </div>

                <div className="grid gap-1.5 sm:grid-cols-2 text-xs text-emerald-900 dark:text-emerald-300">
                  <div className="flex items-center gap-2 rounded-md bg-emerald-100/50 dark:bg-emerald-950/40 px-2.5 py-1.5">
                    <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>0 marks recorded</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-md bg-emerald-100/50 dark:bg-emerald-950/40 px-2.5 py-1.5">
                    <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>0 results calculated</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-md bg-emerald-100/50 dark:bg-emerald-950/40 px-2.5 py-1.5">
                    <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Unconducted draft/upcoming</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-md bg-emerald-100/50 dark:bg-emerald-950/40 px-2.5 py-1.5">
                    <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Unpublished & unlocked</span>
                  </div>
                </div>
              </section>

              {/* Items to be removed */}
              <section className="relative overflow-hidden rounded-xl border border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-red-50 p-4 shadow-sm dark:border-rose-500/25 dark:from-rose-500/15 dark:via-card dark:to-red-500/10">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-sm">
                    <Trash2 className="size-4 text-white" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Items Scheduled for Deletion</h3>
                    <p className="text-[10px] text-muted-foreground">The following records will be permanently removed:</p>
                  </div>
                </div>

                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1 pl-1">
                  <li>
                    Exam definition: <strong>{exam.name}</strong>
                  </li>
                  <li>
                    {exam._count?.subjectConfigs ?? 0} subject configuration row(s)
                  </li>
                  <li>
                    {exam._count?.schedules ?? 0} datesheet timetable row(s)
                  </li>
                  <li>All associated class & section links</li>
                </ul>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5 flex items-center justify-between sm:justify-between">
          {isProtected ? (
            <>
              <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 font-medium">
                <Ban className="size-3.5" />
                <span>Protected against accidental deletion</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-4 text-xs"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-4 text-xs"
                onClick={() => onOpenChange(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-8 gap-1.5 px-4 text-xs font-medium"
                onClick={() => void handleDelete()}
                disabled={deleting}
              >
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                {deleting ? 'Deleting exam…' : 'Delete Exam'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
