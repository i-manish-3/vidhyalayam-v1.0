'use client'

import { Suspense } from 'react'
import { CertificateIssuePage } from '@/features/certificates/pages/issue-page'
import { PermissionGuard } from '@/components/shared'

export default function CertificateIssueRoute() {
  return (
    <PermissionGuard page="certificate-issue">
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        }
      >
        <CertificateIssuePage />
      </Suspense>
    </PermissionGuard>
  )
}