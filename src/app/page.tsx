'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ThemeProvider } from 'next-themes'
import { useAppStore } from '@/lib/store'
import { BrandHeadManager } from '@/components/brand-head-manager'
import { LandingPage } from '@/components/landing-page'

function AppContent() {
  const router = useRouter()
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const [hydrated, setHydrated] = useState(false)
  const hydrationDone = useRef(false)

  useEffect(() => {
    if (hydrationDone.current) return
    hydrationDone.current = true

    const store = useAppStore.getState()

    if (store.isAuthenticated && store.user) {
      if (store.permissions.length === 0) {
        try {
          const permStr = localStorage.getItem('erp_permissions')
          if (permStr) {
            try { store.setPermissions(JSON.parse(permStr)) } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }
      queueMicrotask(() => setHydrated(true))
      return
    }

    try {
      const userStr = localStorage.getItem('erp_user')
      const permStr = localStorage.getItem('erp_permissions')
      const schoolStr = localStorage.getItem('erp_currentSchool')
      if (userStr) {
        try {
          const user = JSON.parse(userStr)
          if (user && typeof user === 'object' && 'id' in user && 'email' in user) {
            store.login(user)
            if (permStr) {
              try { store.setPermissions(JSON.parse(permStr)) } catch { /* ignore */ }
            }
            if (schoolStr) {
              try { store.setCurrentSchool(JSON.parse(schoolStr)) } catch { /* ignore */ }
            }
          } else {
            localStorage.removeItem('erp_user')
            localStorage.removeItem('erp_permissions')
            localStorage.removeItem('erp_currentSchool')
          }
        } catch {
          localStorage.removeItem('erp_user')
          localStorage.removeItem('erp_permissions')
          localStorage.removeItem('erp_currentSchool')
        }
      }
    } catch {
      // localStorage not available (SSR)
    }
    queueMicrotask(() => setHydrated(true))
  }, [])

  // Authenticated users belong inside the (app) route group. Send them to the
  // dashboard — bookmarked deep links handle themselves via Next.js routing.
  useEffect(() => {
    if (!hydrated) return
    if (!isAuthenticated) return
    router.replace('/dashboard')
  }, [hydrated, isAuthenticated, router])

  // On the ERP host the root is the login page, not the marketing landing.
  // Visitors hitting https://erp.vidhyalayam.com/ are sent straight into login.
  const isERPHost = useMemo(() => {
    if (typeof window === 'undefined') return false
    const host = window.location.hostname
    return host === 'erp.vidhyalayam.com' || host.startsWith('erp.')
  }, [])

  useEffect(() => {
    if (!hydrated) return
    if (isAuthenticated) return
    if (isERPHost) router.replace('/login')
  }, [hydrated, isAuthenticated, isERPHost, router])

  const handleLoginClick = () => {
    const host = typeof window !== 'undefined' ? window.location.hostname : ''
    if (host.includes('localhost') || host.startsWith('192.') || host.startsWith('10.') || host === '') {
      router.push('/login')
    } else {
      // Landing on the marketing domain — send users to the ERP login.
      window.location.href = 'https://erp.vidhyalayam.com/login'
    }
  }

  if (!hydrated || isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-page">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading Vidhyalayam...</p>
        </div>
      </div>
    )
  }

  // Defer the navigation by a tick so any in-flight framer-motion work on
  // the landing page (looping `repeat: Infinity` animations, `whileTap`
  // bounce-backs) completes before React unmounts the tree. Synchronous
  // router.push during a motion frame crashes Turbopack with
  // "Cannot read properties of null (reading 'removeChild')".
  return <LandingPage onLoginClick={() => setTimeout(handleLoginClick, 0)} />
}

export default function Home() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <BrandHeadManager />
      <AppContent />
    </ThemeProvider>
  )
}
