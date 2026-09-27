'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ThemeProvider } from 'next-themes'
import { useAppStore } from '@/lib/store'
import { BrandHeadManager } from '@/components/brand-head-manager'
import { LandingPage } from '@/components/landing-page'

function AppContent() {
  const router = useRouter()
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)

  // On the ERP host (erp.vidhyalayam.com), redirect to login or dashboard
  useEffect(() => {
    if (typeof window === 'undefined') return
    const host = window.location.hostname
    const isERPHost = host === 'erp.vidhyalayam.com' || host.startsWith('erp.')
    if (isERPHost) {
      if (isAuthenticated) {
        router.replace('/dashboard')
      } else {
        router.replace('/login')
      }
    }
  }, [isAuthenticated, router])

  const handleLoginClick = () => {
    const host = typeof window !== 'undefined' ? window.location.hostname : ''
    if (host.includes('localhost') || host.startsWith('192.') || host.startsWith('10.') || host === '') {
      router.push('/login')
    } else {
      // Landing on marketing domain — send user to ERP login
      window.location.href = 'https://erp.vidhyalayam.com/login'
    }
  }

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
