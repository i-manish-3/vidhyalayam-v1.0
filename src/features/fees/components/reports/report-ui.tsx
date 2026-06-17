'use client'

import React, { type ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Filter, type LucideIcon } from 'lucide-react'

interface ReportFiltersProps {
  children: ReactNode
  actions?: ReactNode
  className?: string
}

export function ReportFilters({ children, actions, className }: ReportFiltersProps) {
  return (
    <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2">
      <div className="mb-2 flex items-center gap-2">
        <Filter className="size-3.5 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Filters
        </span>
      </div>
      <div className={cn('flex flex-col gap-2 lg:flex-row lg:items-end', className)}>
        <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {children}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}

interface ReportFilterFieldProps {
  label: string
  children: ReactNode
  className?: string
}

export function ReportFilterField({ label, children, className }: ReportFilterFieldProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

interface ReportCardProps {
  title: string
  icon?: LucideIcon
  iconClassName?: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  contentClassName?: string
  className?: string
}

export function ReportCard({
  title,
  icon: Icon,
  iconClassName,
  description,
  actions,
  children,
  contentClassName,
  className,
}: ReportCardProps) {
  return (
    <Card className={cn('border-border/70 shadow-none', className)}>
      <CardHeader className="px-3 py-2.5 sm:px-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              {Icon && <Icon className={cn('size-4 text-primary', iconClassName)} />}
              <span className="min-w-0 truncate">{title}</span>
            </CardTitle>
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className={cn('p-0', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  )
}

export const reportTableHeaderRowClass = 'bg-muted/60 hover:bg-muted/60'
