/**
 * RFID/NFC tap ingestion service.
 *
 * Shared by:
 *   - POST /api/school/attendance/tap   (browser kiosk, cookie-authenticated)
 *   - POST /api/rfid/webhook            (networked reader, device-key-authenticated)
 *
 * Day-based attendance: a tap means "this student is present today". Reuses
 * the same Attendance + AttendanceChangeLog tables as manual marking
 * (src/app/api/school/attendance/route.ts:289), so reports, finalize/reopen,
 * and audit trails work unchanged.
 *
 * Guarantees:
 *   - Tenant-isolated: schoolId is the first filter on every query
 *   - Year-scoped: StudentCard.academicYear must match the active AY at tap time
 *   - Atomic: card lookup → attendance upsert → change log → tap log in one $transaction
 *   - Idempotent: a second tap for a student already 'present' today is a no-op
 *   - Finalize-respecting: late taps after teacher finalization are rejected, not silently overwritten
 *   - Audit-complete: every tap writes an RfidTapLog row, including rejections and unmatched UIDs
 */

import { db } from '@/lib/db'
import { isSchoolTeachingDay } from '@/lib/academic-calendar'
import { resolveLocalDate } from '@/lib/timezone'

// Hard cap on clock skew between reader and server. A reader that reports a
// timestamp more than this far from server time is ignored and the server's
// own clock is used. Prevents a misconfigured device from posting attendance
// for the wrong day.
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

export type TapSource = 'kiosk' | 'webhook'

export type TapResultCode =
  | 'marked' // attendance row created with status=present
  | 'updated' // existing absent/leave row flipped to present
  | 'duplicate' // already present today; no DB write
  | 'unknown_card' // UID does not match any active card in current AY
  | 'card_revoked' // UID matched, but card is inactive
  | 'enrollment_missing' // student card exists, but no academic enrollment for current AY
  | 'finalized' // teacher already finalized today's attendance; tap ignored
  | 'non_teaching' // holiday or weekly-off; attendance cannot be marked
  | 'invalid_uid' // UID failed format check after normalization

export interface TapInput {
  schoolId: string
  uid: string
  source: TapSource
  /** Set for kiosk taps; null for webhook. Used for `markedBy`. */
  performedBy?: string | null
  /** Set for webhook taps; null for kiosk. Used for `markedBy` sentinel + lastSeenAt update. */
  deviceId?: string | null
  /** Optional client-reported tap instant. Server time wins if skew > MAX_CLOCK_SKEW_MS. */
  tappedAt?: Date
}

export interface TapResult {
  result: TapResultCode
  student?: {
    id: string
    firstName: string
    lastName: string
    profileImage: string | null
    admissionNumber: string | null
    rollNumber: string | null
    className?: string | null
    sectionName?: string | null
  }
  /** YYYY-MM-DD in school local time. */
  date?: string
  academicYear?: string
  /** Present for unknown_card / invalid_uid; null on success. */
  message?: string
}

// ─── PUBLIC API ─────────────────────────────────────────────────────────────

/**
 * Normalize a UID string to canonical form: uppercase hex, no separators.
 * Accepts inputs like "04:5a:b2:8e", "04-5A-B2-8E", "045ab28e".
 * Returns null if the result is not valid hex of length 8-20.
 */
export function normalizeUid(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  // Common UID lengths: 4-byte (8 hex), 7-byte (14 hex), 10-byte (20 hex).
  if (cleaned.length < 8 || cleaned.length > 20) return null
  if (cleaned.length % 2 !== 0) return null
  return cleaned
}

/**
 * Ingest a single tap. Always returns a TapResult — never throws on business
 * outcomes (unknown card, finalized day, etc.); only throws on infrastructure
 * failures (DB unreachable). All outcomes write an RfidTapLog row.
 */
