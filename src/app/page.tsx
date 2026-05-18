'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { ThemeProvider } from 'next-themes'
import { useAppStore } from '@/lib/store'
import { BrandHeadManager } from '@/components/brand-head-manager'

// Dynamic imports with ssr: false to avoid hydration mismatches from framer-motion animations
const AppLayout = dynamic(
  () => import('@/components/app-layout').then(mod => ({ default: mod.AppLayout })),
  {
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading My Digital Academy...</p>
        </div>
      </div>
    ),
    ssr: false,
  }
)

const LoginScreen = dynamic(
  () => import('@/components/login-screen').then(mod => ({ default: mod.LoginScreen })),
  {
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    ),
    ssr: false,
  }
)

const LandingPage = dynamic(
  () => import('@/components/landing-page').then(mod => ({ default: mod.LandingPage })),
  {
    loading: () => (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading My Digital Academy...</p>
        </div>
      </div>
    ),
    ssr: false,
  }
)

function AppContent() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const [hydrated, setHydrated] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const hydrationDone = useRef(false)

  useEffect(() => {
    if (hydrationDone.current) return
    hydrationDone.current = true

    // Use getState() to avoid subscribing to store changes from this effect
    const store = useAppStore.getState()

    // If the store already has user data (from the module-level initialization in store.ts),
    // skip re-initializing to avoid cascading re-renders from new object references
    if (store.isAuthenticated && store.user && store.token) {
      // Store already hydrated — just check if permissions are missing
      if (store.permissions.length === 0) {
        try {
          const permStr = localStorage.getItem('erp_permissions')
          if (permStr) {
            try { store.setPermissions(JSON.parse(permStr)) } catch { /* ignore */ }
          }
        } catch { /* ignore */ }
      }
      // Use microtask to avoid synchronous setState in effect
      queueMicrotask(() => setHydrated(true))
      return
    }

    // Fresh load — rehydrate from localStorage
    try {
      const token = localStorage.getItem('erp_token')
      const userStr = localStorage.getItem('erp_user')
      const permStr = localStorage.getItem('erp_permissions')
      const schoolStr = localStorage.getItem('erp_currentSchool')
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr)
          if (user && typeof user === 'object' && 'id' in user && 'email' in user) {
            store.login(user, token)
            if (permStr) {
              try { store.setPermissions(JSON.parse(permStr)) } catch { /* ignore */ }
            }
            if (schoolStr) {
              try { store.setCurrentSchool(JSON.parse(schoolStr)) } catch { /* ignore */ }
            }
          } else {
            localStorage.removeItem('erp_token')
            localStorage.removeItem('erp_user')
            localStorage.removeItem('erp_permissions')
            localStorage.removeItem('erp_currentSchool')
          }
        } catch {
          localStorage.removeItem('erp_token')
          localStorage.removeItem('erp_user')
          localStorage.removeItem('erp_permissions')
          localStorage.removeItem('erp_currentSchool')
        }
      }
    } catch {
      // localStorage not available (SSR)
    }
    // Use microtask to avoid synchronous setState in effect
    queueMicrotask(() => setHydrated(true))
  }, [])

  // Derive the active view from state
  const activeView = useMemo(() => {
    if (isAuthenticated) return 'app'
    if (showLogin) return 'login'
    return 'landing'
  }, [isAuthenticated, showLogin])

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading My Digital Academy...</p>
        </div>
      </div>
    )
  }

  if (activeView === 'app') {
    return <AppLayout />
  }

  if (activeView === 'login') {
    return (
      <LoginScreen
        onBack={() => setShowLogin(false)}
      />
    )
  }

  // Default: Landing page
  return (
    <LandingPage onLoginClick={() => setShowLogin(true)} />
  )
}

export default function Home() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <BrandHeadManager />
      <AppContent />
    </ThemeProvider>
  )
}
