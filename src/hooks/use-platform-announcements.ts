'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { ActiveBanner } from '@/lib/platform-announcements-shared'

/**
 * Drives the platform broadcast banner.
 *
 * - Fetches the banners currently visible to this user on mount.
 * - Refreshes when a `platform:announcement` SSE event arrives (bridged onto a
 *   window event by use-notification-stream, so we don't open a 2nd EventSource)
 *   and on window focus as a cheap fallback.
 * - `dismiss` hides a banner locally and records it server-side (cross-device).
 */
export const PLATFORM_ANNOUNCEMENT_EVENT = 'platform:announcement'

export function usePlatformAnnouncements() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const [banners, setBanners] = useState<ActiveBanner[]>([])

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setBanners([])
      return
    }
    try {
      const res = await api.get<{ banners: ActiveBanner[] }>(
        '/api/platform/announcements/active',
        undefined,
        { skipLogoutOn401: true },
      )
      setBanners(res.banners || [])
    } catch {
      /* non-critical: banner just won't show until next refresh */
    }
  }, [isAuthenticated])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Live refresh + focus fallback.
  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') return
    const onSignal = () => void refresh()
    window.addEventListener(PLATFORM_ANNOUNCEMENT_EVENT, onSignal)
    window.addEventListener('focus', onSignal)
    return () => {
      window.removeEventListener(PLATFORM_ANNOUNCEMENT_EVENT, onSignal)
      window.removeEventListener('focus', onSignal)
    }
  }, [isAuthenticated, refresh])

  const dismiss = useCallback(async (id: string) => {
    // Optimistic: remove immediately, persist in the background.
    setBanners((prev) => prev.filter((b) => b.id !== id))
    try {
      await api.post(`/api/platform/announcements/${id}/dismiss`, undefined, { skipLogoutOn401: true })
    } catch {
      /* if persistence fails it reappears on next refresh — acceptable */
    }
  }, [])

  return { banners, dismiss }
}
