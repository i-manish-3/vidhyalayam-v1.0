'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { motion, type Variants } from 'framer-motion'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'
import { applySchoolBranding } from '@/lib/branding'
import { usePlatformLogo } from '@/hooks/use-platform-branding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  GraduationCap,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Mail,
  Lock,
  Sun,
  Moon,
  Sparkles,
  CheckCircle2,
  Building2,
  Users,
  Shield,
  Zap,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
  },
}

type CachedBranding = {
  name: string
  logo?: string
  favicon?: string
}

const DEFAULT_BRANDING: CachedBranding = {
  name: 'Vidhyalayam',
}

function readCachedBranding(): CachedBranding {
  if (typeof window === 'undefined') return DEFAULT_BRANDING

  const readJson = (key: string) => {
    try {
      return JSON.parse(localStorage.getItem(key) || sessionStorage.getItem(key) || 'null') as CachedBranding | null
    } catch {
      return null
    }
  }

  const cached = readJson('erp_schoolBranding') || readJson('erp_currentSchool')
  return cached?.name ? cached : DEFAULT_BRANDING
}

export function LoginScreen() {
  const router = useRouter()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [branding, setBranding] = useState<CachedBranding>(DEFAULT_BRANDING)
  const { login, setCurrentSchool, setPermissions } = useAppStore()
  const { toast } = useToast()
  const platformLogo = usePlatformLogo()

  useEffect(() => {
    setMounted(true)
    const cachedBranding = readCachedBranding()
    setBranding(cachedBranding)
    applySchoolBranding(cachedBranding)
  }, [])

  // School branding wins; fall back to the platform logo, then default icon.
  const brandImage = branding.logo || branding.favicon || platformLogo

  const handleLogin = async () => {
    if (!email || !password) {
      toast({
        title: 'Missing Details',
        description: 'Please enter your email or phone number and password to continue.',
        variant: 'destructive',
      })
      return
    }
    setIsLoading(true)
    try {
      const response = await api.post<{
        user: {
          id: string
          email: string
          name: string
          role: string
          schoolId?: string
          mustChangePassword?: boolean
          assignedRoleName?: string | null
        }
      }>('/api/auth/login', { email, password })
      login(response.user)

      try {
        const profile = await api.get<{
          user: { id: string; email: string; name: string; role: string; schoolId?: string }
          school?: {
            id: string
            name: string
            logo?: string
            favicon?: string
            status: string
            academicYear?: string
            board?: string
            address?: string
            city?: string
            state: string
          }
        }>('/api/auth/me')
        if (profile.school) {
          setCurrentSchool(
            profile.school as {
              id: string
              name: string
              logo?: string
              favicon?: string
              status: string
              academicYear?: string
              board?: string
              address?: string
              city?: string
              state: string
            }
          )
          setBranding(profile.school)
          applySchoolBranding(profile.school)
        }
      } catch {
        // Profile fetch is non-blocking after a successful login.
      }

      try {
        const permData = await api.get<{ permissions: string[]; role: string }>('/api/auth/permissions')
        setPermissions(permData.permissions || [])
      } catch {
        setPermissions([])
      }

      toast({
        title: response.user.mustChangePassword ? 'Change Password Required' : 'Welcome!',
        description: response.user.mustChangePassword
          ? 'Please change your generated password before continuing.'
          : `Logged in as ${response.user.name}`,
      })

      router.replace('/dashboard')
    } catch (err) {
      toast({
        title: 'Login Failed',
        description: err instanceof Error ? err.message : "We couldn't log you in. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="h-svh max-h-svh w-full overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="grid h-full max-h-full lg:grid-cols-[1.1fr_1fr] xl:grid-cols-[1.2fr_1fr]">
        
        {/* Left Side: Modern Interactive Showcase (Desktop) */}
        <div className="relative hidden h-full max-h-full flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-950 via-teal-950 to-emerald-950 p-8 xl:p-10 text-white lg:flex">
          {/* Subtle Grid Pattern Overlay */}
          <div
            className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:32px_32px] opacity-40"
          />

          {/* Glowing Ambient Light Orbs */}
          <div
            className="pointer-events-none absolute -left-20 -top-20 size-80 rounded-full blur-3xl opacity-30"
            style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.5) 0%, transparent 70%)' }}
          />
          <div
            className="pointer-events-none absolute -bottom-20 right-0 size-80 rounded-full blur-3xl opacity-30"
            style={{ background: 'radial-gradient(circle, rgba(20,184,166,0.5) 0%, transparent 70%)' }}
          />

          {/* Top Brand Header */}
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center overflow-hidden rounded-xl bg-white/10 p-2 shadow-lg shadow-black/20 ring-1 ring-white/20 backdrop-blur-md">
                  {brandImage ? (
                    <img src={brandImage} alt={`${branding.name} logo`} className="size-full object-contain" />
                  ) : (
                    <GraduationCap className="size-5 text-emerald-400" />
                  )}
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight text-white">{branding.name}</h2>
                  <p className="text-[11px] font-medium text-emerald-300/80">Next-Gen Campus Cloud</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 backdrop-blur-sm">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                </span>
                <span>System Live • 256-Bit SSL</span>
              </div>
            </div>

            {/* Inspiring Hero Text */}
            <div className="mt-8 max-w-lg xl:mt-10">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-0.5 text-[11px] font-semibold text-emerald-200 backdrop-blur-md">
                <Sparkles className="size-3 text-emerald-400" />
                All-in-One Institutional OS
              </div>
              <h1 className="mt-3 text-3xl font-extrabold leading-[1.18] tracking-tight xl:text-4xl">
                Intelligence & Control <br />
                <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent">
                  for Modern Campuses.
                </span>
              </h1>
              <p className="mt-2.5 text-sm leading-relaxed text-white/75">
                Manage admissions, daily attendance, fee collections, CBSE/ICSE exam reporting, and parent communication with seamless real-time synchronization.
              </p>
            </div>
          </div>

          {/* Central Ecosystem Glass Card */}
          <div className="relative z-10 my-4 rounded-2xl border border-white/15 bg-white/[0.08] p-4 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <Zap className="size-3.5" />
                Live Cloud Ecosystem
              </div>
              <span className="text-[10px] text-white/60">Unified Single Sign-On</span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
                <p className="text-[10px] text-white/60">Attendance</p>
                <p className="mt-0.5 text-xs font-bold text-emerald-300">Biometric & App</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
                <p className="text-[10px] text-white/60">Fee Desk</p>
                <p className="mt-0.5 text-xs font-bold text-teal-300">Instant UPI & GST</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
                <p className="text-[10px] text-white/60">Academics</p>
                <p className="mt-0.5 text-xs font-bold text-cyan-300">Auto Report Cards</p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-[10px] text-white/70">
              <div className="flex items-center gap-1.5">
                <Users className="size-3 text-emerald-400" />
                <span>Principals, Teachers, Students & Parents</span>
              </div>
              <div className="flex items-center gap-1 text-emerald-300 font-medium">
                <CheckCircle2 className="size-3" /> 99.98% Uptime
              </div>
            </div>
          </div>

          {/* Bottom Security Assurance */}
          <div className="relative z-10 flex items-center justify-between text-[11px] text-white/60">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-emerald-400" />
              <span>SOC2 Type II & GDPR Privacy Compliant</span>
            </div>
            <span>© {new Date().getFullYear()} {branding.name}</span>
          </div>
        </div>

        {/* Right Side: Sleek Login Hub */}
        <div className="relative flex h-full max-h-full flex-col justify-between overflow-hidden px-4 py-3 sm:px-8 sm:py-4 lg:px-8 xl:px-12">
          
          {/* Top Bar: Dark Mode Toggle */}
          <div className="flex items-center justify-end shrink-0">
            {mounted && (
              <button
                type="button"
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                aria-label="Toggle theme"
                className="flex size-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 shadow-sm transition-all hover:border-emerald-500/50 hover:bg-emerald-50 hover:text-emerald-700 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-emerald-400"
              >
                {resolvedTheme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
              </button>
            )}
          </div>

          {/* Form Container */}
          <div className="my-auto mx-auto w-full max-w-[400px]">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-4"
            >
              {/* Brand Header */}
              <motion.div variants={itemVariants} className="space-y-1.5 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2.5">
                  <div className="flex size-10 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 p-2 text-white shadow-md shadow-emerald-600/25 ring-2 ring-emerald-500/20">
                    {brandImage ? (
                      <img src={brandImage} alt={`${branding.name} logo`} className="size-full object-contain" />
                    ) : (
                      <GraduationCap className="size-5" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
                      {branding.name}
                    </h2>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      School Management System
                    </p>
                  </div>
                </div>

                <div className="pt-1">
                  <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                    Sign in to your portal
                  </h1>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Enter your registered credentials to access your dashboard.
                  </p>
                </div>
              </motion.div>

              {/* Form Card */}
              <motion.div
                variants={itemVariants}
                className="rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-lg shadow-slate-200/50 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90 dark:shadow-black/30 sm:p-5"
              >
                <div className="space-y-3.5">
                  {/* Email / Phone Field */}
                  <div className="space-y-1">
                    <Label htmlFor="email" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Email or Phone Number
                    </Label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 dark:text-slate-500">
                        <Mail className="size-4" />
                      </div>
                      <Input
                        id="email"
                        type="text"
                        placeholder="admin@school.com or 9876543210"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        className="h-10 rounded-xl border-slate-200 bg-slate-50/50 pl-9 text-sm transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:placeholder:text-slate-500 dark:focus:bg-slate-950"
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Password
                      </Label>
                      <Link
                        href="/forgot-password"
                        className="text-xs font-semibold text-emerald-600 transition-colors hover:text-emerald-700 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 dark:text-slate-500">
                        <Lock className="size-4" />
                      </div>
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        className="h-10 rounded-xl border-slate-200 bg-slate-50/50 pl-9 pr-9 text-sm transition-all placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:placeholder:text-slate-500 dark:focus:bg-slate-950"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                        tabIndex={-1}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-1">
                    <Button
                      className="h-10 w-full rounded-xl border-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 font-semibold text-white shadow-md shadow-emerald-600/25 transition-all duration-300 hover:from-emerald-700 hover:via-teal-700 hover:to-emerald-700 hover:shadow-emerald-600/35 active:scale-[0.99]"
                      onClick={handleLogin}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          <span>Signing in...</span>
                        </>
                      ) : (
                        <>
                          <span>Sign in to Portal</span>
                          <ArrowRight className="ml-2 size-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Helpful Role Notice */}
                <div className="mt-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] p-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <Building2 className="size-3.5 shrink-0" />
                    <span>Unified Institutional Portal</span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                    Admins, Teachers, Staff, Students, and Parents can sign in directly using their school-registered credentials.
                  </p>
                </div>
              </motion.div>

              {/* Secure Session Note */}
              <motion.div variants={itemVariants} className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Protected by 256-Bit SSL Encryption</span>
              </motion.div>
            </motion.div>
          </div>

          {/* Footer */}
          <div className="shrink-0 pt-2 pb-1 text-center text-[11px] text-slate-400 dark:text-slate-500">
            Powered by{' '}
            <span className="font-semibold text-slate-600 dark:text-slate-300">Vidhyalayam</span>
          </div>
        </div>

      </div>
    </div>
  )
}
