'use client'

import { ContactRequestsPage } from '@/features/marketing/pages/contact-requests-page'
import { RoleGuard } from '@/components/shared'

export default function ContactRequestsRoute() {
  return (
    <RoleGuard role="SUPER_ADMIN">
      <ContactRequestsPage />
    </RoleGuard>
  )
}
