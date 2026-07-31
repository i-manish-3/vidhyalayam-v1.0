'use client'

import type { LucideIcon } from 'lucide-react'
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

interface GradientDialogHeaderProps {
  icon?: LucideIcon
  title: string
  description?: string
}

export function GradientDialogHeader({ icon: Icon, title, description }: GradientDialogHeaderProps) {
  return (
    <DialogHeader className="relative overflow-hidden border-b border-white/15 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-5 py-4 pr-12 text-white">
      <div aria-hidden className="absolute -right-8 -top-12 size-32 rounded-full border-[16px] border-white/10" />
      <div className="relative flex items-center gap-3">
        {Icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md backdrop-blur-sm">
            <Icon className="size-5 text-white" />
          </span>
        )}
        <div>
          <DialogTitle className="text-lg font-bold tracking-tight text-white">{title}</DialogTitle>
          {description && <DialogDescription className="mt-0.5 text-xs text-white/75">{description}</DialogDescription>}
        </div>
      </div>
    </DialogHeader>
  )
}
