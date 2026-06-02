'use client'

import { useId, useMemo } from 'react'
import { scopeCss } from '@/lib/id-card-sanitize'

const MM_TO_PX = 3.78 // 1mm ≈ 3.78px at 96 DPI screen baseline

export interface HtmlRenderData {
  studentId: string
  photo: string | null
  qrPayload: string
  fields: Record<string, string>
}

export interface HtmlRenderTemplate {
  widthMm: number
  heightMm: number
  frontHtml: string
  frontCss: string
  backHtml: string | null
  backCss: string | null
  hasBackSide: boolean
}

// Tokens supported in template HTML/CSS. We do plain string substitution
// after escaping so admins can't break out of attribute contexts.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const PHOTO_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100"><rect width="80" height="100" fill="#e2e8f0"/><circle cx="40" cy="38" r="14" fill="#94a3b8"/><path d="M14 88c0-14 12-22 26-22s26 8 26 22" fill="#94a3b8"/></svg>`,
  )

const LOGO_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="6" fill="#e2e8f0"/><text x="20" y="26" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="700" fill="#64748b">L</text></svg>`,
  )

const QR_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#f1f5f9"/><text x="20" y="24" text-anchor="middle" font-family="monospace" font-size="6" fill="#64748b">QR</text></svg>`,
  )

const SIGNATURE_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 60"><rect width="160" height="60" fill="transparent"/></svg>`,
  )

function applyOptionalFields(html: string, fields: Record<string, string>): string {
  if (typeof document === 'undefined') return html
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll<HTMLElement>('[data-show-if]').forEach((el) => {
    const field = el.getAttribute('data-show-if')?.trim()
    if (!field || !fields[field]?.trim()) el.remove()
  })
  return template.innerHTML
}

function substitutePlaceholders(
  html: string,
  fields: Record<string, string>,
  photo: string,
  logo: string,
  qr: string,
  signature: string,
): string {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    if (key === 'photo') return photo
    if (key === 'logo') return logo
    if (key === 'qr') return qr
    if (key === 'signature') return signature
    const value = fields[key]
    if (value === undefined || value === null) return ''
    return escapeHtml(value)
  })
}

interface IdCardHtmlSideProps {
  template: HtmlRenderTemplate
  card: HtmlRenderData | null
  schoolLogo: string | null
  side: 'front' | 'back'
  scale: number
}

function IdCardHtmlSide({ template, card, schoolLogo, side, scale }: IdCardHtmlSideProps) {
  const scopeId = useId().replace(/[^a-zA-Z0-9]/g, '') || 'card'
  const scope = `idcard-${scopeId}-${side}`

  // Base dimensions in pixels assume 1mm = 3.78px (96 DPI screen baseline).
  // The template HTML/CSS uses `mm` units throughout, which the browser maps
  // to physical millimetres on print (regardless of scale) and to ~3.78px
  // on screen. To preview the same design larger or smaller, we render the
  // content at its NATIVE size and then apply `transform: scale()` to the
  // whole tree. That way every padding / font-size / grid track scales
  // uniformly. Plain width/height scaling doesn't work because mm is an
  // absolute unit and stays constant regardless of container size.
  const baseWidthPx = template.widthMm * MM_TO_PX
  const baseHeightPx = template.heightMm * MM_TO_PX

  const rawHtml = side === 'back' ? template.backHtml || '' : template.frontHtml
  const rawCss = side === 'back' ? template.backCss || '' : template.frontCss

  const { html, css } = useMemo(() => {
    const fields = card?.fields || {}
    const photoSrc = card?.photo || PHOTO_PLACEHOLDER
    const logoSrc = schoolLogo || LOGO_PLACEHOLDER
    const signatureSrc = fields['school.principalSignature'] || SIGNATURE_PLACEHOLDER
    const htmlWithOptionalFields = applyOptionalFields(rawHtml, fields)
    const substituted = substitutePlaceholders(htmlWithOptionalFields, fields, photoSrc, logoSrc, QR_PLACEHOLDER, signatureSrc)
    const scoped = scopeCss(rawCss, `.${scope}`)
    return { html: substituted, css: scoped }
  }, [rawHtml, rawCss, card, schoolLogo, scope])

  return (
    <div
      className={scope}
      style={{
        width: `${baseWidthPx * scale}px`,
        height: `${baseHeightPx * scale}px`,
        position: 'relative',
        overflow: 'hidden',
        background: '#ffffff',
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
        borderRadius: '2px',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div
        style={{
          width: `${baseWidthPx}px`,
          height: `${baseHeightPx}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'relative',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

export function IdCardHtmlRenderer({
  template,
  card,
  schoolLogo,
  scale = 1,
  side = 'front',
}: {
  template: HtmlRenderTemplate
  card: HtmlRenderData | null
  schoolLogo?: string | null
  scale?: number
  side?: 'front' | 'back'
}) {
  return (
    <IdCardHtmlSide
      template={template}
      card={card}
      schoolLogo={schoolLogo || null}
      side={side}
      scale={scale}
    />
  )
}

export function IdCardHtmlBothSides({
  template,
  card,
  schoolLogo,
  scale = 1,
}: {
  template: HtmlRenderTemplate
  card: HtmlRenderData | null
  schoolLogo?: string | null
  scale?: number
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <IdCardHtmlSide
        template={template}
        card={card}
        schoolLogo={schoolLogo || null}
        side="front"
        scale={scale}
      />
      {template.hasBackSide && (
        <IdCardHtmlSide
          template={template}
          card={card}
          schoolLogo={schoolLogo || null}
          side="back"
          scale={scale}
        />
      )}
    </div>
  )
}

// Demo card data used by the designer / preset gallery preview.
export const DEMO_HTML_CARD: HtmlRenderData = {
  studentId: 'demo',
  photo: null,
  qrPayload: 'v1.demo.demo',
  fields: {
    'student.name': 'Aman Sharma',
    'student.admissionNumber': 'ADM-2026-0042',
    'student.rollNumber': '14',
    'student.class': '10',
    'student.section': 'A',
    'student.classSection': '10 - A',
    'student.dateOfBirth': '12 Jan 2010',
    'student.bloodGroup': 'B+',
    'student.gender': 'Male',
    'student.address': '24 Park Street, New Delhi - 110001',
    'student.parentName': 'Rajiv Sharma',
    'student.fatherName': 'Rajiv Sharma',
    'student.motherName': 'Anita Sharma',
    'student.parentPhone': '+91 98765 43210',
    'student.academicYear': '2026-2027',
    'student.registrationNumber': 'REG-2026-001',
    'student.udiseId': '10040803103',
    'school.name': 'Greenfield Public School',
    'school.address': 'Sector 12, New Delhi, 110001',
    'school.phone': '+91 11 2345 6789',
    'school.email': 'info@greenfield.edu',
    'school.website': 'www.greenfield.edu',
    'school.registrationNumber': '206106320211021142545',
    'school.udiseNumber': '10040803103',
    'school.affiliationNumber': 'CBSE/AFF/2026',
    'school.establishedYear': '2021',
    'school.principalSignature': '',
  },
}
