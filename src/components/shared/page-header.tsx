'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowLeft, type LucideIcon } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  titleClassName?: string
  backAction?: {
    onClick: () => void
    label?: string
  }
  action?: {
    label: string
    icon?: LucideIcon
    onClick: () => void
  }
  secondaryAction?: {
    label: string
    icon?: LucideIcon
    onClick: () => void
  }
}

export function PageHeader({ title, description, titleClassName, backAction, action, secondaryAction }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {backAction && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={backAction.onClick}
            className="mt-0.5 size-9 shrink-0"
            aria-label={backAction.label || 'Go back'}
          >
            <ArrowLeft className="size-4" />
          </Button>
        )}
        <div className="min-w-0">
          <h1 className={cn('text-xl font-semibold tracking-tight text-foreground/85', titleClassName)}>{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>
      {(secondaryAction || action) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {action && (
            <Button onClick={action.onClick} className="gap-2">
              {action.icon && <action.icon className="size-4" />}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="outline" onClick={secondaryAction.onClick} className="gap-2">
              {secondaryAction.icon && <secondaryAction.icon className="size-4" />}
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
