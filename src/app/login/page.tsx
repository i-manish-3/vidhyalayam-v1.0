'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ThemeProvider } from 'next-themes'
import { useAppStore } from '@/lib/store'
import { LoginScreen } from '@/components/login-screen'

export default function LoginPage() {
  const router = useRouter()

  // One-shot check: if someone hits /login while already authenticated (e.g.
  // typed the URL or hit the back button), bounce them. We deliberately do NOT
  // subscribe to isAuthenticated reactively — the post-login navigation is
  // driven from inside LoginScreen.handleLogin so it can sequence itself
  // around framer-motion's unmount.
  useEffect(() => {
    if (useAppStore.getState().isAuthenticated) {
      router.replace('/dashboard')
    }
  }, [router])

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <LoginScreen />
    </ThemeProvider>
  )
}
