'use client'

import { useMemo } from 'react'
import { renderCertificateBody, type CertificateSnapshot } from '../lib/certificate-types'

/**
 * Live certificate preview — renders a template body with either real
 * (issue page) or sample (template editor) snapshot data. The output mirrors
 * what the print page produces: escaped placeholder values injected into the
 * admin-authored HTML, wrapped in a bordered A4-ish sheet.
 */
export function CertificatePreview({
  bodyHtml,
  snapshot,
  certificateNumber,
  issueDate,
  effectiveDate,
  purpose,
  remarks,
}: {
  bodyHtml: string
  snapshot: CertificateSnapshot | null
  certificateNumber?: string
  issueDate?: Date
  effectiveDate?: Date | null
  purpose?: string
  remarks?: string
}) {
  const html = useMemo(() => {
    if (!snapshot) return bodyHtml
    return renderCertificateBody(
      bodyHtml,
      snapshot,
      {
        certificateNumber: certificateNumber || 'TC-2026-0001',
        issueDate: issueDate || new Date(),
        effectiveDate,
        purpose: purpose || 'bank loan',
        remarks,
      },
    )
  }, [bodyHtml, snapshot, certificateNumber, issueDate, effectiveDate, purpose, remarks])

  return (
    <div className="rounded-lg border border-dashed bg-white p-2 shadow-sm">
      <div
        className="certificate-preview-body mx-auto min-h-[420px] max-w-[210mm] bg-white p-8 text-[13px] leading-relaxed text-slate-800"
        // The template body is admin-authored HTML that was sanitized on save;
        // it never contains scripts or event handlers. Placeholder values are
        // HTML-escaped by renderCertificateBody before injection.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}