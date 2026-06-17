/**
 * ReconciliationBar — shows the accounting identity that every fee report must
 * satisfy, so an admin can trust the numbers at a glance:
 *
 *   Billed = Collected + Waived + Outstanding   (cash refunds are reported
 *                                                separately; they net out of
 *                                                both Billed and Collected)
 *
 * A single proportion bar visualises how the billed amount splits, and an
 * explicit "balances" check confirms the parts add up to the whole.
 */

'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '../audit-field-list'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface ReconciliationBarProps {
  billed: number
  collected: number
  waived: number
  outstanding: number
  refunded?: number
  generatedAt?: string
  loading?: boolean
  /**
   * When collected/waived are scoped to a date window but billed/outstanding are
   * not, the identity legitimately won't balance — pass true to show an
   * explanatory note instead of a false "mismatch" warning.
   */
  collectionWindowed?: boolean
}

const SEGMENTS = [
  { key: 'collected', label: 'Collected', color: 'bg-emerald-500', text: 'text-emerald-700',
    help: 'Money actually received against fees (cash, UPI, cheque, online — and advance applied to dues).' },
  { key: 'waived', label: 'Waived', color: 'bg-violet-500', text: 'text-violet-700',
    help: 'Discounts, concessions and scholarships granted. Reduces the dues but is not cash received.' },
  { key: 'outstanding', label: 'Outstanding', color: 'bg-amber-500', text: 'text-amber-700',
    help: 'Fees still unpaid (open + partly-paid charges). Includes both overdue and not-yet-due amounts.' },
] as const

export function ReconciliationBar({
  billed, collected, waived, outstanding, refunded = 0, generatedAt, loading,
  collectionWindowed = false,
}: ReconciliationBarProps) {
  const parts = { collected, waived, outstanding }
  const sum = collected + waived + outstanding
  // Allow ₹1 rounding slack across many rows before flagging a mismatch.
  const balances = Math.abs(sum - billed) < 1
  const denom = billed > 0 ? billed : 1

  return (
    <Card className="border-border/70 shadow-none ring-1 ring-gray-100">
      <CardContent className="p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">Where the money stands</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                Total Billed = Collected + Waived + Outstanding. These always add up to the billed
                amount. Cash refunds are shown separately because they cancel out of both billed and
                collected.
              </TooltipContent>
            </Tooltip>
          </div>
          {generatedAt && !loading && (
            <span className="text-[11px] text-muted-foreground">
              as of {new Date(generatedAt).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
              })}
            </span>
          )}
        </div>

        {loading ? (
          <div className="h-3 w-full animate-pulse rounded-full bg-gray-200" />
        ) : (
          <>
            {/* Proportion bar */}
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
              {SEGMENTS.map(seg => {
                const val = parts[seg.key]
                const pct = (val / denom) * 100
                if (pct <= 0) return null
                return (
                  <div
                    key={seg.key}
                    className={cn('h-full transition-all', seg.color)}
                    style={{ width: `${pct}%` }}
                    title={`${seg.label}: ${formatCurrency(val)}`}
                  />
                )
              })}
            </div>

            {/* Legend with values */}
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Billed</div>
                <div className="text-sm font-bold tabular-nums text-gray-900">{formatCurrency(billed)}</div>
              </div>
              {SEGMENTS.map(seg => (
                <div key={seg.key}>
                  <div className="flex items-center gap-1.5">
                    <span className={cn('size-2 rounded-full', seg.color)} />
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{seg.label}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="size-3 text-muted-foreground/60 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[220px] text-xs">{seg.help}</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className={cn('text-sm font-bold tabular-nums', seg.text)}>
                    {formatCurrency(parts[seg.key])}
                  </div>
                </div>
              ))}
            </div>

            {/* Balance check + refunds */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2">
              {collectionWindowed ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="size-3.5" />
                  Collected/Waived are for the selected date range; Billed/Outstanding are for the full year
                </span>
              ) : balances ? (
                <span className="flex items-center gap-1.5 text-xs text-emerald-700">
                  <CheckCircle2 className="size-3.5" />
                  Collected + Waived + Outstanding = Billed
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
                  <AlertCircle className="size-3.5" />
                  Mismatch of {formatCurrency(Math.abs(sum - billed))} — figures don&apos;t reconcile
                </span>
              )}
              {refunded > 0 && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full bg-rose-400" />
                  Cash refunds paid back: <span className="font-medium tabular-nums">{formatCurrency(refunded)}</span>
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
