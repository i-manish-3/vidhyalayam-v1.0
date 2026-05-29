'use client'

import { TeamMembersPage } from '@/features/marketing/pages/team-members-page'
import { RoleGuard } from '@/components/shared'

export default function TeamMembersRoute() {
  return (
    <RoleGuard role="SUPER_ADMIN">
      <TeamMembersPage />
    </RoleGuard>
  )
}
