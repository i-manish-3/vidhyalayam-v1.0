import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, forbiddenError, validationError } from '@/lib/api-errors'

// Alumni are derived (no dedicated flag): a student is alumni if they have
// passed out (admissionStatus='alumni' via the promote flow) OR they have any
// active withdrawal record (TC / dropout / transfer / completed / other). A
// reversed or soft-deleted withdrawal does NOT count, so reverting a withdrawal
// automatically removes the student from this directory.

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

// Maps the UI `type` filter to the withdrawal reason stored on StudentWithdrawal.
const REASON_BY_TYPE: Record<string, string> = {
  tc: 'TC',
  dropout: 'DROPOUT',
  transfer: 'TRANSFER',
  completed: 'COMPLETED',
  other: 'OTHER',
}

// An active (counts-as-alumni) withdrawal: not reversed, not soft-deleted.
// schoolId is set explicitly (defense-in-depth) even though the parent Student
// query is already tenant-scoped — StudentWithdrawal carries schoolId for this.
const activeWithdrawal = (schoolId: string, reason?: string) => ({
  some: {
    schoolId,
    deletedAt: null,
    reversedAt: null,
    ...(reason ? { reason } : {}),
  },
})

// GET /api/school/alumni - Read-only alumni directory (passout + withdrawals)
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SUPER_ADMIN' && user.role !== 'TEACHER') {
      const authorized = await requirePermission(request, 'student:read')
      if (!authorized) return forbiddenError("You don't have permission to view alumni.")
    }

    const { searchParams } = new URL(request.url)
    const search = (searchParams.get('search') || '').trim()
    const type = (searchParams.get('type') || 'all').toLowerCase()
    const classId = searchParams.get('classId') || ''
    const year = (searchParams.get('year') || '').trim()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT)) || DEFAULT_LIMIT)
    )
    const skip = (page - 1) * limit

    // Validate optional filters at the boundary before they reach Prisma.
    if (year && !ACADEMIC_YEAR_PATTERN.test(year)) {
      return validationError('Invalid academic year format (expected YYYY-YYYY).')
    }
    if (classId) {
      const cls = await db.class.findFirst({
        where: { id: classId, schoolId: user.schoolId, deletedAt: null },
        select: { id: true },
      })
      if (!cls) return validationError('Invalid class.')
    }

    // Base "is alumni" predicate, narrowed by the type filter.
    let alumniPredicate: Record<string, unknown>
    if (type === 'passout') {
      alumniPredicate = { admissionStatus: 'alumni' }
    } else if (REASON_BY_TYPE[type]) {
      alumniPredicate = { withdrawals: activeWithdrawal(user.schoolId, REASON_BY_TYPE[type]) }
    } else {
      // 'all' (default): passed out OR any active withdrawal.
      alumniPredicate = {
        OR: [{ admissionStatus: 'alumni' }, { withdrawals: activeWithdrawal(user.schoolId) }],
      }
    }

    const andFilters: Record<string, unknown>[] = [alumniPredicate]

    // classId filters on the student's last-known class (the "Last Class" column).
    if (classId) andFilters.push({ classId })

    if (year) {
      // Match on the student's enrollment history for the chosen session.
      andFilters.push({
        academicEnrollments: { some: { academicYear: year, deletedAt: null } },
      })
    }

    if (search) {
      const terms = search.split(/\s+/).filter(Boolean)
      const nameTermFilters = terms.map((term) => ({
        OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
        ],
      }))
      andFilters.push({
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          ...(nameTermFilters.length > 1 ? [{ AND: nameTermFilters }] : []),
          { rollNumber: { contains: search, mode: 'insensitive' } },
          { admissionNumber: { contains: search, mode: 'insensitive' } },
        ],
      })
    }

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
      AND: andFilters,
    }

    // School-wide stat counts (unaffected by the active filters) for the
    // overview cards. Counts are independent — a tiny passout/withdrawn overlap
    // is acceptable for display.
    const tenantScope = { schoolId: user.schoolId, deletedAt: null }
    const statTotalWhere = {
      ...tenantScope,
      OR: [{ admissionStatus: 'alumni' }, { withdrawals: activeWithdrawal(user.schoolId) }],
    }
    const statPassoutWhere = { ...tenantScope, admissionStatus: 'alumni' }
    const statWithdrawnWhere = { ...tenantScope, withdrawals: activeWithdrawal(user.schoolId) }

    const [students, total, statTotal, statPassout, statWithdrawn] = await Promise.all([
      db.student.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          rollNumber: true,
          gender: true,
          admissionStatus: true,
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          admission: { select: { profileImage: true } },
          parentLinks: {
            select: {
              parent: { select: { fatherName: true, motherName: true, phone: true } },
            },
          },
          // Latest active withdrawal (drives the leaving type/date/year).
          withdrawals: {
            where: { deletedAt: null, reversedAt: null },
            orderBy: { effectiveDate: 'desc' },
            take: 1,
            select: {
              reason: true,
              reasonNotes: true,
              effectiveDate: true,
              academicYear: true,
            },
          },
          // Last known enrollment (used as the passout batch year fallback).
          academicEnrollments: {
            where: { deletedAt: null },
            orderBy: { academicYear: 'desc' },
            take: 1,
            select: { academicYear: true },
          },
        },
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take: limit,
      }),
      db.student.count({ where }),
      db.student.count({ where: statTotalWhere }),
      db.student.count({ where: statPassoutWhere }),
      db.student.count({ where: statWithdrawnWhere }),
    ])

    const alumni = students.map((s) => {
      const withdrawal = s.withdrawals[0] || null
      const lastEnrollmentYear = s.academicEnrollments[0]?.academicYear || null
      const primaryParent = s.parentLinks[0]?.parent || null

      // Leaving classification: an active withdrawal wins; otherwise passout.
      const leavingType = withdrawal ? withdrawal.reason : 'PASSOUT'
      const leavingYear = withdrawal?.academicYear || lastEnrollmentYear
      const leavingDate = withdrawal?.effectiveDate || null

      return {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        name: `${s.firstName} ${s.lastName}`.trim(),
        admissionNumber: s.admissionNumber,
        rollNumber: s.rollNumber,
        gender: s.gender,
        admissionStatus: s.admissionStatus,
        profileImage: s.admission?.profileImage || null,
        className: s.class?.name || null,
        sectionName: s.section?.name || null,
        parentName: primaryParent?.fatherName || primaryParent?.motherName || null,
        parentPhone: primaryParent?.phone || null,
        leavingType,
        leavingYear,
        leavingDate,
        leavingNotes: withdrawal?.reasonNotes || null,
      }
    })

    return NextResponse.json({
      alumni,
      stats: {
        total: statTotal,
        passout: statPassout,
        withdrawn: statWithdrawn,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    })
  } catch (error) {
    console.error('GET /api/school/alumni error:', error)
    return internalError('Failed to load alumni.')
  }
}
