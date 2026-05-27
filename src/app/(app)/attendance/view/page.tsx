'use client'

import { Suspense } from 'react'
import { ViewAttendancePage } from '@/features/attendance/pages/view-attendance-page'

export default function ViewAttendanceRoute() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
      <ViewAttendancePage />
    </Suspense>
  )
}
