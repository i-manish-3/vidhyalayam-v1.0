'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, type Variants } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

type VerifyResponse =
  | { valid: true; maskedEmail: string }
  | { valid: false; reason: 'invalid' | 'expired' | 'used' | 'ineligible' }

const INVALID_REASONS: Record<Exclude<VerifyResponse, { valid: true }>['reason'], { title: string; body: string }> = {
  invalid: {
    title: 'Invalid reset link',
    body: 'This reset link is not recognized. It may have been mistyped or already replaced by a newer request. Please request a fresh link.',
  },
  expired: {
    title: 'Reset link expired',
    body: 'For your security, reset links expire 30 minutes after they are sent. Please request a fresh link.',
  },
  used: {
    title: 'Reset link already used',
    body: 'This link has already been used to reset a password. If you need to change your password again, please request a fresh link.',
  },
  ineligible: {
    title: 'Account no longer eligible',
    body: 'This account is no longer eligible for self-service password reset. Please contact support for help.',
  },
}

interface ResetPasswordScreenProps {
  token: string
}

export function ResetPasswordScreen({ token }: ResetPasswordScreenProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [verifying, setVerifying] = useState(true)
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await api.get<VerifyResponse>(
          '/api/auth/reset-password/verify',
          { token },
          { skipLogoutOn401: true },
        )
        if (!cancelled) setVerifyResult(result)
      } catch {
        if (!cancelled) setVerifyResult({ valid: false, reason: 'invalid' })
      } finally {
        if (!cancelled) setVerifying(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const handleSubmit = async () => {
    if (password.length < 8) {
      toast({ title: 'Password too short', description: 'Please choose a password with at least 8 characters.', variant: 'destructive' })
      return
    }
    if (password !== confirm) {
      toast({ title: 'Passwords do not match', description: 'Please type the same password in both fields.', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      await api.post<{ message: string }>(
        '/api/auth/reset-password',
        { token, newPassword: password },
        { skipLogoutOn401: true },
      )
      setSuccess(true)
      toast({ title: 'Password reset', description: 'You can now log in with your new password.' })
      setTimeout(() => router.replace('/login'), 1500)
    } catch (err) {
      toast({
        title: 'Could not reset password',
        description: err instanceof Error ? err.message : 'Please try again or request a new link.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-4 py-10 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-white">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md"
      >
        <motion.div variants={itemVariants} className="mb-6">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-white/60 dark:hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Back to login
          </Link>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="rounded-2xl border border-slate-200/70 bg-white/90 p-6 shadow-2xl shadow-emerald-500/10 backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:shadow-black/20 sm:p-8"
        >
          {verifying ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-500 dark:text-white/55">
              <Loader2 className="size-6 animate-spin" />
              <p className="text-sm">Verifying your reset link…</p>
            </div>
          ) : success ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25">
                <CheckCircle2 className="size-7" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight">Password updated</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-white/55">Redirecting you to the login page…</p>
            </div>
          ) : verifyResult && !verifyResult.valid ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25">
                <ShieldAlert className="size-7" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight">{INVALID_REASONS[verifyResult.reason].title}</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-white/55">{INVALID_REASONS[verifyResult.reason].body}</p>
              <Link href="/forgot-password">
                <Button className="mt-6 h-11 w-full rounded-xl border-0 bg-gradient-to-r from-emerald-500 to-teal-500 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 hover:from-emerald-600 hover:to-teal-600">
                  Request a new link
                </Button>
              </Link>
            </div>
          ) : verifyResult && verifyResult.valid ? (
            <>
              <div className="mb-5">
                <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25">
                  <KeyRound className="size-5" />
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight">Set a new password</h1>
                <p className="mt-1.5 text-sm text-slate-500 dark:text-white/55">
                  Resetting password for <span className="font-medium text-slate-700 dark:text-white/80">{verifyResult.maskedEmail}</span>.
                </p>
              </div>

              <div className="mb-3">
                <Label htmlFor="new-password" className="text-xs font-medium uppercase text-slate-500 dark:text-white/50">
                  New password
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 rounded-xl bg-white pr-10 text-sm transition-all placeholder:text-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:placeholder:text-white/25"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 transition-colors hover:text-slate-500 dark:text-white/25 dark:hover:text-white/60"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <Label htmlFor="confirm-password" className="text-xs font-medium uppercase text-slate-500 dark:text-white/50">
                  Confirm new password
                </Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Re-enter your new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  className="mt-1.5 h-11 rounded-xl bg-white text-sm transition-all placeholder:text-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:placeholder:text-white/25"
                />
              </div>

              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Button
                  className="h-11 w-full rounded-xl border-0 bg-gradient-to-r from-emerald-500 to-teal-500 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all duration-300 hover:from-emerald-600 hover:to-teal-600 hover:shadow-emerald-500/40"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      Update password
                      <ArrowRight className="ml-2 size-3.5" />
                    </>
                  )}
                </Button>
              </motion.div>

              <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                <ShieldCheck className="size-3.5 shrink-0" />
                <span>Updating your password will sign you out of every existing session.</span>
              </div>
            </>
          ) : null}
        </motion.div>

        <p className="mt-6 text-center text-xs text-slate-500 dark:text-white/45">Powered by Vidhyalayam</p>
      </motion.div>
    </div>
  )
}
