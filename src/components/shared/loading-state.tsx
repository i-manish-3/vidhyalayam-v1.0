'use client'

import { Skeleton } from '@/components/ui/skeleton'

export function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-6 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border">
        <div className="p-6 space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  )
}
