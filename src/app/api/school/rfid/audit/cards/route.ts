import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseLocalMidnight(v: string): Date | null {
  if (!DATE_PATTERN.test(v)) return null
  const [y, m, d] = v.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function csvEscape(v: string | null | undefined): string {
  if (v === null || v === undefined) return ''
  const str = String(v)
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

/**
 * GET /api/school/rfid/audit/cards
 *
 * Flat event stream derived from StudentCard rows:
 *   - one "issued" event per card (from assignedAt / assignedBy)
 *   - one "revoked" event per revoked card (from revokedAt / revokedBy)
 *
 * Filters:  academicYear, dateFrom, dateTo, action=issued|revoked, search
 * Output:   ?format=csv for CSV download (capped at 5000 rows)
 */
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()
    if (user.role !== 'SCHOOL_ADMIN') {
      const ok = await requirePermission(request, 'rfid:taps:view')
      if (!ok) return apiError(403, "You don't have permission to view the RFID audit log.")
    }

    const { searchParams } = new URL(request.url)
    const academicYear = searchParams.get('academicYear') || ''
    const dateFromStr = searchParams.get('dateFrom')
    const dateToStr = searchParams.get('dateTo')
    const actionFilter = searchParams.get('action') // 'issued' | 'revoked' | null
    const search = (searchParams.get('search') || '').trim().toLowerCase()
    const format = searchParams.get('format')
    const wantCsv = format === 'csv'
    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '100', 10) || 100, 500)
    const page = Math.max(Number.parseInt(searchParams.get('page') || '1', 10) || 1, 1)
    const skip = (page - 1) * limit

    const dateFrom = dateFromStr ? parseLocalMidnight(dateFromStr) : null
    const dateTo = dateToStr ? parseLocalMidnight(dateToStr) : null
    if (dateFromStr && !dateFrom) return apiError(400, 'Invalid dateFrom.')
    if (dateToStr && !dateTo) return apiError(400, 'Invalid dateTo.')
    // End-of-day inclusive
    if (dateTo) dateTo.setHours(23, 59, 59, 999)

    const where: Record<string, unknown> = { schoolId: user.schoolId }
    if (academicYear) {
      if (!ACADEMIC_YEAR_PATTERN.test(academicYear)) return apiError(400, 'Invalid academic year.')
      where.academicYear = academicYear
    }

    // Cap CSV at 5000 events; UI paginated at 100 by default
    const fetchLimit = wantCsv ? 5000 : limit
    const fetchSkip = wantCsv ? 0 : skip

    const cards = await db.studentCard.findMany({
      where,
      orderBy: [{ assignedAt: 'desc' }],
      take: fetchLimit,
      skip: fetchSkip,
      select: {
        id: true,
        uid: true,
        academicYear: true,
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
          },
        },
        assigner: { select: { id: true, name: true } },
        revoker: { select: { id: true, name: true } },
      },
    })

    // Flatten each card into 1 or 2 events
    interface Event {
      id: string
      cardId: string
      action: 'issued' | 'revoked'
      at: string
      uid: string
      academicYear: string
      student: {
        id: string
        firstName: string
        lastName: string
        admissionNumber: string | null
      }
      performedBy: string | null
      performedByName: string | null
      reason: string | null
      printNotes: string | null
    }
    const events: Event[] = []
    for (const c of cards) {
      events.push({
        id: `${c.id}:issued`,
        cardId: c.id,
        action: 'issued',
        at: c.assignedAt.toISOString(),
        uid: c.uid,
        academicYear: c.academicYear,
        student: c.student,
        performedBy: c.assignedBy,
        performedByName: c.assigner?.name ?? null,
        reason: null,
        printNotes: c.printNotes,
      })
      if (c.revokedAt) {
        events.push({
          id: `${c.id}:revoked`,
          cardId: c.id,
          action: 'revoked',
          at: c.revokedAt.toISOString(),
          uid: c.uid,
          academicYear: c.academicYear,
          student: c.student,
          performedBy: c.revokedBy,
          performedByName: c.revoker?.name ?? null,
          reason: c.revokeReason,
          printNotes: c.printNotes,
        })
      }
    }

    // Apply action / date / search filters on the flattened events
    const filtered = events.filter((e) => {
      if (actionFilter && actionFilter !== e.action) return false
      const at = new Date(e.at)
      if (dateFrom && at < dateFrom) return false
      if (dateTo && at > dateTo) return false
      if (search) {
        const name = `${e.student.firstName} ${e.student.lastName}`.toLowerCase()
        const adm = (e.student.admissionNumber || '').toLowerCase()
        const uid = e.uid.toLowerCase()
        if (!name.includes(search) && !adm.includes(search) && !uid.includes(search)) {
          return false
        }
      }
      return true
    })

    filtered.sort((a, b) => b.at.localeCompare(a.at))

    if (wantCsv) {
      const header = [
        'Timestamp',
        'Action',
        'UID',
        'Student',
        'Admission No',
        'Academic Year',
        'Performed By',
        'Reason',
        'Print Notes',
      ].map(csvEscape).join(',')

      const rows = filtered.map((e) =>
        [
          new Date(e.at).toLocaleString(),
          e.action,
          e.uid,
          `${e.student.firstName} ${e.student.lastName}`,
          e.student.admissionNumber || '',
          e.academicYear,
          e.performedByName || '',
          e.reason || '',
          e.printNotes || '',
        ].map(csvEscape).join(','),
      )

      const csv = [header, ...rows].join('\n')
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="rfid-card-audit-${Date.now()}.csv"`,
        },
      })
    }

    return NextResponse.json({
      events: filtered,
      page,
      limit,
      hasMore: cards.length === fetchLimit,
    })
  } catch (error) {
    console.error('RFID card audit error:', error)
    return internalError('loading the RFID card audit')
  }
}
