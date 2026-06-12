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
  // Start null so the first client render matches the server (which has no
  // localStorage). Reading the cached value here would cause a hydration
  // mismatch; we hydrate it in the effect below, after mount.
  const [logo, setLogo] = useState<string | null>(null)

  // Paint the cached logo immediately after mount (before the network resolves).
  useEffect(() => {
    const cached = readCached()
    if (cached) setLogo(cached)
  }, [])

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
