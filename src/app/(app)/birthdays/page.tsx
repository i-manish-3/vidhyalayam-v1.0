import { PermissionGuard } from '@/components/shared'
import { BirthdaysPage } from '@/features/birthdays/pages/birthdays-page'

export default function BirthdaysRoute() {
  return (
    <PermissionGuard page="birthdays">
      <BirthdaysPage />
    </PermissionGuard>
  )
}