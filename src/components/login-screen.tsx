'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, type Variants } from 'framer-motion'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'
import { applySchoolBranding } from '@/lib/branding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  GraduationCap,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const DEMO_ACCOUNTS = [
  { label: 'Super Admin', email: 'sahyog.vidhyalayam@gmail.com', password: 'admin123', role: 'SUPER_ADMIN' },
  { label: 'School Admin', email: 'admin@dpsdelhi.in', password: 'admin123', role: 'SCHOOL_ADMIN' },
  { label: 'Teacher', email: 'anita.sharma@dpsdelhi.in', password: 'teacher123', role: 'TEACHER' },
  { label: 'Student', email: 'student@example.com', password: 'student123', role: 'STUDENT' },
  { label: 'Parent', email: '9876543201', password: 'parent123', role: 'PARENT' },
]

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.12 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
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
  const [email, setEmail] = useState('admin@dpsdelhi.in')
  const [password, setPassword] = useState('admin123')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [branding, setBranding] = useState<CachedBranding>(DEFAULT_BRANDING)
  const { login, setCurrentSchool, setPermissions } = useAppStore()
  const { toast } = useToast()
  const brandImage = branding.logo || branding.favicon

  useEffect(() => {
    const cachedBranding = readCachedBranding()
    setBranding(cachedBranding)
    applySchoolBranding(cachedBranding)
  }, [])

  const handleDemoSelect = (value: string) => {
    const account = DEMO_ACCOUNTS.find((a) => a.label === value)
    if (account) {
      setEmail(account.email)
      setPassword(account.password)
    }
  }

  const handleLogin = async () => {
    if (!email || !password) {
      toast({ title: 'Missing Details', description: 'Please enter your email or phone number and password to continue.', variant: 'destructive' })
      return
    }
    setIsLoading(true)
    try {
      const response = await api.post<{ user: { id: string; email: string; name: string; role: string; schoolId?: string; mustChangePassword?: boolean; assignedRoleName?: string | null } }>('/api/auth/login', { email, password })
      login(response.user)

      try {
        const profile = await api.get<{ user: { id: string; email: string; name: string; role: string; schoolId?: string }; school?: { id: string; name: string; logo?: string; favicon?: string; subdomain: string; status: string; primaryColor?: string; dashboardFont?: string; academicYear?: string; board?: string; address?: string; city?: string; state: string } }>('/api/auth/me')
        if (profile.school) {
          setCurrentSchool(profile.school as { id: string; name: string; logo?: string; favicon?: string; subdomain: string; status: string; primaryColor?: string; dashboardFont?: string; academicYear?: string; board?: string; address?: string; city?: string; state: string })
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
    <div className="h-svh overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-teal-50 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-white">
      <main className="grid h-full lg:grid-cols-[minmax(340px,0.82fr)_minmax(480px,1.18fr)]">
        <motion.section
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="contents"
        >
          <motion.div variants={itemVariants} className="relative hidden h-svh overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 text-white lg:flex">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.18)_1px,transparent_1px)] bg-[size:42px_42px] opacity-20" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950/22 to-transparent" />
            <div className="relative mx-auto flex h-full w-full max-w-[520px] flex-col justify-between px-10 py-10 xl:px-12 xl:py-12">
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center overflow-hidden rounded-2xl bg-white/15 shadow-lg shadow-emerald-950/10 ring-1 ring-white/25 backdrop-blur">
                    {brandImage ? (
                      <img src={brandImage} alt={`${branding.name} logo`} className="size-full object-cover" />
                    ) : (
                      <GraduationCap className="size-6" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/70">Welcome back</p>
                    <p className="text-sm text-white/70">School Management System</p>
                  </div>
                </div>

                <div className="mt-12 max-w-md xl:mt-14">
                  <p className="mb-4 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-emerald-50 backdrop-blur">
                    Secure school workspace
                  </p>
                  <h1 className="max-w-[11ch] text-4xl font-extrabold leading-tight tracking-tight xl:text-5xl">{branding.name}</h1>
                  <p className="mt-5 max-w-sm text-base leading-7 text-white/78">
                    A focused workspace for attendance, fees, academics, staff, students, and parent communication.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    ['Academics', 'Ready'],
                    ['Attendance', 'Live'],
                    ['Fees', 'Secure'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur">
                      <p className="text-[11px] text-white/65">{label}</p>
                      <p className="mt-1 text-base font-bold">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-white/15 bg-white/10 p-3.5 backdrop-blur">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="size-4" />
                    <p className="text-sm font-semibold">Secure access</p>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-white/70">
                    Protected sign-in for administrators, teachers, students, parents, and staff.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="relative flex h-svh items-center justify-center overflow-hidden px-4 py-4 sm:px-8 lg:px-10">
            <div className="absolute inset-0 opacity-[0.035] dark:opacity-[0.025]" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
            <div className="relative w-full max-w-[420px]">
              <div className="mb-4 flex items-center justify-between gap-4 lg:mb-5">
                <div className="flex min-w-0 items-center gap-3 lg:hidden">
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25">
                    {brandImage ? (
                      <img src={brandImage} alt={`${branding.name} logo`} className="size-full object-cover" />
                    ) : (
                      <GraduationCap className="size-7" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold">{branding.name}</p>
                    <p className="text-xs text-slate-500 dark:text-white/55">School Management System</p>
                  </div>
                </div>
              </div>

              <div className="mb-4 lg:mb-5">
                <div className="mb-3 hidden items-center gap-3 lg:flex">
                  <div className="flex size-12 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25">
                    {brandImage ? (
                      <img src={brandImage} alt={`${branding.name} logo`} className="size-full object-cover" />
                    ) : (
                      <GraduationCap className="size-6" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-slate-900 dark:text-white">{branding.name}</p>
                    <p className="text-xs text-slate-500 dark:text-white/50">School Management System</p>
                  </div>
                </div>
                <h2 className="bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent dark:from-white dark:to-white/70">Sign in</h2>
                <p className="mt-1.5 text-sm text-slate-500 dark:text-white/55">Use your registered email or phone number.</p>
              </div>

              <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-2xl shadow-emerald-500/10 backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:shadow-black/20 sm:p-5">
                <div className="mb-3">
                  <Label className="text-xs font-medium uppercase text-slate-500 dark:text-white/50">Quick Demo</Label>
                  <Select onValueChange={handleDemoSelect} defaultValue="School Admin">
                    <SelectTrigger className="mt-1.5 h-10 rounded-xl bg-white text-sm transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950/60 sm:h-11">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEMO_ACCOUNTS.map((account) => (
                        <SelectItem key={account.label} value={account.label}>
                          {account.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="relative mb-3">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-100 dark:border-white/10" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-[11px] uppercase text-slate-300 dark:bg-slate-900 dark:text-white/25">or</span>
                  </div>
                </div>

                <div className="mb-2.5">
                  <Label htmlFor="email" className="text-xs font-medium uppercase text-slate-500 dark:text-white/50">
                    Email / Phone
                  </Label>
                  <Input
                    id="email"
                    type="text"
                    placeholder="you@school.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    className="mt-1.5 h-10 rounded-xl bg-white text-sm transition-all placeholder:text-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:placeholder:text-white/25 sm:h-11"
                  />
                </div>

                <div className="mb-3.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-medium uppercase text-slate-500 dark:text-white/50">
                      Password
                    </Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-400 dark:hover:text-emerald-300"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative mt-1.5">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                      className="h-10 rounded-xl bg-white pr-10 text-sm transition-all placeholder:text-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:placeholder:text-white/25 sm:h-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 transition-colors hover:text-slate-500 dark:text-white/25 dark:hover:text-white/60"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                  <Button
                    className="h-10 w-full rounded-xl border-0 bg-gradient-to-r from-emerald-500 to-teal-500 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all duration-300 hover:from-emerald-600 hover:to-teal-600 hover:shadow-emerald-500/40 sm:h-11"
                    onClick={handleLogin}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        Sign In
                        <ArrowRight className="ml-2 size-3.5" />
                      </>
                    )}
                  </Button>
                </motion.div>

                <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <ShieldCheck className="size-3.5 shrink-0" />
                  <span className="truncate">Your school workspace is protected and ready.</span>
                </div>
              </div>

              <p className="mt-4 text-center text-xs text-slate-500 dark:text-white/45">
                Powered by Vidhyalayam
              </p>
            </div>
          </motion.div>
        </motion.section>
      </main>
    </div>
  )
}
