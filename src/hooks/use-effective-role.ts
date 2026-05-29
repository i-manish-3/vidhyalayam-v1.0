'use client'

import { useAppStore } from '@/lib/store'

/**
 * Returns the user's "effective" role, accounting for SUPER_ADMIN impersonation.
 *
 * When SUPER_ADMIN is impersonating a school (`user.impersonatingSchoolId` set),
 * the effective role is `'SCHOOL_ADMIN'` — they're acting as a school admin of
 * that school and should see school-admin-scoped UI.
 *
 * When not impersonating, returns the user's actual role unchanged.
 *
 * Use this in frontend pages that gate on `role === 'SCHOOL_ADMIN'` so that an
 * impersonating SUPER_ADMIN passes the gate and sees the same UI a real school
 * admin would see.
 *
 * Sidebar (`app-sidebar.tsx`) and dashboard router (`dashboard/page.tsx`) use
 * the same logic inline — keep behavior consistent across all three.
 */
export function useEffectiveRole(): string | undefined {
  const role = useAppStore((s) => s.user?.role)
  const isImpersonating = useAppStore((s) => !!s.user?.impersonatingSchoolId)
  if (role === 'SUPER_ADMIN' && isImpersonating) return 'SCHOOL_ADMIN'
  return role
}
