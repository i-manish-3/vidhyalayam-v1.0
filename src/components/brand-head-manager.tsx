'use client'

import { useEffect, useLayoutEffect } from 'react'
import { applySchoolBranding } from '@/lib/branding'
import { useAppStore } from '@/lib/store'

export function BrandHeadManager() {
  const currentSchool = useAppStore((state) => state.currentSchool)
  const token = useAppStore((state) => state.token)
  const role = useAppStore((state) => state.user?.role)
  const setCurrentSchool = useAppStore((state) => state.setCurrentSchool)

  useLayoutEffect(() => {
    applySchoolBranding(currentSchool)
  }, [currentSchool?.favicon, currentSchool?.logo, currentSchool?.name])

  useEffect(() => {
    if (!token || role === 'SUPER_ADMIN') return

    let cancelled = false

    const refreshSchoolBranding = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || cancelled) return

        const profile = await res.json()
        if (!cancelled && profile.school) {
          setCurrentSchool(profile.school)
          applySchoolBranding(profile.school)
        }
      } catch {
        // Keep the current/local branding if the profile request fails.
      }
    }

    refreshSchoolBranding()

    return () => {
      cancelled = true
    }
  }, [role, setCurrentSchool, token])

  return null
}
