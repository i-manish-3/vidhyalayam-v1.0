'use client'

import { AdmissionFormPage } from '@/features/admissions/pages/admission-form-page'
import { PermissionGuard } from '@/components/shared'

export default function AdmitStudentRoute() {
  return <PermissionGuard page="admission-form"><AdmissionFormPage /></PermissionGuard>
}
