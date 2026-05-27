'use client'

import { AssignRollNumbersPage } from '@/features/academics/pages/assign-roll-numbers-page'
import { PermissionGuard } from '@/components/shared'

export default function AssignRollsRoute() {
  return <PermissionGuard page="assign-roll-numbers"><AssignRollNumbersPage /></PermissionGuard>
}
