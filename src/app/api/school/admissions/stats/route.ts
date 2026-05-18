import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'

// GET /api/school/admissions/stats - Get admission statistics
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    // Check admission:read permission for non-SUPER_ADMIN
    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:read')
      if (!authorized) {
        return forbiddenError("You don't have access to the Admissions section. Please contact your school administrator.")
      }
    }

    const schoolId = user.schoolId
    const baseWhere = { schoolId, deletedAt: null }

    // Total applications
    const totalApplications = await db.admission.count({
      where: baseWhere,
    })

    // Status breakdown
    const statusCounts = await db.admission.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: { status: true },
    })

    const byStatus: Record<string, number> = {}
    const allStatuses = ['admitted', 'rejected']
    for (const status of allStatuses) {
      byStatus[status] = 0
    }
    for (const row of statusCounts) {
      byStatus[row.status] = row._count.status
    }

    // Class breakdown
    const classCounts = await db.admission.groupBy({
      by: ['classId'],
      where: { ...baseWhere, classId: { not: null } },
      _count: { classId: true },
    })

    // Fetch class names for the breakdown
    const classIds = classCounts
      .map((c) => c.classId)
      .filter((id): id is string => id !== null)

    const classes = await db.class.findMany({
      where: { id: { in: classIds } },
      select: { id: true, name: true },
    })

    const classMap = new Map(classes.map((c) => [c.id, c.name]))

    const byClass: Record<string, { className: string; count: number }> = {}
    for (const row of classCounts) {
      if (row.classId) {
        byClass[row.classId] = {
          className: classMap.get(row.classId) || 'Unknown',
          count: row._count.classId,
        }
      }
    }

    // Category breakdown
    const categoryCounts = await db.admission.groupBy({
      by: ['category'],
      where: { ...baseWhere, category: { not: null } },
      _count: { category: true },
    })

    const byCategory: Record<string, number> = {}
    for (const row of categoryCounts) {
      if (row.category) {
        byCategory[row.category] = row._count.category
      }
    }

    // This month's applications
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const thisMonthApplications = await db.admission.count({
      where: {
        ...baseWhere,
        appliedDate: {
          gte: startOfMonth,
        },
      },
    })

    // Gender breakdown
    const genderCounts = await db.admission.groupBy({
      by: ['gender'],
      where: { ...baseWhere, gender: { not: null } },
      _count: { gender: true },
    })

    const byGender: Record<string, number> = {}
    for (const row of genderCounts) {
      if (row.gender) {
        byGender[row.gender] = row._count.gender
      }
    }

    return NextResponse.json({
      totalApplications,
      byStatus,
      byClass,
      byCategory,
      byGender,
      thisMonthApplications,
    })
  } catch (error) {
    console.error('Get admission stats error:', error)
    return internalError('loading admission statistics')
  }
}
