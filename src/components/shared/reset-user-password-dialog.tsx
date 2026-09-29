'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { KeyRound, Eye, EyeOff, Loader2, ShieldAlert, AlertCircle, User } from 'lucide-react'

interface ResetUserPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // The User.id of the account whose password is being reset.
  // null when no user account is linked yet — the dialog will refuse to submit.
  userId: string | null
  // Display name for the confirmation copy ("Set a new password for <name>").
  userName: string
  // Optional: role label shown in the warning ("This will sign the teacher out…").
  // Plain string, fully rendered as-is.
  roleLabel?: string
  // Called after a successful reset (e.g. to refetch row state).
  onSuccess?: () => void
}

const MIN_LENGTH = 8

export function ResetUserPasswordDialog({
  open,
  onOpenChange,
  userId,
  userName,
  roleLabel,
  onSuccess,
}: ResetUserPasswordDialogProps) {
  const { toast } = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Reset form whenever the dialog re-opens for a different user.
  useEffect(() => {
    if (open) {
      setPassword('')
      setConfirm('')
      setShowPassword(false)
      setShowConfirm(false)
      setError(null)
    }
  }, [open, userId])

  const handleSubmit = useCallback(async () => {
    if (!userId) {
      setError("This profile doesn't have a login account yet, so there's no password to reset.")
      return
    }
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters long.`)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match. Please verify both fields.')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      await api.post(`/api/school/users/${userId}/reset-password`, {
        newPassword: password,
      })
      onOpenChange(false)
      toast({
        title: 'Password Reset Successfully 🎉',
        description: `${userName} must change their password on next sign-in. Their existing sessions have been signed out.`,
      })
      onSuccess?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : "We couldn't reset this password. Please try again."
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }, [userId, userName, password, confirm, onOpenChange, onSuccess, toast])

  const subjectLabel = roleLabel ?? 'user'

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next)
      }}
    >
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-md [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
        {/* Decorative Brand Gradient Header (AGENTS.md Convention) */}
        <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
          <div
            aria-hidden
            className="absolute -right-8 -top-12 size-36 rounded-full border-[18px] border-white/10"
          />
          <div
            aria-hidden
            className="absolute -bottom-8 right-16 size-24 rounded-full bg-cyan-300/20 blur-2xl"
          />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
              <KeyRound className="size-5 text-white" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold tracking-normal text-white">
                Reset Password
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-white/75">
                Set a new password for <span className="font-bold text-white">{userName}</span>. They&apos;ll be required to change it the next time they sign in.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Body (Themed Scrollbar) */}
        <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-primary/[0.055] p-4 sm:p-5">
          {/* Unlinked user warning */}
          {!userId && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                This profile doesn&apos;t have an active login account linked yet, so there is no password to reset.
              </p>
            </div>
          )}

          {/* Section: Credentials */}
          <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-sky-500/10">
            <div className="mb-3.5 flex items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-sm">
                <KeyRound className="size-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Temporary Credentials</h3>
                <p className="text-[10px] text-muted-foreground">Minimum {MIN_LENGTH} characters required</p>
              </div>
            </div>

            <div className="space-y-3">
              {/* New Password */}
              <div className="space-y-1.5">
                <Label htmlFor="reset-new-password" className="text-xs font-semibold text-foreground">
                  New Password <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="reset-new-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (error) setError(null)
                    }}
                    placeholder={`At least ${MIN_LENGTH} characters`}
                    disabled={submitting || !userId}
                    className="h-9 pr-10 text-xs bg-background/80"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((prev) => !prev)}
                    disabled={!password}
                  >
                    {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <Label htmlFor="reset-confirm-password" className="text-xs font-semibold text-foreground">
                  Confirm Password <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="reset-confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value)
                      if (error) setError(null)
                    }}
                    placeholder="Re-enter the new password"
                    disabled={submitting || !userId}
                    className="h-9 pr-10 text-xs bg-background/80"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirm((prev) => !prev)}
                    disabled={!confirm}
                  >
                    {showConfirm ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-xs text-destructive font-medium leading-relaxed">{error}</p>
            </div>
          )}

          {/* Session Termination Notice */}
          {userId && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  Active Session Termination
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-amber-700/90 dark:text-amber-300/80">
                  Resetting will immediately terminate all active sessions for the {subjectLabel}. They will be prompted to create their own new password upon next sign-in.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Small Compact Buttons (AGENTS.md Convention) */}
        <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="h-8 px-4 text-xs font-medium"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !userId || !password || !confirm}
            className="h-8 px-4 text-xs font-semibold gap-1.5 shadow-sm"
          >
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Resetting...
              </>
            ) : (
              <>
                <KeyRound className="size-3.5" />
                Set Password
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
