'use client'

import { useEffect, useLayoutEffect } from 'react'
import { applySchoolBranding } from '@/lib/branding'
import { useAppStore } from '@/lib/store'

export function BrandHeadManager() {
  const currentSchool = useAppStore((state) => state.currentSchool)
  const token = useAppStore((state) => state.token)
  const role = useAppStore((state) => state.user?.role)
  const userAvatar = useAppStore((state) => state.user?.avatar)
  const setCurrentSchool = useAppStore((state) => state.setCurrentSchool)

  useLayoutEffect(() => {
    applySchoolBranding(currentSchool)
  }, [currentSchool?.favicon, currentSchool?.logo, currentSchool?.name])

  useEffect(() => {
    if (!token) return

    let cancelled = false

    const refreshProfile = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok || cancelled) return

        const profile = await res.json()
        if (cancelled) return

        // Avatar is stripped from localStorage to stay under quota, so after
        // a page reload the in-memory user has no avatar. Restore it here so
        // the header photo shows again.
        if (profile.avatar && !userAvatar) {
          useAppStore.setState((s) => ({
            user: s.user ? { ...s.user, avatar: profile.avatar } : s.user,
          }))
        }

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
  }, [role, setCurrentSchool, token, userAvatar])

  return null
}
