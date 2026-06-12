import { PermissionGuard } from '@/components/shared/permission-guard'
import { EmployeeAttendancePage } from '@/features/attendance/pages/employee-attendance-page'

export default function StaffAttendanceRoute() {
  return (
    <PermissionGuard page="employee-attendance">
      <EmployeeAttendancePage />
    </PermissionGuard>
  )
}
