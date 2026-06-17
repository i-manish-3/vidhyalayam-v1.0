/**
 * Pure React component that turns an `AdmitCardData` shape into a printable A4
 * hall ticket. Used by:
 *  - the bulk print page (`src/app/print/admit-cards/[examId]/page.tsx`)
 *  - the admin preview panel on the admit-card generate screen
 *  - the live preview in the Admit Card Template editor
 *
 * Visual decisions live here; the generator decides *what* to show. The optional
 * `template` config (accent colour, field visibility, schedule columns, signature
 * labels, section toggles) lets a school customise the layout without code. The
 * signed QR token is rendered to an image client-side via the `qrcode` package.
 */

'use client'

/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'
import type { AdmitCardData } from '@/features/exams/lib/admit-card-generator'
import {
  type AdmitCardTemplateConfig,
  DEFAULT_ADMIT_CARD_TEMPLATE,
} from '@/features/exams/lib/admit-card-template'

interface Props {
  data: AdmitCardData
  template?: AdmitCardTemplateConfig
  className?: string
}

const RED = '#c0272d'

// Darken a hex colour a touch for the table header (keeps contrast on the band).
function darken(hex: string, amount = 0.12): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)))
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)))
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export function AdmitCardRenderer({ data, template, className }: Props) {
  const cfg = template ?? DEFAULT_ADMIT_CARD_TEMPLATE
  const { school, examMeta, student, datesheet, instructions, qrPayload } = data
  const accent = cfg.accentColor
  const accentDark = darken(accent)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!cfg.showQr || !qrPayload) {
      setQrDataUrl(null)
      return
    }
    QRCode.toDataURL(qrPayload, { width: 256, margin: 0, errorCorrectionLevel: 'M' })
      .then((url) => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => { if (!cancelled) setQrDataUrl(null) })
    return () => { cancelled = true }
  }, [qrPayload, cfg.showQr])

  const titleSuffix = examMeta.name ? `${cfg.titlePrefix} — ${examMeta.name}` : cfg.titlePrefix
  const centeredHeader = cfg.headerStyle === 'centered'
  const bannerHeader = cfg.headerStyle === 'banner' && !!school.logo

  // Student info rows, gated by config visibility.
  const infoRows: Array<{ label: string; value: string }> = []
  infoRows.push({ label: 'Student Name', value: student.fullName })
  if (cfg.fields.rollNumber) infoRows.push({ label: 'Roll No', value: student.rollNumber })
  if (cfg.fields.fatherName) infoRows.push({ label: "Father's Name", value: student.fatherName })
  if (cfg.fields.motherName) infoRows.push({ label: "Mother's Name", value: student.motherName })
  if (cfg.fields.classSection) infoRows.push({ label: 'Class & Section', value: `${student.className} – ${student.sectionName}` })
  if (cfg.fields.session) infoRows.push({ label: 'Session', value: examMeta.academicYear })
  if (cfg.fields.dateOfBirth) infoRows.push({ label: 'Date of Birth', value: student.dateOfBirth })
  if (cfg.fields.admissionNumber) infoRows.push({ label: 'Admission No', value: student.admissionNumber })
  if (cfg.fields.gender) infoRows.push({ label: 'Gender', value: student.gender })

  const cols = cfg.scheduleColumns
  const thStyle: React.CSSProperties = { color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '8px 12px', textAlign: 'center', border: `1px solid ${accent}` }
  const tdStyle: React.CSSProperties = { fontSize: 12.5, color: '#222', padding: '8px 12px', textAlign: 'center', fontWeight: 500, border: '1px solid #dde3ee' }

  return (
    <div
      className={cn('admit-card-page', className)}
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        background: '#fff',
        color: '#111',
        width: '100%',
        maxWidth: '794px',
        margin: '0 auto',
        position: 'relative',
        padding: '24px 28px 28px',
      }}
    >
      <div style={{ position: 'absolute', inset: 10, border: `1.5px solid ${accent}33`, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* ── HEADER ── */}
        {bannerHeader ? (
          <div style={{ borderBottom: `2px solid ${accent}`, paddingBottom: 12 }}>
            <img src={school.logo!} alt="" style={{ display: 'block', width: '100%' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 12, borderBottom: `2px solid ${accent}` }}>
            {!centeredHeader && <HeaderLogo logo={school.logo} name={school.name} accent={accent} />}
            <div style={{ textAlign: 'center', flex: 1 }}>
              {centeredHeader && school.logo ? (
                <img src={school.logo} alt="" style={{ height: 56, objectFit: 'contain', margin: '0 auto 6px' }} />
              ) : null}
              <div style={{ fontFamily: "'Merriweather', Georgia, serif", fontSize: 19, color: accent, fontWeight: 700, letterSpacing: 0.3, lineHeight: 1.3 }}>
                {school.name}
              </div>
              {school.address ? <div style={{ fontSize: 11.5, color: '#444', marginTop: 3 }}>{school.address}</div> : null}
              {school.trustName ? <div style={{ fontSize: 11.5, color: RED, fontWeight: 700, marginTop: 3 }}>Run by: {school.trustName}</div> : null}
              {school.board ? <div style={{ fontSize: 11.5, color: '#25519e', marginTop: 2 }}>{school.board}</div> : null}
            </div>
            {!centeredHeader && (
              <div style={{ textAlign: 'right', fontSize: 10.5, color: '#666', lineHeight: 1.7, flexShrink: 0, maxWidth: 150 }}>
                {school.establishedYear ? <div><strong style={{ color: '#333' }}>Estd:</strong> {school.establishedYear}</div> : null}
                {school.registrationNumber ? (
                  <div style={{ marginTop: 6, fontSize: 9.5, wordBreak: 'break-all' }}>
                    <strong style={{ color: '#333' }}>Reg. No:</strong><br />{school.registrationNumber}
                  </div>
                ) : null}
                {school.affiliationNumber ? (
                  <div style={{ marginTop: 6, fontSize: 9.5, wordBreak: 'break-all' }}>
                    <strong style={{ color: '#333' }}>Affl. No:</strong><br />{school.affiliationNumber}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* ── TITLE BAR ── */}
        <div style={{ background: accent, color: '#fff', textAlign: 'center', padding: '8px 0', fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginTop: 14 }}>
          {titleSuffix}
          {examMeta.academicYear ? <span style={{ fontWeight: 400, letterSpacing: 1 }}> &nbsp;·&nbsp; {examMeta.academicYear}</span> : null}
        </div>

        {/* ── STUDENT INFO ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, padding: '16px 0 14px', borderBottom: '1px solid #dde2ea' }}>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '11px 32px' }}>
            {infoRows.map((row) => (
              <InfoRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>

          {(cfg.showPhoto || cfg.showQr) && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {cfg.showPhoto && (
                <div style={{ width: 95, height: 115, border: `2px solid ${accent}`, borderRadius: 4, background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 11, textAlign: 'center', overflow: 'hidden' }}>
                  {student.profileImage ? (
                    <img src={student.profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span>Student<br />Photo</span>
                  )}
                </div>
              )}
              {cfg.showQr && (qrDataUrl ? (
                <img src={qrDataUrl} alt="Verification QR" style={{ width: 72, height: 72 }} />
              ) : (
                <div style={{ width: 72, height: 72, border: '1px dashed #cbd5e1' }} />
              ))}
            </div>
          )}
        </div>

        {/* ── EXAM SCHEDULE ── */}
        <div style={{ marginTop: 14 }}>
          <div style={{ background: accent, color: '#fff', textAlign: 'center', padding: '7px 0', fontSize: 12.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Examination Schedule
          </div>
          {datesheet.length === 0 ? (
            <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 12, fontStyle: 'italic', color: '#666', border: '1px solid #dde3ee', borderTop: 'none' }}>
              The datesheet will be announced separately.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: accentDark }}>
                  <th style={thStyle}>Subject</th>
                  <th style={thStyle}>Date</th>
                  {cols.day && <th style={thStyle}>Day</th>}
                  {cols.time && <th style={thStyle}>Time</th>}
                  {cols.duration && <th style={thStyle}>Duration</th>}
                  {cols.room && <th style={thStyle}>Room</th>}
                </tr>
              </thead>
              <tbody>
                {datesheet.map((row, i) => (
                  <tr key={`${row.subjectName}-${i}`} style={{ background: i % 2 === 1 ? '#f4f7fc' : '#fff' }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: accent }}>{row.subjectName}</td>
                    <td style={tdStyle}>{row.dateShort}</td>
                    {cols.day && <td style={tdStyle}>{row.day}</td>}
                    {cols.time && <td style={tdStyle}>{row.time}</td>}
                    {cols.duration && <td style={tdStyle}>{row.duration}</td>}
                    {cols.room && <td style={tdStyle}>{row.room}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── INSTRUCTIONS ── */}
        {cfg.showInstructions && instructions.length > 0 ? (
          <div style={{ marginTop: 16, background: '#fffbeb', border: '1px solid #e8c84a', borderRadius: 6, padding: '12px 18px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Important Instructions
            </div>
            <ul style={{ paddingLeft: 20, columnCount: 2, columnGap: 24, margin: 0 }}>
              {instructions.map((line, i) => (
                <li key={i} style={{ fontSize: 12, color: '#78350f', marginBottom: 4, lineHeight: 1.5, breakInside: 'avoid' }}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* ── SIGNATURES ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 28, paddingTop: 20, gap: 12 }}>
          <SigBlock label={cfg.signatures.left} />
          <SigBlock label={cfg.signatures.middle} />
          <SigBlock label={cfg.signatures.right} image={school.principalSignature} name={school.principalName} />
        </div>

        {/* ── FOOTER ── */}
        <div style={{ background: accent, color: '#ffffffcc', textAlign: 'center', padding: 9, fontSize: 11.5, letterSpacing: 0.4, marginTop: 18 }}>
          {school.name}
          {school.principalName ? <> &nbsp;|&nbsp; Principal: {school.principalName}</> : null}
        </div>
      </div>
    </div>
  )
}

function HeaderLogo({ logo, name, accent }: { logo: string | null; name: string; accent: string }) {
  // White background behind a real logo so a dark/transparent logo stays visible;
  // navy fill + white initials only for the no-logo fallback.
  return (
    <div style={{ width: 72, height: 72, borderRadius: '50%', border: `2px solid ${accent}`, background: logo ? '#fff' : accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', fontSize: 9, fontWeight: 700, textAlign: 'center', lineHeight: 1.3, padding: logo ? 4 : 6 }}>
      {logo ? (
        <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        name.split(/\s+/).map((w) => w.charAt(0)).join('').slice(0, 4).toUpperCase() || 'SCH'
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#333', whiteSpace: 'nowrap', minWidth: 110 }}>{label}:</span>
      <span style={{ fontSize: 13, color: '#111', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function SigBlock({ label, image, name }: { label: string; image?: string | null; name?: string | null }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ borderBottom: '1.5px solid #777', width: '85%', margin: '0 auto 6px', height: 38, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' }}>
        {image ? <img src={image} alt="" style={{ maxHeight: 36, objectFit: 'contain' }} /> : null}
      </div>
      {name ? <div style={{ fontSize: 12, color: RED, fontWeight: 700, marginBottom: 2 }}>({name})</div> : null}
      <div style={{ fontSize: 11.5, color: '#444', fontWeight: 600 }}>{label}</div>
    </div>
  )
}
