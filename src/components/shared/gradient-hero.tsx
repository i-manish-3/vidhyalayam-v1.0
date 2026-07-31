'use client'

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export interface GradientHeroAction {
  label: string
  icon?: LucideIcon
  onClick: () => void
  disabled?: boolean
}

interface GradientHeroProps {
  icon: LucideIcon
  title: string
  badge?: ReactNode
  description?: string
  primaryAction?: GradientHeroAction
  secondaryAction?: GradientHeroAction
  extraActions?: ReactNode
}

export function GradientHero({
  icon: Icon,
  title,
  badge,
  description,
  primaryAction,
  secondaryAction,
  extraActions,
}: GradientHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15">
      <div aria-hidden className="absolute -right-9 -top-14 size-36 rounded-full border-[18px] border-white/10" />
      <div aria-hidden className="absolute -bottom-14 right-1/4 size-28 rounded-full bg-violet-300/10 blur-xl" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <Icon className="size-5 text-white" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{title}</h1>
              {badge && (
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85">
                  {badge}
                </span>
              )}
            </div>
            {description && <p className="mt-0.5 text-xs text-white/80">{description}</p>}
          </div>
        </div>
        {(primaryAction || secondaryAction || extraActions) && (
          <div className="relative flex flex-wrap items-center gap-2">
            {extraActions}
            {secondaryAction && (
              <Button
                variant="secondary"
                onClick={secondaryAction.onClick}
                disabled={secondaryAction.disabled}
                className="gap-2 border border-white/60 bg-white/15 text-white shadow-md backdrop-blur-sm hover:bg-white/25"
              >
                {secondaryAction.icon && <secondaryAction.icon className="size-4" />}
                {secondaryAction.label}
              </Button>
            )}
            {primaryAction && (
              <Button
                variant="secondary"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                className="relative gap-2 border border-white/60 shadow-md"
                style={{ backgroundColor: 'white', color: 'var(--primary)' }}
              >
                {primaryAction.icon && <primaryAction.icon className="size-4" />}
                {primaryAction.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
