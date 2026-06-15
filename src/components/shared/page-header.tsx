'use client'

import { type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type LucideIcon } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  titleClassName?: string
  /**
   * Deprecated: back buttons are no longer shown on pages. The prop is kept so
   * existing callers continue to compile, but it is intentionally ignored.
   */
  backAction?: {
    onClick: () => void
    label?: string
  }
  action?: {
    label: string
    icon?: LucideIcon
    iconClassName?: string
    onClick: () => void
    disabled?: boolean
  }
  secondaryAction?: {
    label: string
    icon?: LucideIcon
    iconClassName?: string
    onClick: () => void
    disabled?: boolean
  }
  /**
   * Render an arbitrary node (e.g. a "How it works" guide button) to the LEFT
   * of the action buttons. Useful when a page needs a tertiary affordance that
   * doesn't fit the standard primary/secondary action shape.
   */
  extraActions?: ReactNode
}

export function PageHeader({ title, description, titleClassName, action, secondaryAction, extraActions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-stretch gap-3">
        <span aria-hidden className="bg-brand mt-0.5 w-1 shrink-0 self-stretch rounded-full" />
        <div className="min-w-0">
          <h1 className={cn('text-xl font-semibold tracking-tight text-foreground/90', titleClassName)}>{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>
      {(extraActions || secondaryAction || action) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {extraActions}
          {action && (
            <Button onClick={action.onClick} disabled={action.disabled} className="gap-2">
              {action.icon && <action.icon className={cn('size-4', action.iconClassName)} />}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="outline" onClick={secondaryAction.onClick} disabled={secondaryAction.disabled} className="gap-2">
              {secondaryAction.icon && <secondaryAction.icon className={cn('size-4', secondaryAction.iconClassName)} />}
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
