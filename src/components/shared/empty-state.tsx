'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="card-premium border-0">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="bg-brand-soft flex size-16 items-center justify-center rounded-2xl text-white shadow-sm ring-4 ring-[color-mix(in_oklab,var(--primary),transparent_88%)]">
          <Icon className="size-8" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">{title}</h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
        {action && (
          <Button onClick={action.onClick} className="mt-4">
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
