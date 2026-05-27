'use client'

import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { usePermissions } from '@/hooks/use-permissions'
import { isPageVisible } from '@/lib/permission-mappings'
import type { PageName } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ShieldAlert } from 'lucide-react'

/**
 * Route-level permission guard. Wrap a page's content with this so that
 * deep-linking / typing the URL directly is gated the same way the sidebar
 * gates the menu item. Reuses `isPageVisible` (the same logic the sidebar
 * uses) so access stays consistent in both places.
 *
 * Authentication is already handled by the (app) layout; this only adds the
 * permission layer. It is a defense-in-depth UI guard — the API routes also
 * enforce permissions independently.
 */
export function PermissionGuard({ page, children }: { page: PageName; children: React.ReactNode }) {
  const router = useRouter()
  // Triggers the fetch + sync of permissions into the store on mount.
  usePermissions()
  const role = useAppStore((s) => s.user?.role || '')
  const permissions = useAppStore((s) => s.permissions)
  const permissionsLoaded = useAppStore((s) => s.permissionsLoaded)

  // While permissions are still loading, don't flash the denied screen.
  if (!permissionsLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!isPageVisible(page, permissions, role, permissionsLoaded)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="size-7 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold">Access Denied</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              You don&apos;t have permission to view this page. Please contact your school admin if you think this is a mistake.
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
