'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

/**
 * Platform (product) logo set by the super-admin. Used as the brand fallback in
 * the super-admin panel and on the login screen. Cached in localStorage so it
 * paints instantly, then refreshed from the public endpoint.
 */
const CACHE_KEY = 'erp_platformLogo'

function readCached(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(CACHE_KEY) || null
  } catch {
    return null
  }
}

function writeCached(logo: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (logo) localStorage.setItem(CACHE_KEY, logo)
    else localStorage.removeItem(CACHE_KEY)
  } catch {
    /* quota — non-fatal */
  }
}

export function usePlatformLogo(): string | null {
  const [logo, setLogo] = useState<string | null>(() => readCached())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get<{ logo: string | null }>('/api/platform/branding', undefined, {
          skipLogoutOn401: true,
        })
        if (cancelled) return
        setLogo(res.logo)
        writeCached(res.logo)
      } catch {
        /* keep cached value */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return logo
}

/** Update the cached logo immediately after a super-admin save. */
export function setCachedPlatformLogo(logo: string | null) {
  writeCached(logo)
}
