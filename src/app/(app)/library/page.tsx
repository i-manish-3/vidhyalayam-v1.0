'use client'

import { LibraryPage } from '@/features/operations/pages/library-page'
import { PermissionGuard } from '@/components/shared'

export default function LibraryRoute() {
  return <PermissionGuard page="library"><LibraryPage /></PermissionGuard>
}
