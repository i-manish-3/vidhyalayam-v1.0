'use client'

import { Suspense } from 'react'
import { ParentAttendancePage } from '@/features/attendance/pages/parent-attendance-page'
import { PermissionGuard } from '@/components/shared'

export default function ParentAttendanceRoute() {
  return (
    <PermissionGuard page="parent-attendance">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        }
      >
        <ParentAttendancePage />
      </Suspense>
    </PermissionGuard>
  )
}
