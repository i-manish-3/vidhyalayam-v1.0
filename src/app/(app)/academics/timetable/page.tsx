'use client'

import { TimetablePage } from '@/features/academics/pages/timetable-page'
import { PermissionGuard } from '@/components/shared'

export default function TimetableRoute() {
  return (
    <PermissionGuard page="timetable">
      <TimetablePage />
    </PermissionGuard>
  )
}
