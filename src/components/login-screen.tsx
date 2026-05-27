'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { useTheme } from 'next-themes'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'
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
  Sun,
  Moon,
  GraduationCap,
  BookOpenCheck,
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const DEMO_ACCOUNTS = [
  { label: 'Super Admin', email: 'superadmin@schoolerp.com', password: 'admin123', role: 'SUPER_ADMIN' },
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

export function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('admin@dpsdelhi.in')
  const [password, setPassword] = useState('admin123')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const { login, setCurrentSchool, setPermissions } = useAppStore()
  const { toast } = useToast()

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
    <div className="relative h-svh overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-teal-50 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-white">
      <div className="absolute inset-0 opacity-[0.035] dark:opacity-[0.025]" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />

      <main className="relative z-10 flex h-full items-center justify-center p-2 sm:p-4">
        <motion.section
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid h-[calc(100svh-16px)] max-h-[640px] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-2xl shadow-emerald-500/10 backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:shadow-black/20 sm:h-[calc(100svh-32px)] md:grid-cols-[0.95fr_1.05fr]"
        >
          <motion.div variants={itemVariants} className="relative hidden h-full overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 p-7 text-white md:flex md:flex-col md:justify-between lg:p-8">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.25) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl bg-white/15 shadow-lg backdrop-blur">
                  <GraduationCap className="size-6" />
                </div>
                <div>
                  <p className="text-xl font-bold">Vidhyalayam</p>
                  <p className="text-sm text-emerald-50/80">Empowering tradition with technology</p>
                </div>
              </div>

              <div className="mt-12 lg:mt-14">
                <p className="mb-4 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-emerald-50 backdrop-blur">
                  Secure school workspace
                </p>
                <h1 className="max-w-sm text-4xl font-extrabold leading-tight lg:text-[2.7rem]">
                  One login for every school workflow.
                </h1>
                <p className="mt-4 max-w-sm text-sm leading-6 text-emerald-50/80">
                  Attendance, academics, fees, staff, and parent communication stay organized in one place.
                </p>
              </div>
            </div>

            <div className="relative grid grid-cols-2 gap-3">
              {[
                ['Attendance', '94.2%'],
                ['Fee Collection', '18.5L'],
                ['Students', '2,847'],
                ['Active Classes', '42'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/15 bg-white/10 p-3.5 backdrop-blur">
                  <p className="text-xs text-emerald-50/70">{label}</p>
                  <p className="mt-1 text-2xl font-bold">{value}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="flex h-full min-h-0 flex-col justify-center p-4 sm:p-7 md:p-8 lg:p-10">
            <div className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
              <div className="flex min-w-0 items-center gap-3 md:hidden">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25">
                  <GraduationCap className="size-6" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">Vidhyalayam</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Empowering tradition with technology</p>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                  className="size-9 rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {resolvedTheme === 'dark' ? (
                      <motion.div key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                        <Sun className="size-4" />
                      </motion.div>
                    ) : (
                      <motion.div key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
                        <Moon className="size-4" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Button>
              </div>
            </div>

            <div className="mb-4 sm:mb-6">
              <div className="mb-3 hidden size-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25 md:flex">
                <BookOpenCheck className="size-6" />
              </div>
              <h2 className="text-2xl font-extrabold leading-tight sm:text-3xl">Welcome back</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-white/50">Sign in with your registered email or phone number.</p>
            </div>

            <div>
                <div className="mb-3.5">
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

                <div className="relative mb-3.5">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-100 dark:border-white/10" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-[11px] uppercase text-slate-300 dark:bg-slate-900 dark:text-white/25">or</span>
                  </div>
                </div>

                <div className="mb-3">
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

                <div className="mb-4">
                  <Label htmlFor="password" className="text-xs font-medium uppercase text-slate-500 dark:text-white/50">
                    Password
                  </Label>
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

                <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 sm:mt-4">
                  <ShieldCheck className="size-3.5 shrink-0" />
                  <span className="truncate">Secure access for school teams and families</span>
                </div>
            </div>
          </motion.div>
        </motion.section>
      </main>
    </div>
  )
}
