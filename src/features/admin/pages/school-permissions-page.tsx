'use client'

import { ArrowRight, ShieldCheck, UserCog, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/lib/store'

export function SchoolPermissionsPage() {
  const navigateTo = useAppStore((s) => s.navigateTo)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Role Assignments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Access is managed through roles. Create a role, assign permissions to it, then assign users to that role.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit">
          Role-based access
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <CardTitle>Create Roles & Assign Permissions</CardTitle>
            <CardDescription>
              Build roles like Transport, Accountant, or Reception and grant only the permissions enabled for this school.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="gap-2" onClick={() => navigateTo('school-roles')}>
              Open Roles & Permissions
              <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex size-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-300">
              <Users className="size-5" />
            </div>
            <CardTitle>Assign Roles to Users</CardTitle>
            <CardDescription>
              Select staff, teachers, drivers, or other users and attach the correct school role to control their access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="gap-2" onClick={() => navigateTo('school-users')}>
              Open User Role Assignment
              <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="size-4" />
            How Access Works
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="font-medium text-foreground">1. Super Admin enables modules</p>
            <p className="mt-1">Your school can only use permissions granted by Super Admin.</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="font-medium text-foreground">2. School Admin configures roles</p>
            <p className="mt-1">Each role receives a permission set from the school&apos;s allowed permissions.</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="font-medium text-foreground">3. Users inherit from roles</p>
            <p className="mt-1">Drivers, staff, parents, and teachers receive access from their assigned role.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
