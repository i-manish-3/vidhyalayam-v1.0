'use client'

import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type TintedStatTone = 'sky' | 'emerald' | 'violet' | 'amber'

const TONE_STYLES: Record<TintedStatTone, { card: string; icon: string; value: string }> = {
  sky: {
    card: 'border-sky-200/80 from-sky-50 via-white to-cyan-50 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10',
    icon: 'from-sky-500 to-cyan-600',
    value: 'text-sky-700 dark:text-sky-300',
  },
  emerald: {
    card: 'border-emerald-200/80 from-emerald-50 via-white to-teal-50 dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10',
    icon: 'from-emerald-500 to-teal-600',
    value: 'text-emerald-700 dark:text-emerald-300',
  },
  violet: {
    card: 'border-violet-200/80 from-violet-50 via-white to-purple-50 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10',
    icon: 'from-violet-500 to-purple-600',
    value: 'text-violet-700 dark:text-violet-300',
  },
  amber: {
    card: 'border-amber-200/80 from-amber-50 via-white to-orange-50 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10',
    icon: 'from-amber-500 to-orange-600',
    value: 'text-amber-700 dark:text-amber-300',
  },
}

interface TintedStatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  note?: string
  tone?: TintedStatTone
}

export function TintedStatCard({ icon: Icon, label, value, note, tone = 'sky' }: TintedStatCardProps) {
  const styles = TONE_STYLES[tone]
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
