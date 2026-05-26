'use client'

import { Suspense } from 'react'
import { FeeCollectionsPage } from '@/features/fees/pages/fee-collections-page'

// Suspense boundary required by Next.js because FeeCollectionsPage reads
// useSearchParams() to resolve the ?preselect=<id> deep-link param.
export default function FeeCollectionsRoute() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
      <FeeCollectionsPage />
    </Suspense>
  )
}
