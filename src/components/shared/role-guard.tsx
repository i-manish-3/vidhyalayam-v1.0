'use client'

import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ShieldAlert } from 'lucide-react'

/**
 * Route-level role guard. Wrap a page's content with this so deep-linking to a
 * role-restricted URL (e.g. /marketing/team-members for SUPER_ADMIN only) is
 * blocked the same way the sidebar hides the menu item.
 *
 * Unlike PermissionGuard (which checks fine-grained permission codes), this
 * checks the user's coarse role. Use it for pages that are bound to a specific
 * role tier — SUPER_ADMIN panels, etc.
 *
 * Authentication is already handled by the (app) layout; this only adds the
 * role layer. The API routes also enforce the role independently.
 */
export function RoleGuard({
  role,
  children,
}: {
  /** Allowed role(s). Pass a single role string or an array of roles. */
  role: string | string[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const user = useAppStore((s) => s.user)
  const isAuthenticated = useAppStore((s) => s.isAuthenticated)

  // While auth is still hydrating from localStorage, show a spinner instead
  // of flashing the denied screen.
  if (!isAuthenticated || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const allowedRoles = Array.isArray(role) ? role : [role]
  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="size-7 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold">Access Denied</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              You don&apos;t have permission to view this page. Please contact your administrator if you think this is a mistake.
            </p>
            <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')} className="mt-1">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
