'use client'

import { BulkPhotoUploadPage } from '@/features/students/pages/bulk-photo-upload-page'
import { PermissionGuard } from '@/components/shared'

export default function BulkPhotoUploadRoute() {
  return (
    <PermissionGuard page="students">
      <BulkPhotoUploadPage />
    </PermissionGuard>
  )
}
