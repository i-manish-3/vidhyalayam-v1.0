'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'

/**
 * Hook to check if the current user has specific permissions.
 *
 * Fetches the user's current permissions from /api/auth/permissions on mount
 * and SYNCS them into the global store. This is the single source of truth —
 * the sidebar (which reads store.permissions) and any component using this
 * hook both see the same data, so changes made via the admin Roles &
 * Permissions UI become visible without forcing the user to log out and
 * back in. Permissions in the store are also mirrored to localStorage so a
 * page reload doesn't require another network round-trip.
 */
export function usePermissions() {
  const user = useAppStore((s) => s.user)
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const permissions = useAppStore((s) => s.permissions)
  const setStorePermissions = useAppStore((s) => s.setPermissions)
  const [loading, setLoading] = useState(false)
  const fetchedForUserId = useRef<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !user) {
      if (permissions.length > 0) {
        setStorePermissions([])
      }
      fetchedForUserId.current = null
      return
    }

    // Avoid re-fetching if we already fetched for this user in this session.
    if (fetchedForUserId.current === user.id) return
    fetchedForUserId.current = user.id

    // SUPER_ADMIN always has all permissions
    if (user.role === 'SUPER_ADMIN') {
      setStorePermissions(['*'])
      return
    }

    queueMicrotask(() => setLoading(true))
    api.get<{ permissions: string[]; role: string }>('/api/auth/permissions')
      .then((data) => {
        setStorePermissions(data.permissions || [])
      })
      .catch(() => {
        // Keep any previously cached permissions on error — clearing them
        // would log the user out of features they had access to a moment ago.
      })
      .finally(() => {
        queueMicrotask(() => setLoading(false))
      })
  }, [isAuthenticated, user?.id, user?.role, setStorePermissions, permissions.length])

  const hasPermission = useCallback(
    (permissionCode: string): boolean => {
      if (!permissions.length) return false
      // Wildcard permission
      if (permissions.includes('*')) return true
      // Exact match
      if (permissions.includes(permissionCode)) return true
      // Module wildcard check (e.g., "student:*" should match "student:read")
      const [module] = permissionCode.split(':')
      if (permissions.includes(`${module}:*`)) return true
      return false
    },
    [permissions]
  )

  const hasAnyPermission = useCallback(
    (permissionCodes: string[]): boolean => {
      return permissionCodes.some((code) => hasPermission(code))
    },
    [hasPermission]
  )

  const hasAllPermissions = useCallback(
    (permissionCodes: string[]): boolean => {
      return permissionCodes.every((code) => hasPermission(code))
    },
    [hasPermission]
  )

  // Get all permissions for a specific module
  const getModulePermissions = useCallback(
    (module: string): string[] => {
      return permissions.filter((p) => {
        const [mod] = p.split(':')
        return mod === module || p === '*'
      })
    },
    [permissions]
  )

  // Check if user has any permission for a module
  const hasModuleAccess = useCallback(
    (module: string): boolean => {
      if (permissions.includes('*')) return true
      return permissions.some((p) => {
        const [mod] = p.split(':')
        return mod === module
      })
    },
    [permissions]
  )

  return {
    permissions,
    loading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    getModulePermissions,
    hasModuleAccess,
  }
}

/**
 * Permission codes for use throughout the application.
 * These should match the seeded permission codes in the database.
 */
