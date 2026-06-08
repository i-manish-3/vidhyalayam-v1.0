'use client'

import { AddHostelPage } from '@/features/hostel/pages/add-hostel-page'
import { PermissionGuard } from '@/components/shared'

export default function AddHostelRoute() {
  return <PermissionGuard page="add-hostel"><AddHostelPage /></PermissionGuard>
}
