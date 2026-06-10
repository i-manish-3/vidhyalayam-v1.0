'use client'

import { MyChildrenPage } from '@/features/people/pages/my-children-page'
import { PermissionGuard } from '@/components/shared'

export default function MyChildrenRoute() {
  return (
    <PermissionGuard page="parent-children">
      <MyChildrenPage />
    </PermissionGuard>
  )
}
