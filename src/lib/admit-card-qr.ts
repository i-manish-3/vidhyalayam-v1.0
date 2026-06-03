import { createHmac } from 'node:crypto'

// Minimal, integrity-protected QR payload for exam admit cards. Mirrors
// src/lib/id-card-qr.ts but binds the token to a specific exam (eid) so a
// scanned admit card proves "this student is admitted to this exam".
//
// Layout: `v1.{base64url(payload)}.{base64url(sig)}` where the signature is
// HMAC-SHA256 over the payload using JWT_SECRET. The payload stays tiny so the
// QR renders crisply at admit-card size.
//
// NEVER include sensitive data here — only IDs that are useful to a verifier
// with DB access (e.g. an invigilator's scanner at the hall door).

interface AdmitCardQrPayload {
  // sid = student.id
  // eid = exam.id
  // adm = student.admissionNumber (optional)
  // sch = school.id
  // ay  = academicYear (optional)
  // ts  = issued-at unix seconds
  sid: string
  eid: string
  adm?: string
  sch: string
  ay?: string
  ts: number
}

function getSecret(): string {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 16) {
    throw new Error('JWT_SECRET missing or too short — required for QR signing')
  }
  return s
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface BuildAdmitCardQrInput {
  studentId: string
  examId: string
  admissionNumber?: string | null
  schoolId: string
  academicYear?: string | null
}

export function buildAdmitCardQrPayload(input: BuildAdmitCardQrInput): string {
  const payload: AdmitCardQrPayload = {
    sid: input.studentId,
    eid: input.examId,
    sch: input.schoolId,
    ts: Math.floor(Date.now() / 1000),
  }
  if (input.admissionNumber) payload.adm = input.admissionNumber
  if (input.academicYear) payload.ay = input.academicYear

  const json = JSON.stringify(payload)
  const body = b64url(json)
  const sig = b64url(createHmac('sha256', getSecret()).update(body).digest())
  return `v1.${body}.${sig}`
}

// Verify a scanned admit-card QR string. Returns the parsed payload or null.
export function verifyAdmitCardQrPayload(token: string): AdmitCardQrPayload | null {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  const [, body, sig] = parts
  const expected = b64url(createHmac('sha256', getSecret()).update(body).digest())
  if (expected !== sig) return null
  try {
    const padded = body + '='.repeat((4 - (body.length % 4)) % 4)
    const json = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const parsed = JSON.parse(json) as AdmitCardQrPayload
    if (!parsed.sid || !parsed.eid || !parsed.sch || typeof parsed.ts !== 'number') return null
    return parsed
  } catch {
    return null
  }
}
