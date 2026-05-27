'use client'

import { useEffect, useLayoutEffect } from 'react'
import { usePathname } from 'next/navigation'
import { applySchoolBranding } from '@/lib/branding'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { School } from '@/lib/store'

export function BrandHeadManager() {
  const pathname = usePathname()
  const currentSchool = useAppStore((state) => state.currentSchool)
  const isAuthenticated = useAppStore((state) => state.isAuthenticated)
  const role = useAppStore((state) => state.user?.role)
  const userAvatar = useAppStore((state) => state.user?.avatar)
  const setCurrentSchool = useAppStore((state) => state.setCurrentSchool)

  useLayoutEffect(() => {
    applySchoolBranding(currentSchool)
  }, [currentSchool?.favicon, currentSchool?.logo, currentSchool?.name])

  useEffect(() => {
    if (isAuthenticated && role !== 'SUPER_ADMIN' && !currentSchool?.name) return

    applySchoolBranding(currentSchool)
    const frame = window.requestAnimationFrame(() => applySchoolBranding(currentSchool))
    const timer = window.setTimeout(() => applySchoolBranding(currentSchool), 50)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [currentSchool, isAuthenticated, pathname, role])

  useEffect(() => {
    if (!isAuthenticated) return

    let cancelled = false

    const refreshProfile = async () => {
      try {
        // Use shared auth handling while keeping this background refresh quiet.
        const profile = await api.get<{
          avatar?: string | null
          assignedRoleName?: string | null
          school?: School | null
        }>('/api/auth/me', undefined, { skipLogoutOn401: true })
        if (cancelled) return

        // Avatar is stripped from localStorage to stay under quota, so after
        // a page reload the in-memory user has no avatar. Restore it here so
        // the header photo shows again. Also sync the assigned permission role
        // name so the header badge shows "Accountant" instead of "Staff".
        useAppStore.setState((s) => {
          if (!s.user) return s
          const needsAvatar = !!profile.avatar && !userAvatar
          const needsRoleName = profile.assignedRoleName !== undefined
            && profile.assignedRoleName !== s.user.assignedRoleName
          if (!needsAvatar && !needsRoleName) return s
          return {
            user: {
              ...s.user,
              ...(needsAvatar ? { avatar: profile.avatar ?? undefined } : {}),
              ...(needsRoleName ? { assignedRoleName: profile.assignedRoleName ?? null } : {}),
            },
          }
        })

        if (role !== 'SUPER_ADMIN' && profile.school) {
          setCurrentSchool(profile.school)
          applySchoolBranding(profile.school)
        }
      } catch {
        // Keep the current/local branding if the profile request fails.
      }
    }

    refreshProfile()

    return () => {
      cancelled = true
    }
  }, [role, setCurrentSchool, isAuthenticated, userAvatar])

  return null
}
