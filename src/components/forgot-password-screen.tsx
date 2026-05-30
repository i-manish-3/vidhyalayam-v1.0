'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, type Variants } from 'framer-motion'
import { ArrowLeft, ArrowRight, Loader2, Mail, ShieldCheck } from 'lucide-react'
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

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async () => {
    const trimmed = email.trim()
    if (!trimmed) {
      toast({ title: 'Email required', description: 'Please enter the email address for your account.', variant: 'destructive' })
      return
    }

    setIsLoading(true)
    try {
      await api.post<{ message: string }>('/api/auth/forgot-password', { email: trimmed }, { skipLogoutOn401: true })
      setSubmitted(true)
    } catch (err) {
      // The forgot-password endpoint always returns 200, so this branch
      // really only triggers on network failure.
      toast({
        title: 'Could not send reset email',
        description: err instanceof Error ? err.message : 'Please check your connection and try again.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
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
        {!submitted && (
          <motion.div variants={itemVariants} className="mb-6">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-white/60 dark:hover:text-white"
            >
              <ArrowLeft className="size-4" />
              Back to login
            </Link>
          </motion.div>
        )}

        <motion.div
          variants={itemVariants}
          className="rounded-2xl border border-slate-200/70 bg-white/90 p-6 shadow-2xl shadow-emerald-500/10 backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:shadow-black/20 sm:p-8"
        >
          {!submitted ? (
            <>
              <div className="mb-5">
                <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25">
                  <Mail className="size-5" />
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight">Forgot your password?</h1>
                <p className="mt-1.5 text-sm text-slate-500 dark:text-white/55">
                  Enter the email tied to your account and we&apos;ll send you a link to set a new password.
                </p>
              </div>

              <div className="mb-4">
                <Label htmlFor="email" className="text-xs font-medium uppercase text-slate-500 dark:text-white/50">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@school.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  className="mt-1.5 h-11 rounded-xl bg-white text-sm transition-all placeholder:text-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:placeholder:text-white/25"
                />
              </div>

              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Button
                  className="h-11 w-full rounded-xl border-0 bg-gradient-to-r from-emerald-500 to-teal-500 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all duration-300 hover:from-emerald-600 hover:to-teal-600 hover:shadow-emerald-500/40"
                  onClick={handleSubmit}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      Send reset link
                      <ArrowRight className="ml-2 size-3.5" />
                    </>
                  )}
                </Button>
              </motion.div>

              <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                <ShieldCheck className="size-3.5 shrink-0" />
                <span>The link expires after 30 minutes for your security.</span>
              </div>
            </>
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25">
                <Mail className="size-6" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight">Check your inbox</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-white/55">
                If an account exists for <span className="font-medium text-slate-700 dark:text-white/80">{email.trim()}</span>, we&apos;ve sent a password reset link to that address. Check your spam folder if you don&apos;t see it within a couple of minutes.
              </p>
              <Link href="/login">
                <Button variant="outline" className="mt-6 h-11 w-full rounded-xl">
                  Back to login
                </Button>
              </Link>
            </div>
          )}
        </motion.div>

        <p className="mt-6 text-center text-xs text-slate-500 dark:text-white/45">Powered by Vidhyalayam</p>
      </motion.div>
    </div>
  )
}
