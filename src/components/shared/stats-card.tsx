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
    <Card className={cn('relative overflow-hidden', className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
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
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="size-6 text-primary" />
          </div>
        </div>
      </CardContent>
      <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/40" />
    </Card>
  )
}
