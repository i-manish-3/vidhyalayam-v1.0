'use client'

import { useAppStore } from '@/lib/store'
import { SupportPage } from '@/features/communications/pages/support-page'
import { SupportRequestPage } from '@/features/communications/pages/support-request-page'

// One route, two views: the platform owner manages every school's tickets; a
// school user raises and tracks their own.
export default function SupportRoute() {
  const role = useAppStore((s) => s.user?.role)
  if (role === 'SUPER_ADMIN') return <SupportPage />
  return <SupportRequestPage />
}
