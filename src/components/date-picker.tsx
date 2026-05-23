'use client'

import { useState } from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  disableFuture?: boolean
  disablePast?: boolean
  showQuickActions?: boolean
  yearDropdown?: boolean
  yearsBack?: number
  placeholder?: string
  className?: string
  triggerClassName?: string
}

function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fromYmd(s: string): Date | undefined {
  if (!s) return undefined
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return undefined
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function formatLabel(s: string, placeholder: string): string {
  const d = fromYmd(s)
  if (!d) return placeholder
  const today = startOfToday()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (toYmd(d) === toYmd(today)) return 'Today'
  if (toYmd(d) === toYmd(yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

export function DatePicker({
  value,
  onChange,
  disableFuture,
  disablePast,
  showQuickActions = true,
  yearDropdown = false,
  yearsBack = 100,
  placeholder = 'Pick date',
  className,
  triggerClassName,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = fromYmd(value)
  const today = startOfToday()

  const applyOffset = (days: number) => {
    const d = new Date(today)
    d.setDate(today.getDate() + days)
    if (disableFuture && d > today) return
    if (disablePast && d < today) return
    onChange(toYmd(d))
    setOpen(false)
  }

  const todayYmd = toYmd(today)
  const yesterdayYmd = toYmd(new Date(today.getTime() - 86400000))

  const startMonth = yearDropdown ? new Date(today.getFullYear() - yearsBack, 0, 1) : undefined
  const endMonth = yearDropdown
    ? (disableFuture ? new Date(today.getFullYear(), 11, 31) : new Date(today.getFullYear() + 10, 11, 31))
    : undefined

  const disabledMatcher = disableFuture && disablePast
    ? [{ before: today }, { after: today }]
    : disableFuture
      ? { after: today }
      : disablePast
        ? { before: today }
        : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-9 gap-1.5 px-3 text-sm font-normal justify-start', triggerClassName, className)}
        >
          <CalendarIcon className="size-3.5 text-muted-foreground" />
          <span className="truncate">{formatLabel(value, placeholder)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {showQuickActions && (
          <div className="grid grid-cols-2 gap-1 border-b p-2">
            <Button
              type="button"
              variant={value === todayYmd ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => applyOffset(0)}
            >
              Today
            </Button>
            <Button
              type="button"
              variant={value === yesterdayYmd ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => applyOffset(-1)}
            >
              Yesterday
            </Button>
          </div>
        )}
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? today}
          onSelect={(d) => {
            if (!d) return
            onChange(toYmd(d))
            setOpen(false)
          }}
          disabled={disabledMatcher}
          captionLayout={yearDropdown ? 'dropdown' : 'label'}
          startMonth={startMonth}
          endMonth={endMonth}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
