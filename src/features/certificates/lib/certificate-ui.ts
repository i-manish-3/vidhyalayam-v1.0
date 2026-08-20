export interface CardTone {
  card: string
  header: string
  icon: string
}

export const CARD_TONES: CardTone[] = [
  {
    card: 'border-sky-200/80 from-sky-50 via-white to-cyan-50 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10',
    header: 'from-sky-500/[0.08] via-white/40 to-cyan-500/[0.08]',
    icon: 'from-sky-500 to-cyan-600',
  },
  {
    card: 'border-emerald-200/80 from-emerald-50 via-white to-teal-50 dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10',
    header: 'from-emerald-500/[0.08] via-white/40 to-teal-500/[0.08]',
    icon: 'from-emerald-500 to-teal-600',
  },
  {
    card: 'border-violet-200/80 from-violet-50 via-white to-purple-50 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10',
    header: 'from-violet-500/[0.08] via-white/40 to-purple-500/[0.08]',
    icon: 'from-violet-500 to-purple-600',
  },
  {
    card: 'border-amber-200/80 from-amber-50 via-white to-orange-50 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10',
    header: 'from-amber-500/[0.08] via-white/40 to-orange-500/[0.08]',
    icon: 'from-amber-500 to-orange-600',
  },
]

export function certificateStatusMeta(status: string): { label: string; tone: string } {
  if (status === 'void') {
    return {
      label: 'Void',
      tone: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300',
    }
  }
  return {
    label: 'Active',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300',
  }
}

export const TEMPORARY_BADGE =
  'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300'