export const PERMISSIONS = {
  // Students
  STUDENT_READ: 'student:read',
  STUDENT_CREATE: 'student:create',
  STUDENT_UPDATE: 'student:update',
  STUDENT_DELETE: 'student:delete',
  STUDENT_ENABLE_DISABLE: 'student:enable_disable',
  STUDENT_WITHDRAW: 'student:withdraw',
  STUDENT_WITHDRAW_REVERSE: 'student:withdraw:reverse',

  // Admissions
  ADMISSION_READ: 'admission:read',
  ADMISSION_CREATE: 'admission:create',
  ADMISSION_UPDATE: 'admission:update',
  ADMISSION_APPROVE: 'admission:approve',
  ADMISSION_DELETE: 'admission:delete',

  // Teachers
  TEACHER_READ: 'teacher:read',
  TEACHER_CREATE: 'teacher:create',
  TEACHER_UPDATE: 'teacher:update',
  TEACHER_DELETE: 'teacher:delete',

  // Parents
  PARENT_READ: 'parent:read',
  PARENT_CREATE: 'parent:create',
  PARENT_UPDATE: 'parent:update',
  PARENT_DELETE: 'parent:delete',

  // Attendance
  ATTENDANCE_READ: 'attendance:read',
  ATTENDANCE_MARK: 'attendance:mark',
  ATTENDANCE_UPDATE: 'attendance:update',
  ATTENDANCE_REOPEN: 'attendance:reopen',
  ATTENDANCE_EXPORT: 'attendance:export',
  ATTENDANCE_AUDIT_VIEW: 'attendance:audit:view',
  ATTENDANCE_REPORT_VIEW: 'attendance:report:view',

  // Fees
  FEES_READ: 'fees:read',
  FEES_CREATE: 'fees:create',
  FEES_UPDATE: 'fees:update',
  FEES_COLLECT: 'fees:collect',
  FEES_REFUND: 'fees:refund',
  FEES_DELETE: 'fees:delete',

  // Salary
  SALARY_READ: 'salary:read',
  SALARY_CREATE: 'salary:create',
  SALARY_UPDATE: 'salary:update',
  SALARY_PAY: 'salary:pay',
  SALARY_ADVANCE: 'salary:advance',
  SALARY_DELETE: 'salary:delete',

  // Timetable
  TIMETABLE_READ: 'timetable:read',
  TIMETABLE_CREATE: 'timetable:create',
  TIMETABLE_UPDATE: 'timetable:update',
  TIMETABLE_DELETE: 'timetable:delete',

  // Exams
  EXAM_READ: 'exam:read',
  EXAM_CREATE: 'exam:create',
  EXAM_UPDATE: 'exam:update',
  EXAM_DELETE: 'exam:delete',
  EXAM_RESULTS: 'exam:results',

  // Transport
  TRANSPORT_READ: 'transport:read',
  TRANSPORT_CREATE: 'transport:create',
  TRANSPORT_UPDATE: 'transport:update',
  TRANSPORT_ALLOCATION_UPDATE: 'transport:allocation:update',
  TRANSPORT_DELETE: 'transport:delete',

  // Hostel
  HOSTEL_READ: 'hostel:read',
  HOSTEL_CREATE: 'hostel:create',
  HOSTEL_UPDATE: 'hostel:update',
  HOSTEL_ALLOCATION_UPDATE: 'hostel:allocation:update',
  HOSTEL_DELETE: 'hostel:delete',

  // Library
  LIBRARY_READ: 'library:read',
  LIBRARY_CREATE: 'library:create',
  LIBRARY_UPDATE: 'library:update',
  LIBRARY_ISSUE: 'library:issue',
  LIBRARY_DELETE: 'library:delete',

  // Inventory
  INVENTORY_READ: 'inventory:read',
  INVENTORY_CREATE: 'inventory:create',
  INVENTORY_UPDATE: 'inventory:update',
  INVENTORY_DELETE: 'inventory:delete',

  // Petty Cash
  PETTY_CASH_READ: 'petty_cash:read',
  PETTY_CASH_CREATE: 'petty_cash:create',
  PETTY_CASH_APPROVE: 'petty_cash:approve',
  PETTY_CASH_DELETE: 'petty_cash:delete',

  // Notifications
  NOTIFICATION_READ: 'notification:read',
  NOTIFICATION_CREATE: 'notification:create',
  NOTIFICATION_DELETE: 'notification:delete',

  // Announcements
  ANNOUNCEMENT_READ: 'announcement:read',
  ANNOUNCEMENT_CREATE: 'announcement:create',
  ANNOUNCEMENT_UPDATE: 'announcement:update',
  ANNOUNCEMENT_DELETE: 'announcement:delete',

  // Classes
  CLASS_READ: 'class:read',
  CLASS_CREATE: 'class:create',
  CLASS_UPDATE: 'class:update',
  CLASS_DELETE: 'class:delete',

  // Subjects
  SUBJECT_READ: 'subject:read',
  SUBJECT_CREATE: 'subject:create',
  SUBJECT_UPDATE: 'subject:update',
  SUBJECT_DELETE: 'subject:delete',

  // Settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_UPDATE: 'settings:update',

  // Academic Calendar (Holidays)
  HOLIDAY_READ: 'holiday:read',
  HOLIDAY_MANAGE: 'holiday:manage',

  // Roles & Permissions
  ROLE_READ: 'role:read',
  ROLE_CREATE: 'role:create',
  ROLE_UPDATE: 'role:update',
  ROLE_DELETE: 'role:delete',
  PERMISSION_ASSIGN: 'permission:assign',
} as const

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
