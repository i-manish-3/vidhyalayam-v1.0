'use client'

import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

export function ImpersonationBanner() {
  const router = useRouter()
  const { toast } = useToast()
  const user = useAppStore((s) => s.user)
  const login = useAppStore((s) => s.login)
  const setCurrentSchool = useAppStore((s) => s.setCurrentSchool)

  if (!user?.impersonatingSchoolId) return null

  async function handleExit() {
    try {
      await api.post('/api/super-admin/impersonate/stop')
      // Reload user state from server
      const me = await api.get<{ school: null } & typeof user>('/api/auth/me', undefined, { skipLogoutOn401: true })
      login({ ...me, impersonatingSchoolId: null, impersonatingSchoolName: null })
      setCurrentSchool(me.school as never)
      router.push('/dashboard')
      router.refresh()
    } catch {
      toast({ title: 'Failed to exit impersonation', variant: 'destructive' })
    }
  }

  return (
    <div className="border-b border-red-300/60 bg-red-50 px-4 py-2 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <strong>Acting as {user.impersonatingSchoolName || 'a school'}.</strong>{' '}
          You can read and write school data. All changes are real.
        </span>
        <button
          type="button"
          onClick={handleExit}
          className="rounded-md border border-red-400 bg-white px-2 py-0.5 text-xs font-semibold hover:bg-red-100 dark:bg-red-500/20 dark:hover:bg-red-500/30"
        >
          Exit impersonation
        </button>
      </div>
    </div>
  )
}
