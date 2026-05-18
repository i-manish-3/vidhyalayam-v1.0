'use client'

import { Button } from '@/components/ui/button'
import type { LucideIcon } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  action?: {
    label: string
    icon?: LucideIcon
    onClick: () => void
  }
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {action && (
        <Button onClick={action.onClick} className="gap-2 shrink-0">
          {action.icon && <action.icon className="size-4" />}
          {action.label}
        </Button>
      )}
    </div>
  )
}
