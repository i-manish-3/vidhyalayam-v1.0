/**
 * KpiCard — primary metric tile for the Fee Reports dashboard.
 *
 * Visual hierarchy:
 *   - Icon + label at the top (small, muted)
 *   - Big number in the middle
 *   - Sub-line at the bottom (delta, count, or hint — optional)
 *
 * Tones drive accent colour. Default 'primary' matches the brand. Use 'success'
 * for collections, 'warning' for outstanding, 'danger' for overdue, 'muted' for
 * informational tiles.
 */

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'muted'

interface KpiCardProps {
  label: string
  value: string | number
  hint?: string | React.ReactNode
  icon?: LucideIcon
  tone?: Tone
  loading?: boolean
  /** Optional trailing element to the right of the number */
  badge?: React.ReactNode
}

const TONE_STYLES: Record<Tone, { ring: string; iconBg: string; iconFg: string; number: string }> = {
  primary: { ring: 'ring-blue-100', iconBg: 'bg-blue-50', iconFg: 'text-blue-600', number: 'text-gray-900' },
  success: { ring: 'ring-emerald-100', iconBg: 'bg-emerald-50', iconFg: 'text-emerald-600', number: 'text-emerald-700' },
  warning: { ring: 'ring-amber-100', iconBg: 'bg-amber-50', iconFg: 'text-amber-600', number: 'text-amber-700' },
  danger: { ring: 'ring-red-100', iconBg: 'bg-red-50', iconFg: 'text-red-600', number: 'text-red-700' },
  muted: { ring: 'ring-gray-100', iconBg: 'bg-gray-100', iconFg: 'text-gray-600', number: 'text-gray-900' },
}

export function KpiCard({ label, value, hint, icon: Icon, tone = 'primary', loading, badge }: KpiCardProps) {
  const styles = TONE_STYLES[tone]

  return (
    <Card className={cn('relative overflow-hidden ring-1 transition-shadow hover:shadow-sm', styles.ring)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {Icon && (
              <span className={cn('inline-flex size-8 items-center justify-center rounded-md', styles.iconBg)}>
                <Icon className={cn('size-4', styles.iconFg)} />
              </span>
            )}
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </span>
          </div>
          {badge}
        </div>
        <div className="mt-3">
          {loading ? (
            <div className="h-7 w-24 animate-pulse rounded bg-gray-200" />
          ) : (
            <div className={cn('text-2xl font-bold tracking-tight tabular-nums', styles.number)}>
              {value}
            </div>
          )}
          {hint && !loading && (
            <div className="mt-1 text-xs text-muted-foreground">
              {hint}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
