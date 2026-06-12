import { PermissionGuard } from '@/components/shared'
import { AttendanceCredentialsPage } from '@/features/attendance/pages/attendance-credentials-page'

export default function AttendanceCredentialsRoute() {
  return (
    <PermissionGuard page="attendance-credentials">
      <AttendanceCredentialsPage />
    </PermissionGuard>
  )
}