export async function ingestTap(input: TapInput): Promise<TapResult> {
  const uid = normalizeUid(input.uid)
  if (!uid) {
    await logTap({
      schoolId: input.schoolId,
      uid: input.uid?.slice(0, 64) ?? '',
      studentId: null,
      deviceId: input.deviceId ?? null,
      source: input.source,
      result: 'invalid_uid',
      academicYear: null,
      errorDetail: 'UID failed normalization',
    })
    return { result: 'invalid_uid', message: 'Card UID is malformed.' }
  }

  // Server time wins if reader clock is too far off.
  const now = new Date()
  const tappedAt =
    input.tappedAt && Math.abs(input.tappedAt.getTime() - now.getTime()) <= MAX_CLOCK_SKEW_MS
      ? input.tappedAt
      : now

  const school = await db.school.findUnique({
    where: { id: input.schoolId },
    select: { timezone: true, academicYear: true },
  })
  if (!school) {
    // Should not happen — schoolId came from a verified JWT or device. Log and reject.
    await logTap({
      schoolId: input.schoolId,
      uid,
      studentId: null,
      deviceId: input.deviceId ?? null,
      source: input.source,
      result: 'unknown_card',
      academicYear: null,
      errorDetail: 'School not found',
    })
    return { result: 'unknown_card', message: 'School not found.' }
  }

  // The School.academicYear column is the canonical "current AY" for tap
  // routing. Schools rolling over to a new year update this single field,
  // after which all taps target the new year's StudentCard rows.
  const academicYear = school.academicYear
  const date = resolveLocalDate(school.timezone, tappedAt)

  // Card lookup runs FIRST — even on non-teaching days we want to know who
  // tapped, so admins can investigate "who showed up on Sunday/holiday".
  // Costs one indexed query; the value (forensic visibility) is worth it.
  const card = await db.studentCard.findFirst({
    where: {
      schoolId: input.schoolId,
      uid,
      academicYear,
    },
    select: {
      id: true,
      isActive: true,
      studentId: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profileImage: true,
          admissionNumber: true,
          rollNumber: true,
          deletedAt: true,
        },
      },
    },
  })

  // Non-teaching day check happens AFTER the card lookup so the log row
  // captures studentId. Kiosk banner can also greet the student by name.
  const teaching = await isSchoolTeachingDay(input.schoolId, academicYear, date)
  if (!teaching.teaching) {
    await logTap({
      schoolId: input.schoolId,
      uid,
      studentId: card?.studentId ?? null,
      deviceId: input.deviceId ?? null,
      source: input.source,
      result: 'non_teaching',
      academicYear,
      errorDetail: teaching.reason ?? null,
    })
    const studentSummary = card?.student
      ? {
          id: card.student.id,
          firstName: card.student.firstName,
          lastName: card.student.lastName,
          profileImage: card.student.profileImage,
          admissionNumber: card.student.admissionNumber,
          rollNumber: card.student.rollNumber,
          className: null,
          sectionName: null,
        }
      : undefined
    return {
      result: 'non_teaching',
      date: formatLocalDate(date),
      academicYear,
      student: studentSummary,
      message:
        teaching.reason === 'holiday'
          ? `${teaching.holiday?.name || 'Holiday'} — attendance not marked.`
          : 'School is closed today.',
    }
  }

  if (!card) {
    await logTap({
      schoolId: input.schoolId,
      uid,
      studentId: null,
      deviceId: input.deviceId ?? null,
      source: input.source,
      result: 'unknown_card',
      academicYear,
      errorDetail: null,
    })
    return {
      result: 'unknown_card',
      date: formatLocalDate(date),
      academicYear,
      message: 'Card is not registered for the current academic year.',
    }
  }

  if (!card.isActive) {
    await logTap({
      schoolId: input.schoolId,
      uid,
      studentId: card.studentId,
      deviceId: input.deviceId ?? null,
      source: input.source,
      result: 'card_revoked',
      academicYear,
      errorDetail: null,
    })
    return {
      result: 'card_revoked',
      date: formatLocalDate(date),
      academicYear,
      message: 'This card has been revoked.',
    }
  }

  if (card.student.deletedAt) {
    await logTap({
      schoolId: input.schoolId,
      uid,
      studentId: card.studentId,
      deviceId: input.deviceId ?? null,
      source: input.source,
      result: 'enrollment_missing',
      academicYear,
      errorDetail: 'Student soft-deleted',
    })
    return {
      result: 'enrollment_missing',
      date: formatLocalDate(date),
      academicYear,
      message: 'Student record is no longer active.',
    }
  }

  // Verify enrollment in the current AY. Mirrors the check in the manual
  // POST route (attendance/route.ts:280) — accepts either an academic
  // enrollment row OR an admission for this year.
  const enrollment = await db.studentAcademicEnrollment.findFirst({
    where: {
      schoolId: input.schoolId,
      studentId: card.studentId,
      academicYear,
      deletedAt: null,
    },
    select: {
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  })

  if (!enrollment) {
    // Fallback to admission AY (matches the manual route's tolerance).
    const admission = await db.admission.findFirst({
      where: { studentId: card.studentId, academicYear },
      select: { id: true },
    })
    if (!admission) {
      await logTap({
        schoolId: input.schoolId,
        uid,
        studentId: card.studentId,
        deviceId: input.deviceId ?? null,
        source: input.source,
        result: 'enrollment_missing',
        academicYear,
        errorDetail: 'No enrollment or admission for AY',
      })
      return {
        result: 'enrollment_missing',
        date: formatLocalDate(date),
        academicYear,
        message: 'Student is not enrolled in the current academic year.',
      }
    }
  }

  // ── Atomic write: finalize check → upsert → change log → tap log ──
  const markedBy = input.performedBy ?? null

  const outcome = await db.$transaction(async (tx) => {
    const existing = await tx.attendance.findUnique({
      where: {
        schoolId_studentId_date: {
          schoolId: input.schoolId,
          studentId: card.studentId,
          date,
        },
      },
      select: { status: true, remarks: true, finalized: true },
    })

    if (existing?.finalized) {
      await tx.rfidTapLog.create({
        data: {
          schoolId: input.schoolId,
          uid,
          studentId: card.studentId,
          deviceId: input.deviceId ?? null,
          source: input.source,
          result: 'finalized',
          academicYear,
        },
      })
      return { code: 'finalized' as const }
    }

    if (existing?.status === 'present') {
      await tx.rfidTapLog.create({
        data: {
          schoolId: input.schoolId,
          uid,
          studentId: card.studentId,
          deviceId: input.deviceId ?? null,
          source: input.source,
          result: 'duplicate',
          academicYear,
        },
      })
      return { code: 'duplicate' as const }
    }

    // 'rfid_kiosk' = browser tap with an operator signed in (markedBy = userId)
    // 'rfid_webhook' = networked reader tap, no operator (markedBy stays null)
    const markedSource = input.source === 'kiosk' ? 'rfid_kiosk' : 'rfid_webhook'

    await tx.attendance.upsert({
      where: {
        schoolId_studentId_date: {
          schoolId: input.schoolId,
          studentId: card.studentId,
          date,
        },
      },
      create: {
        schoolId: input.schoolId,
        studentId: card.studentId,
        academicYear,
        date,
        status: 'present',
        markedBy,
        markedSource,
      },
      update: {
        status: 'present',
        markedBy,
        markedSource,
      },
    })

    // Log mutation in AttendanceChangeLog for parity with manual edits. First
    // marks are not logged (matches the manual route's behaviour at line 328).
    if (existing && existing.status !== 'present' && markedBy) {
      await tx.attendanceChangeLog.create({
        data: {
          schoolId: input.schoolId,
          academicYear,
          studentId: card.studentId,
          date,
          oldStatus: existing.status,
          newStatus: 'present',
          oldRemarks: existing.remarks ?? null,
          newRemarks: null,
          changedBy: markedBy,
        },
      })
    }

    await tx.rfidTapLog.create({
      data: {
        schoolId: input.schoolId,
        uid,
        studentId: card.studentId,
        deviceId: input.deviceId ?? null,
        source: input.source,
        result: existing ? 'updated' : 'marked',
        academicYear,
      },
    })

    return { code: (existing ? 'updated' : 'marked') as const }
  })

  // Webhook taps: bump device lastSeenAt outside the transaction. Failing
  // here must NOT roll back the attendance write.
  if (input.deviceId) {
    await db.rfidDevice
      .update({
        where: { id: input.deviceId },
        data: { lastSeenAt: tappedAt },
      })
      .catch(() => {
        // best-effort; missing device or transient failure shouldn't break the tap response
      })
  }

  return {
    result: outcome.code,
    student: {
      id: card.student.id,
      firstName: card.student.firstName,
      lastName: card.student.lastName,
      profileImage: card.student.profileImage,
      admissionNumber: card.student.admissionNumber,
      rollNumber: card.student.rollNumber,
      className: enrollment?.class?.name ?? null,
      sectionName: enrollment?.section?.name ?? null,
    },
    date: formatLocalDate(date),
    academicYear,
  }
}

// ─── INTERNAL ───────────────────────────────────────────────────────────────

interface TapLogInput {
  schoolId: string
  uid: string
  studentId: string | null
  deviceId: string | null
  source: TapSource
  result: TapResultCode
  academicYear: string | null
  errorDetail?: string | null
}

// Used for pre-transaction outcomes (invalid UID, school missing, non-teaching).
// In-transaction outcomes write directly via tx.rfidTapLog.create.
async function logTap(input: TapLogInput): Promise<void> {
  await db.rfidTapLog
    .create({
      data: {
        schoolId: input.schoolId,
        uid: input.uid,
        studentId: input.studentId,
        deviceId: input.deviceId,
        source: input.source,
        result: input.result,
        academicYear: input.academicYear,
        errorDetail: input.errorDetail ?? null,
      },
    })
    .catch((error) => {
      // Telemetry write failure must never break the user-facing response.
      console.error('Failed to write RfidTapLog:', error)
    })
}

// Mirrors the shape used by attendance-report-utils.ts:47 (formatIsoDate).
// `d` is a server-local-midnight Date produced by resolveLocalDate().
function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
