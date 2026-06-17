'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ThemeProvider } from 'next-themes'
import { useAppStore } from '@/lib/store'
import { AppShell } from '@/components/app-shell'
import { BrandHeadManager } from '@/components/brand-head-manager'

function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)
  const [hydrated, setHydrated] = useState(false)
  const hydrationDone = useRef(false)

  useEffect(() => {
    if (hydrationDone.current) return
    hydrationDone.current = true

    // Same rehydration ritual as the old /page.tsx — pull user metadata back
    // from localStorage when this layout mounts on a hard refresh or deep link.
    // The HttpOnly auth cookie does the actual gating; localStorage is just a
    // fast hint so we can render without a network round-trip.
    const store = useAppStore.getState()
    if (!store.isAuthenticated || !store.user) {
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
            }
          } catch { /* ignore */ }
        }
      } catch { /* localStorage unavailable */ }
    } else if (store.permissions.length === 0) {
      try {
        const permStr = localStorage.getItem('erp_permissions')
        if (permStr) {
          try { store.setPermissions(JSON.parse(permStr)) } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }

    queueMicrotask(() => setHydrated(true))
  }, [])

  useEffect(() => {
    if (!hydrated) return
    if (!isAuthenticated) {
      router.replace('/login')
    }
  }, [hydrated, isAuthenticated, router])

  if (!hydrated || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-page">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading Vidhyalayam...</p>
        </div>
      </div>
    )
  }

  return <AppShell>{children}</AppShell>
}

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <BrandHeadManager />
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </ThemeProvider>
  )
}
