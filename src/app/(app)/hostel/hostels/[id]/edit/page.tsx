'use client'

import { EditHostelPage } from '@/features/hostel/pages/edit-hostel-page'
import { PermissionGuard } from '@/components/shared'

export default function EditHostelRoute() {
  return <PermissionGuard page="edit-hostel"><EditHostelPage /></PermissionGuard>
}
