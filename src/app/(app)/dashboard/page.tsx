'use client'

import { useAppStore } from '@/lib/store'
import { SuperAdminDashboard } from '@/components/dashboards/super-admin-dashboard'
import { SchoolAdminDashboard } from '@/components/dashboards/school-admin-dashboard'
import { TeacherDashboard } from '@/components/dashboards/teacher-dashboard'
import { StudentDashboard } from '@/components/dashboards/student-dashboard'
import { ParentDashboard } from '@/components/dashboards/parent-dashboard'

export default function DashboardPage() {
  const role = useAppStore((s) => s.user?.role)
  const isImpersonating = useAppStore((s) => !!s.user?.impersonatingSchoolId)

  // While impersonating, SUPER_ADMIN should see the school admin dashboard
  // for the school they're acting as, not the platform-wide super admin view.
  const effectiveRole = (role === 'SUPER_ADMIN' && isImpersonating) ? 'SCHOOL_ADMIN' : role

  switch (effectiveRole) {
    case 'SUPER_ADMIN': return <SuperAdminDashboard />
    case 'SCHOOL_ADMIN': return <SchoolAdminDashboard />
    case 'TEACHER': return <TeacherDashboard />
    case 'STUDENT': return <StudentDashboard />
    case 'PARENT': return <ParentDashboard />
    default: return <SchoolAdminDashboard />
  }
}
