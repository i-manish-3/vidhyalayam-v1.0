'use client'

import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import type { CardElement, DynamicFieldKey } from '@/lib/id-card-types'

const MM_TO_PX = 3.78 // 1mm ≈ 3.78px at 96 DPI screen baseline

export interface CardRenderData {
  studentId: string
  photo: string | null
  qrPayload: string
  fields: Record<string, string>
}

export interface RenderTemplate {
  widthMm: number
  heightMm: number
  backgroundColor: string
  frontBackground: string | null
  backBackground: string | null
  hasBackSide: boolean
  frontLayout: CardElement[]
  backLayout: CardElement[] | null
}

interface RenderContext {
  template: RenderTemplate
  card: CardRenderData | null
  schoolLogo?: string | null
  // Scale factor: 1 = real-world; <1 for thumbnails. Defaults to 1.
  scale?: number
}

// Resolve dynamic field value from card data; falls back to a friendly placeholder.
function resolveText(el: CardElement, card: CardRenderData | null): string {
  if (el.type === 'staticText') return el.text || ''
  if (el.type === 'dynamicField') {
    const key = el.field as DynamicFieldKey | undefined
    const value = key ? card?.fields[key] || '' : ''
    const prefix = el.prefix || ''
    const suffix = el.suffix || ''
    if (!value) return prefix || suffix ? `${prefix}${suffix}` : '—'
    return `${prefix}${value}${suffix}`
  }
  return ''
}

// Renders a single side of an ID card. Positions are in mm; we convert at
// render time so the same JSON layout renders identically for design,
// preview, and the printed PDF.
function CardSide({
  template,
  card,
  layout,
  background,
  schoolLogo,
  scale = 1,
  showGrid = false,
}: {
  template: RenderTemplate
  card: CardRenderData | null
  layout: CardElement[]
  background: string | null
  schoolLogo?: string | null
  scale?: number
  showGrid?: boolean
}) {
  const px = MM_TO_PX * scale
  const widthPx = template.widthMm * px
  const heightPx = template.heightMm * px

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const needsQr = layout.some((el) => el.type === 'qrCode' || el.type === 'barcode')
    if (!needsQr || !card?.qrPayload) {
      setQrDataUrl(null)
      return
    }
    QRCode.toDataURL(card.qrPayload, { width: 256, margin: 0, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch((err) => {
        console.error('QR generation failed:', err)
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [card?.qrPayload, layout])

  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        backgroundColor: template.backgroundColor || '#ffffff',
        backgroundImage: background ? `url(${background})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        // Subtle outline so designers can see the card edge while editing.
        boxShadow: showGrid ? 'inset 0 0 0 1px rgba(0,0,0,0.1)' : 'inset 0 0 0 1px rgba(0,0,0,0.05)',
      }}
    >
      {showGrid && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px),linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)',
            backgroundSize: `${5 * px}px ${5 * px}px`,
          }}
        />
      )}
      {layout.map((el) => {
        const style: React.CSSProperties = {
          position: 'absolute',
          left: `${el.x * px}px`,
          top: `${el.y * px}px`,
          width: `${el.width * px}px`,
          height: `${el.height * px}px`,
          color: el.color || undefined,
          backgroundColor: el.backgroundColor || undefined,
          border: el.borderWidth && el.borderColor ? `${el.borderWidth}px solid ${el.borderColor}` : undefined,
          borderRadius: el.borderRadius ? `${el.borderRadius}px` : undefined,
          fontSize: el.fontSize ? `${el.fontSize * scale}px` : undefined,
          fontWeight: el.fontWeight || undefined,
          fontFamily: el.fontFamily || undefined,
          textAlign: el.textAlign || undefined,
          opacity: el.opacity ?? undefined,
          zIndex: el.zIndex ?? undefined,
          transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start',
          padding: '1px 2px',
          lineHeight: 1.15,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }

        if (el.type === 'studentPhoto') {
          return (
            <div key={el.id} style={style}>
              {card?.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.photo}
                  alt="Student"
                  className="size-full"
                  style={{
                    objectFit: 'cover',
                    borderRadius: el.borderRadius ? `${el.borderRadius}px` : undefined,
                  }}
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                  Student Photo
                </div>
              )}
            </div>
          )
        }

        if (el.type === 'schoolLogo') {
          return (
            <div key={el.id} style={style}>
              {schoolLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={schoolLogo}
                  alt="School Logo"
                  className="size-full"
                  style={{ objectFit: 'contain' }}
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                  Logo
                </div>
              )}
            </div>
          )
        }

        if (el.type === 'qrCode' || el.type === 'barcode') {
          return (
            <div key={el.id} style={style}>
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrDataUrl} alt="QR" className="size-full" style={{ objectFit: 'contain' }} />
              ) : (
                <div className="flex size-full items-center justify-center bg-muted text-[8px] text-muted-foreground">
                  QR
                </div>
              )}
            </div>
          )
        }

        if (el.type === 'signature') {
          return (
            <div key={el.id} style={style}>
              {el.imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={el.imageSrc} alt="Signature" className="size-full" style={{ objectFit: 'contain' }} />
              ) : (
                <div className="flex size-full items-center justify-center text-[9px] italic text-muted-foreground">
                  Principal Signature
                </div>
              )}
            </div>
          )
        }

        if (el.type === 'image') {
          return (
            <div key={el.id} style={style}>
              {el.imageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={el.imageSrc} alt="" className="size-full" style={{ objectFit: 'cover' }} />
              ) : null}
            </div>
          )
        }

        if (el.type === 'shape') {
          return (
            <div
              key={el.id}
              style={{
                ...style,
                borderRadius: el.shape === 'circle' ? '50%' : style.borderRadius,
              }}
            />
          )
        }

        // dynamicField / staticText
        return (
          <div key={el.id} style={style}>
            {resolveText(el, card)}
          </div>
        )
      })}
    </div>
  )
}

export function IdCardRenderer({
  template,
  card,
  schoolLogo,
  scale = 1,
  side = 'front',
  showGrid = false,
}: RenderContext & { side?: 'front' | 'back'; showGrid?: boolean }) {
  const layout = side === 'back' ? template.backLayout || [] : template.frontLayout
  const background = side === 'back' ? template.backBackground : template.frontBackground
  return (
    <CardSide
      template={template}
      card={card}
      layout={layout}
      background={background}
      schoolLogo={schoolLogo}
      scale={scale}
      showGrid={showGrid}
    />
  )
}

// Renders both front and back side-by-side. Use for previews.
export function IdCardBothSides({
  template,
  card,
  schoolLogo,
  scale = 1,
  showGrid = false,
}: RenderContext & { showGrid?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      <IdCardRenderer
        template={template}
        card={card}
        schoolLogo={schoolLogo}
        scale={scale}
        side="front"
        showGrid={showGrid}
      />
      {template.hasBackSide && (
        <IdCardRenderer
          template={template}
          card={card}
          schoolLogo={schoolLogo}
          scale={scale}
          side="back"
          showGrid={showGrid}
        />
      )}
    </div>
  )
}

// Demo card data used by the designer when no student is selected.
export const DEMO_CARD: CardRenderData = {
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
    'student.address': '24 Park Street, New Delhi',
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

export function useDemoCardMemo(): CardRenderData {
  return useMemo(() => DEMO_CARD, [])
}
