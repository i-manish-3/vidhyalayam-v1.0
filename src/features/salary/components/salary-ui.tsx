'use client'

import type { LucideIcon } from 'lucide-react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'

// ============================================
// Hero — branded gradient banner (student-module style)
// ============================================

export interface SalaryHeroAction {
  label: string
  icon?: LucideIcon
  onClick: () => void
}

export function SalaryHero({
  icon: Icon,
  title,
  description,
  badge,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  badge?: string
  action?: SalaryHeroAction
}) {
  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
      <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
      <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
      <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
      <div className="relative flex min-w-0 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
          <Icon className="size-5.5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            {badge && (
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-white/80">{description}</p>
        </div>
      </div>
      {action && (
        <Button
          variant="secondary"
          onClick={action.onClick}
          className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-transform hover:-translate-y-0.5 hover:shadow-lg"
          style={{ backgroundColor: 'white', color: 'var(--primary)' }}
        >
          {action.icon && <action.icon className="size-4" />}
          {action.label}
        </Button>
      )}
    </div>
  )
}

// ============================================
// Stat card — per-tone gradient card
// ============================================

export type SalaryStatTone = 'sky' | 'emerald' | 'rose' | 'violet' | 'amber' | 'teal'

const TONE_STYLES: Record<SalaryStatTone, { card: string; icon: string; accent: string; bubble: string }> = {
  sky: {
    card: 'border-sky-500/20 bg-gradient-to-br from-sky-500/[0.15] via-card to-sky-500/[0.05]',
    icon: 'bg-gradient-to-br from-sky-500 to-sky-600 shadow-sky-500/20',
    accent: 'from-sky-500 via-sky-400',
    bubble: 'bg-sky-500/[0.10]',
  },
  emerald: {
    card: 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.15] via-card to-emerald-500/[0.05]',
    icon: 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/20',
    accent: 'from-emerald-500 via-emerald-400',
    bubble: 'bg-emerald-500/[0.10]',
  },
  rose: {
    card: 'border-rose-500/20 bg-gradient-to-br from-rose-500/[0.14] via-card to-rose-500/[0.05]',
    icon: 'bg-gradient-to-br from-rose-500 to-rose-600 shadow-rose-500/20',
    accent: 'from-rose-500 via-rose-400',
    bubble: 'bg-rose-500/[0.10]',
  },
  violet: {
    card: 'border-violet-500/20 bg-gradient-to-br from-violet-500/[0.14] via-card to-violet-500/[0.05]',
    icon: 'bg-gradient-to-br from-violet-500 to-violet-600 shadow-violet-500/20',
    accent: 'from-violet-500 via-violet-400',
    bubble: 'bg-violet-500/[0.10]',
  },
  amber: {
    card: 'border-amber-500/20 bg-gradient-to-br from-amber-500/[0.14] via-card to-amber-500/[0.05]',
    icon: 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/20',
    accent: 'from-amber-500 via-amber-400',
    bubble: 'bg-amber-500/[0.10]',
  },
  teal: {
    card: 'border-teal-500/20 bg-gradient-to-br from-teal-500/[0.14] via-card to-teal-500/[0.05]',
    icon: 'bg-gradient-to-br from-teal-500 to-teal-600 shadow-teal-500/20',
    accent: 'from-teal-500 via-teal-400',
    bubble: 'bg-teal-500/[0.10]',
  },
}

