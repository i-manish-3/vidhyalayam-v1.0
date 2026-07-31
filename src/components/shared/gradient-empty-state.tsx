'use client'

import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface GradientEmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function GradientEmptyState({ icon: Icon, title, description, actionLabel, onAction }: GradientEmptyStateProps) {
  return (
    <Card className="relative gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
      <div aria-hidden className="absolute -right-8 -top-10 size-28 rounded-full border-[14px] border-sky-200/25 dark:border-sky-500/10" />
      <CardContent className="relative flex flex-col items-center justify-center py-10 text-center">
        <span className="mb-3 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-md">
          <Icon className="size-6 text-white" />
        </span>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {actionLabel && onAction && (
          <Button size="sm" onClick={onAction} className="mt-3 h-8 gap-1.5 px-3 text-xs">
            {actionLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
