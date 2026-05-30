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
import { Info, KeyRound } from 'lucide-react'

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
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Reset form whenever the dialog re-opens for a different user.
  useEffect(() => {
    if (open) {
      setPassword('')
      setConfirm('')
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
      setError('Passwords do not match.')
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
        title: 'Password Reset',
        description: `${userName} must change their password on next login. Their existing sessions have been signed out.`,
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5" />
            Reset Password
          </DialogTitle>
          <DialogDescription>
            Set a new password for <strong>{userName}</strong>. They&apos;ll be required to change it the next time they sign in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!userId && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <Info className="size-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This profile doesn&apos;t have a login account yet, so there&apos;s no password to reset.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reset-new-password">New password</Label>
            <Input
              id="reset-new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError(null)
              }}
              placeholder={`At least ${MIN_LENGTH} characters`}
              disabled={submitting || !userId}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-confirm-password">Confirm password</Label>
            <Input
              id="reset-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value)
                if (error) setError(null)
              }}
              placeholder="Re-enter the password"
              disabled={submitting || !userId}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <Info className="size-3.5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {userId && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <Info className="size-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Resetting will sign the {subjectLabel} out of every active session and force them to choose a new password on next login.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !userId || !password || !confirm}
            className="gap-2"
          >
            <KeyRound className="size-4" />
            {submitting ? 'Resetting...' : 'Reset Password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
