'use client'

import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  icon: LucideIcon
  trend?: {
    value: number
    isPositive: boolean
  }
  className?: string
}

export function StatsCard({ title, value, description, icon: Icon, trend, className }: StatsCardProps) {
  return (
    <Card className={cn('card-premium relative overflow-hidden border-0 p-0', className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight tabular-nums">{value}</p>
            {trend && (
              <div className="flex items-center gap-1 text-xs">
                {trend.isPositive ? (
                  <TrendingUp className="size-3 text-emerald-600" />
                ) : (
                  <TrendingDown className="size-3 text-red-500" />
                )}
                <span className={trend.isPositive ? 'text-emerald-600' : 'text-red-500'}>
                  {trend.isPositive ? '+' : ''}{trend.value}%
                </span>
                {description && (
                  <span className="text-muted-foreground ml-1">{description}</span>
                )}
              </div>
            )}
            {!trend && description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="bg-brand-soft flex size-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm">
            <Icon className="size-6" />
          </div>
        </div>
      </CardContent>
      <div className="bg-brand absolute bottom-0 left-0 h-1 w-full opacity-90" />
    </Card>
  )
}
