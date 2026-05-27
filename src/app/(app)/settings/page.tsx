'use client'

import { SettingsPage } from '@/features/settings/pages/settings-page'
import { PermissionGuard } from '@/components/shared'

export default function SettingsRoute() {
  return <PermissionGuard page="settings"><SettingsPage /></PermissionGuard>
}
