/**
 * Centralised exam status → label + tinted-badge classes (academics style).
 * Use with <Badge variant="outline" className={tone}>.
 */
export const EXAM_STATUS_META: Record<string, { label: string; tone: string }> = {
  draft: {
    label: 'Draft',
    tone: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-500/25 dark:bg-slate-500/10 dark:text-slate-300',
  },
  scheduled: {
    label: 'Scheduled',
    tone: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300',
  },
  ongoing: {
    label: 'Ongoing',
    tone: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300',
  },
  completed: {
    label: 'Completed',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  result_published: {
    label: 'Published',
    tone: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300',
  },
}

export function examStatusMeta(status: string): { label: string; tone: string } {
  return EXAM_STATUS_META[status] ?? EXAM_STATUS_META.draft
}
