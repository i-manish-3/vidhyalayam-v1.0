'use client'

import { useCallback, useState } from 'react'
import { Building2, ChevronDown } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAppStore, type User } from '@/lib/store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface School { id: string; name: string; subdomain: string; status: string }

export function SchoolSwitcher() {
  const router = useRouter()
  const { toast } = useToast()
  const user = useAppStore((s) => s.user)
  const login = useAppStore((s) => s.login)
  const setCurrentSchool = useAppStore((s) => s.setCurrentSchool)
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  if (user?.role !== 'SUPER_ADMIN') return null

  const fetchSchools = useCallback(async () => {
    if (schools.length) return
    setLoading(true)
    try {
      const data = await api.get<{ schools: School[] }>('/api/super-admin/schools', { limit: '200', status: 'active' })
      setSchools(data.schools || [])
    } catch {
      toast({ title: 'Failed to load schools', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [schools.length, toast])

  async function handleSelect(school: School) {
    setSwitching(true)
    setOpen(false)
    try {
      await api.post('/api/super-admin/impersonate/start', { schoolId: school.id })
      const me = await api.get<User & { school: Parameters<typeof setCurrentSchool>[0] }>('/api/auth/me', undefined, { skipLogoutOn401: true })
      login({
        ...me,
        impersonatingSchoolId: school.id,
        impersonatingSchoolName: school.name,
      })
      if (me.school) setCurrentSchool(me.school)
      router.push('/dashboard')
      router.refresh()
    } catch {
      toast({ title: 'Failed to switch school', variant: 'destructive' })
    } finally {
      setSwitching(false)
    }
  }

  const isImpersonating = !!user?.impersonatingSchoolId

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) fetchSchools() }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={switching}
          className={cn(
            'h-8 gap-1.5 px-2 text-xs',
            isImpersonating && 'ring-2 ring-red-400'
          )}
        >
          <Building2 className="size-3.5" />
          <span className="hidden sm:inline max-w-[120px] truncate">
            {isImpersonating ? user.impersonatingSchoolName : 'Switch School'}
          </span>
          <ChevronDown className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <p className="px-2 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Impersonate School
        </p>
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {schools.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSelect(s)}
                className={cn(
                  'w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent',
                  user?.impersonatingSchoolId === s.id && 'bg-accent font-medium'
                )}
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.subdomain}</div>
              </button>
            ))}
            {!schools.length && !loading && (
              <p className="px-2 py-3 text-sm text-muted-foreground">No active schools found.</p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
