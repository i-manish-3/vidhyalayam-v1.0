import { createHmac } from 'node:crypto'

// Minimal, integrity-protected QR payload for student ID cards.
// Layout: `v1.{base64url(payload)}.{base64url(sig)}` where the signature is
// HMAC-SHA256 over the payload using JWT_ACCESS_SECRET (already required by
// the auth layer). We deliberately keep the payload tiny so the QR renders
// crisply on small CR-80 cards.
//
// NEVER include sensitive data here — only IDs that are useful in a context
// where the verifier has DB access (e.g. school's gate scanner). The card
// surface already prints non-sensitive info; the QR is the secure handshake.

interface QrPayload {
  // sid  = student.id
  // adm  = student.admissionNumber (optional, present when student has one)
  // sch  = school.id
  // ay   = academicYear (optional)
  // ts   = issued-at unix seconds
  sid: string
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

export interface BuildQrInput {
  studentId: string
  admissionNumber?: string | null
  schoolId: string
  academicYear?: string | null
}

export function buildStudentQrPayload(input: BuildQrInput): string {
  const payload: QrPayload = {
    sid: input.studentId,
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

// Optional: verify a scanned QR string. Returns parsed payload or null.
// Useful for a future "gate scanner" feature.
export function verifyStudentQrPayload(token: string): QrPayload | null {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  const [, body, sig] = parts
  const expected = b64url(createHmac('sha256', getSecret()).update(body).digest())
  if (expected !== sig) return null
  try {
    const padded = body + '='.repeat((4 - (body.length % 4)) % 4)
    const json = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const parsed = JSON.parse(json) as QrPayload
    if (!parsed.sid || !parsed.sch || typeof parsed.ts !== 'number') return null
    return parsed
  } catch {
    return null
  }
}
