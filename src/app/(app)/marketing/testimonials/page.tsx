'use client'

import { TestimonialsPage } from '@/features/marketing/pages/testimonials-page'
import { RoleGuard } from '@/components/shared'

export default function TestimonialsRoute() {
  return (
    <RoleGuard role="SUPER_ADMIN">
      <TestimonialsPage />
    </RoleGuard>
  )
}
