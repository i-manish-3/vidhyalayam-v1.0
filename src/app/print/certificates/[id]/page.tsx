'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Loader2, Printer, AlertTriangle, Ban } from 'lucide-react'
import { SchoolPrintHeader, type SchoolForPrintHeader } from '@/lib/print-header'
import {
  renderCertificateBody,
  certificateTypeDef,
  type CertificateSnapshot,
} from '@/features/certificates/lib/certificate-types'

interface RenderResponse {
  certificate: {
    id: string
    certificateNumber: string
    type: string
    issueDate: string
    effectiveDate: string | null
    purpose: string | null
    remarks: string | null
    isTemporary: boolean
    status: string
    template: {
      id: string
      name: string
      numberPrefix: string
      bodyHtml: string
      description: string | null
    } | null
  }
  snapshot: CertificateSnapshot
  school: SchoolForPrintHeader & { principalName: string | null; principalSignature: string | null; trustName: string | null }
}

export default function PrintCertificatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading certificate…
        </div>
      }
    >
      <PrintCertificateContent />
    </Suspense>
  )
}

function PrintCertificateContent() {
  const params = useParams<{ id: string }>()
  const id = params?.id || ''

  const [data, setData] = useState<RenderResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    api
      .get<RenderResponse>(`/api/school/certificates/${id}/render`)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load certificate.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const bodyHtml = useMemo(() => {
    if (!data) return ''
    return renderCertificateBody(
      data.certificate.template?.bodyHtml || '',
      data.snapshot,
      {
        certificateNumber: data.certificate.certificateNumber,
        issueDate: new Date(data.certificate.issueDate),
        effectiveDate: data.certificate.effectiveDate ? new Date(data.certificate.effectiveDate) : null,
        purpose: data.certificate.purpose,
        remarks: data.certificate.remarks,
      },
    )
  }, [data])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading certificate…
      </div>
    )
  }

  if (!id || error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="flex max-w-md items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Couldn&apos;t load certificate</p>
            <p className="mt-0.5 text-xs">{error || 'Missing certificate id.'}</p>
          </div>
        </div>
      </div>
    )
  }

  const { certificate, snapshot, school } = data
  const isVoid = certificate.status === 'void'

  return (
    <>
      <style jsx global>{`
        @page {
          size: A4;
          margin: 12mm;
        }
        @media print {
          html, body { background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="min-h-screen bg-muted/40 p-4 print:bg-white print:p-0">
        <div className="mx-auto max-w-[210mm]">
          <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2.5">
            <div>
              <p className="text-sm font-semibold">
                {certificate.certificateNumber}
                {certificate.isTemporary ? ' · Temporary' : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                {certificateTypeDef(certificate.type).label}
                {certificate.template ? ` · ${certificate.template.name}` : ''}
                {' · '}{new Date(certificate.issueDate).toLocaleDateString('en-IN')}
              </p>
            </div>
            <div className="flex gap-2">
              {isVoid && (
                <span className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
                  <Ban className="size-3.5" /> VOID
                </span>
              )}
              <Button onClick={() => window.print()} size="sm" disabled={isVoid}>
                <Printer className="mr-1.5 size-4" /> Print
              </Button>
            </div>
          </div>

          <div className="relative rounded-sm border bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
            {isVoid && (
              <div className="no-print absolute inset-0 z-10 flex items-center justify-center bg-white/60">
                <span className="rotate-[-12deg] rounded border-4 border-destructive px-6 py-2 text-3xl font-black tracking-widest text-destructive">
                  VOID
                </span>
              </div>
            )}

            <SchoolPrintHeader school={school} />

            <div className="mt-6 flex flex-col gap-8">
              <div
                className="certificate-body text-[13px] leading-relaxed text-slate-900"
                // Template body was sanitized on save and placeholder values are
                // HTML-escaped by renderCertificateBody — no scripts can run.
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />

              <div className="mt-auto grid grid-cols-2 gap-8 pt-10">
                <div className="text-center">
                  {school.principalSignature && (
                    <img src={school.principalSignature} alt="" className="mx-auto h-14 object-contain" />
                  )}
                  <div className="mx-auto border-t border-black pt-1 text-xs">
                    {school.principalName || 'Principal'}
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-500">Principal</p>
                </div>
                <div className="text-center">
                  <div className="mx-auto border-t border-black pt-1 text-xs">{school.trustName || 'Manager'}</div>
                  <p className="mt-0.5 text-[10px] text-slate-500">Authorised Signatory</p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-end justify-between border-t border-slate-200 pt-2 text-[10px] text-slate-500">
              <span>
                {snapshot.student.fullName} · {snapshot.student.admissionNumber || '—'} · {snapshot.student.className}
              </span>
              <span>{school.name} · {snapshot.student.academicYear}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}