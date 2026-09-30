'use client'

import { useMemo } from 'react'
import { renderCertificateBody, type CertificateSnapshot } from '../lib/certificate-types'
import { TransferCertificateRenderer } from './transfer-certificate-renderer'

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
  type = 'tc',
  isTemporary = false,
}: {
  bodyHtml: string
  snapshot: CertificateSnapshot | null
  certificateNumber?: string
  issueDate?: Date
  effectiveDate?: Date | null
  purpose?: string
  remarks?: string
  type?: string
  isTemporary?: boolean
}) {
  const isTc = type === 'tc'

  const html = useMemo(() => {
    if (!snapshot) return bodyHtml
    return renderCertificateBody(
      bodyHtml,
      snapshot,
      {
        certificateNumber: certificateNumber || 'DIPS/TC/0083',
        issueDate: issueDate || new Date(),
        effectiveDate,
        purpose: purpose || 'Due to change of residence.',
        remarks,
      },
    )
  }, [bodyHtml, snapshot, certificateNumber, issueDate, effectiveDate, purpose, remarks])

  if (isTc && snapshot) {
    return (
      <div className="rounded-lg border border-dashed bg-slate-50/50 p-2 shadow-sm overflow-x-auto">
        <TransferCertificateRenderer
          snapshot={snapshot}
          certificateNumber={certificateNumber || 'DIPS/TC/0083'}
          issueDate={issueDate || new Date()}
          effectiveDate={effectiveDate}
          purpose={purpose}
          remarks={remarks}
          isTemporary={isTemporary}
        />
      </div>
    )
  }

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