'use client'

import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type TintedStatTone =
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'emerald'
  | 'teal'
  | 'violet'
  | 'purple'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'red'
  | 'pink'

const TONE_STYLES: Record<TintedStatTone, { card: string; icon: string; value: string }> = {
  sky: {
    card: 'border-sky-200/80 from-sky-50 via-white to-cyan-50 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10',
    icon: 'from-sky-500 to-cyan-600',
    value: 'text-sky-700 dark:text-sky-300',
  },
  blue: {
    card: 'border-blue-200/80 from-blue-50 via-white to-indigo-50 dark:border-blue-500/25 dark:from-blue-500/15 dark:via-card dark:to-indigo-500/10',
    icon: 'from-blue-500 to-indigo-600',
    value: 'text-blue-700 dark:text-blue-300',
  },
  indigo: {
    card: 'border-indigo-200/80 from-indigo-50 via-white to-violet-50 dark:border-indigo-500/25 dark:from-indigo-500/15 dark:via-card dark:to-violet-500/10',
    icon: 'from-indigo-500 to-violet-600',
    value: 'text-indigo-700 dark:text-indigo-300',
  },
  emerald: {
    card: 'border-emerald-200/80 from-emerald-50 via-white to-teal-50 dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10',
    icon: 'from-emerald-500 to-teal-600',
    value: 'text-emerald-700 dark:text-emerald-300',
  },
  teal: {
    card: 'border-teal-200/80 from-teal-50 via-white to-emerald-50 dark:border-teal-500/25 dark:from-teal-500/15 dark:via-card dark:to-emerald-500/10',
    icon: 'from-teal-500 to-emerald-600',
    value: 'text-teal-700 dark:text-teal-300',
  },
  violet: {
    card: 'border-violet-200/80 from-violet-50 via-white to-purple-50 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10',
    icon: 'from-violet-500 to-purple-600',
    value: 'text-violet-700 dark:text-violet-300',
  },
  purple: {
    card: 'border-purple-200/80 from-purple-50 via-white to-fuchsia-50 dark:border-purple-500/25 dark:from-purple-500/15 dark:via-card dark:to-fuchsia-500/10',
    icon: 'from-purple-500 to-fuchsia-600',
    value: 'text-purple-700 dark:text-purple-300',
  },
  amber: {
    card: 'border-amber-200/80 from-amber-50 via-white to-orange-50 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10',
    icon: 'from-amber-500 to-orange-600',
    value: 'text-amber-700 dark:text-amber-300',
  },
  orange: {
    card: 'border-orange-200/80 from-orange-50 via-white to-amber-50 dark:border-orange-500/25 dark:from-orange-500/15 dark:via-card dark:to-amber-500/10',
    icon: 'from-orange-500 to-amber-600',
    value: 'text-orange-700 dark:text-orange-300',
  },
  rose: {
    card: 'border-rose-200/80 from-rose-50 via-white to-pink-50 dark:border-rose-500/25 dark:from-rose-500/15 dark:via-card dark:to-pink-500/10',
    icon: 'from-rose-500 to-pink-600',
    value: 'text-rose-700 dark:text-rose-300',
  },
  red: {
    card: 'border-red-200/80 from-red-50 via-white to-rose-50 dark:border-red-500/25 dark:from-red-500/15 dark:via-card dark:to-rose-500/10',
    icon: 'from-red-500 to-rose-600',
    value: 'text-red-700 dark:text-red-300',
  },
  pink: {
    card: 'border-pink-200/80 from-pink-50 via-white to-rose-50 dark:border-pink-500/25 dark:from-pink-500/15 dark:via-card dark:to-rose-500/10',
    icon: 'from-pink-500 to-rose-600',
    value: 'text-pink-700 dark:text-pink-300',
  },
}

interface TintedStatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  note?: string
  tone?: TintedStatTone | string
}

export function TintedStatCard({ icon: Icon, label, value, note, tone = 'sky' }: TintedStatCardProps) {
  const styles = (tone && (tone in TONE_STYLES)) ? TONE_STYLES[tone as TintedStatTone] : TONE_STYLES.sky
  return (
    <Card className={cn('group gap-0 border bg-gradient-to-r py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', styles.card)}>
      <CardContent className="flex items-center gap-2.5 p-2.5">
        <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm', styles.icon)}>
          <Icon className="size-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={cn('text-lg font-bold leading-tight', styles.value)}>{value}</p>
          {note && <p className="truncate text-[11px] text-muted-foreground">{note}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