export function SalaryStatCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string
  value: string | number
  description: string
  icon: LucideIcon
  tone: SalaryStatTone
}) {
  const styles = TONE_STYLES[tone]
  return (
    <Card
      className={cn(
        'group relative w-full overflow-hidden rounded-xl py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
        styles.card,
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent', styles.accent)} />
      <div
        aria-hidden
        className={cn('absolute -bottom-7 -right-5 size-16 rounded-full transition-transform group-hover:scale-125', styles.bubble)}
      />
      <CardContent className="relative p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">{title}</p>
            <p className="text-lg font-bold leading-6 tracking-tight tabular-nums">{value}</p>
            <p className="truncate text-[10px] leading-3 text-muted-foreground">{description}</p>
          </div>
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm', styles.icon)}>
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================
// Table card shell — header band + table + footer
// ============================================

export function SalaryTableCard({
  title,
  icon: Icon,
  badge,
  children,
  footer,
}: {
  title: string
  icon: LucideIcon
  badge?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
      <div className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
              <Icon className="size-4" />
            </span>
            <h3 className="text-base font-semibold tracking-tight">{title}</h3>
            {badge && (
              <span className="ml-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
                {badge}
              </span>
            )}
          </div>
        </div>
      </div>
      {children}
      {footer && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-sky-500/10 bg-gradient-to-r from-sky-500/[0.045] via-transparent to-violet-500/[0.045] px-4 py-2.5 text-[11px] text-muted-foreground">
          {footer}
        </div>
      )}
    </Card>
  )
}

// ============================================
// Pagination — rows-per-page + ellipsis page buttons
// ============================================

const DEFAULT_SIZES = [10, 25, 50, 100]

export function SalaryPagination({
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  label = 'records',
  sizes = DEFAULT_SIZES,
  includeAll = false,
}: {
  page: number
  limit: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  label?: string
  sizes?: number[]
  includeAll?: boolean
}) {
  const displayLimit = limit === 0 ? total : limit
  const from = total === 0 ? 0 : (page - 1) * displayLimit + 1
  const to = Math.min(page * displayLimit, total)
  const effectivePages = Math.max(totalPages, 1)

  const getPageNumbers = (): (number | 'ellipsis-start' | 'ellipsis-end')[] => {
    if (effectivePages <= 5) {
      return Array.from({ length: effectivePages }, (_, i) => i + 1)
    }
    const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = []
    if (page <= 3) {
      pages.push(1, 2, 3, 4, 'ellipsis-end', effectivePages)
    } else if (page >= effectivePages - 2) {
      pages.push(1, 'ellipsis-start', effectivePages - 3, effectivePages - 2, effectivePages - 1, effectivePages)
    } else {
      pages.push(1, 'ellipsis-start', page - 1, page, page + 1, 'ellipsis-end', effectivePages)
    }
    return pages
  }

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-sky-500/10 px-4 py-3 sm:flex-row">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {onPageSizeChange ? (
          <>
            <span>Rows per page:</span>
            <Select
              value={limit === 0 ? 'all' : String(limit)}
              onValueChange={(v) => onPageSizeChange(v === 'all' ? 0 : Number(v))}
            >
              <SelectTrigger className="h-8 w-[78px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sizes.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
                {includeAll && (
                  <SelectItem value="all">All</SelectItem>
                )}
              </SelectContent>
            </Select>
          </>
        ) : (
          <span />
        )}
        <span className="ml-2">
          Showing {from} to {to} of {total} {label}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="size-4" />
        </Button>
        {getPageNumbers().map((p, i) => {
          if (p === 'ellipsis-start' || p === 'ellipsis-end') {
            return (
              <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground">
                ...
              </span>
            )
          }
          return (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="icon"
              className="size-8 text-xs"
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          )
        })}
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= effectivePages}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// ============================================
// Small shared bits
// ============================================

export function ToneDot({ className }: { className?: string }) {
  return <span className={cn('size-2 rounded-full', className)} />
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ToneDot className={color} />
      {label}
    </span>
  )
}

// ============================================
// Modal (dialog) convention — gradient header + sectioned body
// ============================================

export const MODAL_CONTENT_CLASSES =
  'flex max-h-[90svh] flex-col overflow-hidden border-emerald-500/20 bg-card p-0 shadow-2xl shadow-emerald-500/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100'

export function ModalHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#10b981,#0d9488_45%,#0891b2)] px-5 py-4 pr-12 text-white sm:px-6">
      <div aria-hidden className="absolute -right-6 -top-10 size-28 rounded-full border-[18px] border-white/10" />
      <div aria-hidden className="absolute -bottom-12 right-16 size-20 rounded-full bg-cyan-300/20 blur-2xl" />
      <div className="relative flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 backdrop-blur-sm">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <DialogTitle className="text-lg font-bold tracking-tight text-white">{title}</DialogTitle>
          {description && (
            <DialogDescription className="mt-0.5 text-xs text-white/75">{description}</DialogDescription>
          )}
        </div>
      </div>
    </div>
  )
}

export function ModalSection({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-4 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-emerald-500/10">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm">
          <Icon className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}