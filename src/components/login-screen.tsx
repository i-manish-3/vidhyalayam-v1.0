'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  Eye,
  EyeOff,
  Loader2,
  ArrowLeft,
  Sparkles,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

const DEMO_ACCOUNTS = [
  { label: 'Super Admin', email: 'superadmin@schoolerp.com', password: 'admin123', role: 'SUPER_ADMIN' },
  { label: 'School Admin', email: 'admin@dpsdelhi.in', password: 'admin123', role: 'SCHOOL_ADMIN' },
  { label: 'Teacher', email: 'anita.sharma@dpsdelhi.in', password: 'teacher123', role: 'TEACHER' },
  { label: 'Student', email: 'student@example.com', password: 'student123', role: 'STUDENT' },
  { label: 'Parent', email: '9876543201', password: 'parent123', role: 'PARENT' },
]

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.2 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

// Animated gradient background orbs
function BackgroundOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full opacity-20 dark:opacity-10"
        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.3), transparent 70%)', top: '-15%', right: '-10%' }}
        animate={{ x: [0, -40, 20, 0], y: [0, 30, -20, 0], scale: [1, 1.05, 0.97, 1] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full opacity-15 dark:opacity-8"
        style={{ background: 'radial-gradient(circle, rgba(20,184,166,0.3), transparent 70%)', bottom: '-10%', left: '-5%' }}
        animate={{ x: [0, 30, -20, 0], y: [0, -25, 15, 0], scale: [1, 0.95, 1.05, 1] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
    </div>
  )
}

interface LoginScreenProps {
  onBack?: () => void
  schoolSubdomain?: string | null
}

export function LoginScreen({ onBack }: LoginScreenProps) {
  const [email, setEmail] = useState('admin@dpsdelhi.in')
  const [password, setPassword] = useState('admin123')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { theme, setTheme } = useTheme()
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
      const response = await api.post<{ token: string; user: { id: string; email: string; name: string; role: string; schoolId?: string } }>('/api/auth/login', { email, password })
      login(response.user, response.token)

      // Fetch user profile with school info
      try {
        const profile = await api.get<{ user: { id: string; email: string; name: string; role: string; schoolId?: string }; school?: { id: string; name: string; logo?: string; favicon?: string; subdomain: string; status: string; primaryColor?: string; dashboardFont?: string; academicYear?: string; board?: string; address?: string; city?: string; state: string } }>('/api/auth/me')
        if (profile.school) {
          setCurrentSchool(profile.school as { id: string; name: string; logo?: string; favicon?: string; subdomain: string; status: string; primaryColor?: string; dashboardFont?: string; academicYear?: string; board?: string; address?: string; city?: string; state: string })
        }
      } catch {
        // Profile fetch failed, but login succeeded - continue
      }

      // Fetch user permissions
      try {
        const permData = await api.get<{ permissions: string[]; role: string }>('/api/auth/permissions')
        setPermissions(permData.permissions || [])
      } catch {
        // Permissions fetch failed - continue with empty permissions
        setPermissions([])
      }

      toast({ title: 'Welcome!', description: `Logged in as ${response.user.name}` })
    } catch (err) {
      toast({
        title: 'Login Failed',
        description: err instanceof Error ? err.message : "We couldn't log you in. Please try again.",
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <BackgroundOrbs />

      {/* Top bar — back + theme toggle */}
      <div className="shrink-0 flex items-center justify-between px-5 pt-4 relative z-20">
        {onBack && (
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </motion.div>
        )}

        <motion.div className="ml-auto" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="rounded-full size-9 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <AnimatePresence mode="wait" initial={false}>
              {theme === 'dark' ? (
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
        </motion.div>
      </div>

      {/* Centered login card */}
      <div className="flex-1 flex items-center justify-center px-5 py-8 relative z-10">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-[400px]"
        >
          {/* Logo + Brand */}
          <motion.div variants={itemVariants} className="flex flex-col items-center mb-8">
            <motion.div
              className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-xl shadow-emerald-500/20 mb-4"
              whileHover={{ scale: 1.05, rotate: 2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400 }}
            >
              <GraduationCap className="size-8 text-white" />
            </motion.div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Welcome back
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Sign in to My Digital Academy
            </p>
          </motion.div>

          {/* Login Card */}
          <motion.div
            variants={itemVariants}
            className="rounded-2xl bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-slate-200/60 dark:border-white/10 p-7 shadow-xl shadow-black/5 dark:shadow-black/20"
          >
            {/* Demo selector */}
            <div className="mb-5">
              <Label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Quick Demo</Label>
              <Select onValueChange={handleDemoSelect} defaultValue="School Admin">
                <SelectTrigger className="mt-1.5 h-11 bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-700/80 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm">
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

            {/* Divider */}
            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-100 dark:border-slate-700/60" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white dark:bg-slate-900/80 px-3 text-[11px] text-slate-300 dark:text-slate-600 uppercase tracking-widest">or</span>
              </div>
            </div>

            {/* Email */}
            <div className="mb-4">
              <Label htmlFor="email" className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Email / Phone
              </Label>
              <Input
                id="email"
                type="text"
                placeholder="you@school.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="mt-1.5 h-11 bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-700/80 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 text-sm"
              />
            </div>

            {/* Password */}
            <div className="mb-6">
              <Label htmlFor="password" className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Password
              </Label>
              <div className="relative mt-1.5">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="h-11 pr-10 bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-700/80 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {/* Sign In */}
            <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
              <Button
                className="w-full h-11 text-sm font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/35 transition-all duration-200 rounded-xl border-0"
                onClick={handleLogin}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    Sign In
                    <Sparkles className="size-3.5 ml-2 opacity-70" />
                  </>
                )}
              </Button>
            </motion.div>
          </motion.div>

          {/* Helper text */}
          <motion.p variants={itemVariants} className="text-[11px] text-center text-slate-400 dark:text-slate-600 mt-5">
            Pick a demo role above to auto-fill credentials
          </motion.p>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="shrink-0 py-4 text-center text-[11px] text-slate-400 dark:text-slate-600 relative z-10">
        &copy; {new Date().getFullYear()} My Digital Academy
      </div>
    </div>
  )
}
