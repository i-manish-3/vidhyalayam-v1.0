import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import {
  unauthorizedError,
  forbiddenError,
  internalError,
  apiError,
  notFoundError,
} from '@/lib/api-errors'
import { normalizeUid } from '@/lib/attendance-tap-service'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

async function resolveAcademicYear(
  schoolId: string,
  requested: string | null,
): Promise<string | null> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const year = (requested || school?.academicYear || '').trim()
  return ACADEMIC_YEAR_PATTERN.test(year) ? year : null
}

// GET /api/school/rfid/cards
// Query: studentId (optional), academicYear (optional, defaults to current),
//        includeRevoked=1 to include revoked cards in the response.
//
// If studentId is given → returns that student's cards (history view).
// If studentId is omitted → returns all active cards in the AY (admin overview).
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'rfid:cards:read')
    if (!user || !user.schoolId) {
      return user ? forbiddenError() : unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') || undefined
    const academicYear = await resolveAcademicYear(
      user.schoolId,
      searchParams.get('academicYear'),
    )
    if (!academicYear) {
      return apiError(400, 'Please choose a valid academic year.')
    }
    const includeRevoked = searchParams.get('includeRevoked') === '1'
    const allYears = searchParams.get('allYears') === '1' && !!studentId

    const cards = await db.studentCard.findMany({
      where: {
        schoolId: user.schoolId,
        ...(studentId ? { studentId } : {}),
        ...(allYears ? {} : { academicYear }),
        ...(includeRevoked ? {} : { isActive: true }),
      },
      orderBy: [{ academicYear: 'desc' }, { assignedAt: 'desc' }],
      select: {
        id: true,
        uid: true,
        academicYear: true,
        isActive: true,
        assignedAt: true,
        assignedBy: true,
        revokedAt: true,
        revokedBy: true,
        revokeReason: true,
        printNotes: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            rollNumber: true,
            profileImage: true,
          },
        },
        assigner: { select: { id: true, name: true } },
        revoker: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({ academicYear, cards })
  } catch (error) {
    console.error('List RFID cards error:', error)
    return internalError('loading RFID cards')
  }
}

// POST /api/school/rfid/cards
// Body: { studentId, uid, academicYear?, printNotes? }
// Behaviour:
//   - Normalizes UID and rejects invalid format up front
//   - Verifies student belongs to this school AND has an enrollment in the AY
//   - Rejects if (schoolId, academicYear, uid) already exists, with hint about
//     which student already owns the card
//   - Allows a student to hold multiple active cards in the same AY (spare card)
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'rfid:cards:manage')
    if (!user || !user.schoolId) {
      return user ? forbiddenError() : unauthorizedError()
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return apiError(400, 'Please provide card details.')
    }

    const studentId = typeof body.studentId === 'string' ? body.studentId : ''
    const rawUid = typeof body.uid === 'string' ? body.uid : ''
    const printNotes =
      typeof body.printNotes === 'string' && body.printNotes.trim().length > 0
        ? body.printNotes.trim().slice(0, 500)
        : null
    const academicYear = await resolveAcademicYear(
      user.schoolId,
      typeof body.academicYear === 'string' ? body.academicYear : null,
    )

    if (!studentId) return apiError(400, 'Please choose a student.')
    if (!academicYear) return apiError(400, 'Please choose a valid academic year.')

    const uid = normalizeUid(rawUid)
    if (!uid) {
      return apiError(
        400,
        'Card UID looks invalid. Tap the card again — it should be 8 to 20 hex characters.',
      )
    }

    // Tenant-scoped student lookup. Also verifies they have an enrollment or
    // admission for the AY the card is being issued for — issuing a card for
    // a student who isn't enrolled would silently fail every tap.
    const student = await db.student.findFirst({
      where: {
        id: studentId,
        schoolId: user.schoolId,
        deletedAt: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        academicEnrollments: {
          where: { academicYear, deletedAt: null },
          select: { id: true },
          take: 1,
        },
        admission: {
          where: { academicYear },
          select: { id: true },
        },
      },
    })

    if (!student) return notFoundError('Student')
    const enrolled =
      student.academicEnrollments.length > 0 || student.admission !== null
    if (!enrolled) {
      return apiError(
        422,
        `This student is not enrolled in ${academicYear}. Please complete their enrollment before issuing a card.`,
      )
    }

    // Conflict check: same UID already assigned to a (possibly different)
    // student in the same school + AY. Surface structured owner info so the
    // UI can render a prominent inline warning (not just a toast).
    const existing = await db.studentCard.findFirst({
      where: {
        schoolId: user.schoolId,
        academicYear,
        uid,
      },
      select: {
        id: true,
        isActive: true,
        assignedAt: true,
        revokedAt: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
          },
        },
      },
    })

    if (existing) {
      const ownerName = `${existing.student?.firstName ?? ''} ${existing.student?.lastName ?? ''}`.trim()
      const adm = existing.student?.admissionNumber
      const ownerLabel = adm ? `${ownerName} (${adm})` : ownerName || 'another student'
      const sameStudent = existing.student?.id === student.id
      const message = sameStudent
        ? existing.isActive
          ? `This student already has this card assigned for ${academicYear}.`
          : `This card was previously assigned to this student in ${academicYear} and revoked. Use a fresh blank card.`
        : existing.isActive
          ? `This card is already assigned to ${ownerLabel} for ${academicYear}.`
          : `This card was previously assigned to ${ownerLabel} in ${academicYear} and revoked. Use a fresh blank card.`
      return NextResponse.json(
        {
          message,
          code: 'card_already_assigned',
          conflict: {
            isActive: existing.isActive,
            sameStudent,
            assignedAt: existing.assignedAt,
            revokedAt: existing.revokedAt,
            academicYear,
            owner: existing.student
              ? {
                  id: existing.student.id,
                  firstName: existing.student.firstName,
                  lastName: existing.student.lastName,
                  admissionNumber: existing.student.admissionNumber,
                  className: existing.student.class?.name ?? null,
                  sectionName: existing.student.section?.name ?? null,
                }
              : null,
          },
        },
        { status: 409 },
      )
    }

    const card = await db.studentCard.create({
      data: {
        schoolId: user.schoolId,
        studentId: student.id,
        academicYear,
        uid,
        printNotes,
        assignedBy: user.userId,
      },
      select: {
        id: true,
        uid: true,
        academicYear: true,
        isActive: true,
        assignedAt: true,
        printNotes: true,
      },
    })

    return NextResponse.json({
      message: `Card assigned to ${student.firstName} ${student.lastName} for ${academicYear}.`,
      card,
    })
  } catch (error) {
    // P2002: unique constraint race — another assign for the same UID won.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return apiError(409, 'This card was just assigned by someone else. Please refresh.')
    }
    console.error('Assign RFID card error:', error)
    return internalError('assigning the RFID card')
  }
}
