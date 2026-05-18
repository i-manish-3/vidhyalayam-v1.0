import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'

// GET /api/super-admin/analytics - Platform-wide analytics
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) {
      return unauthorizedError()
    }

    const [
      totalSchools,
      activeSchools,
      trialSchools,
      suspendedSchools,
      totalStudents,
      totalTeachers,
      totalUsers,
      pendingSchools,
    ] = await Promise.all([
      db.school.count({ where: { deletedAt: null } }),
      db.school.count({ where: { status: 'active', deletedAt: null } }),
      db.school.count({ where: { status: 'trial', deletedAt: null } }),
      db.school.count({ where: { status: 'suspended', deletedAt: null } }),
      db.student.count({ where: { deletedAt: null } }),
      db.teacher.count({ where: { deletedAt: null } }),
      db.user.count({ where: { deletedAt: null } }),
      db.school.count({ where: { status: 'pending', deletedAt: null } }),
    ])

    return NextResponse.json({
      totalSchools,
      activeSchools,
      trialSchools,
      suspendedSchools,
      pendingSchools,
      totalStudents,
      totalTeachers,
      totalUsers,
    })
  } catch (error) {
    console.error('Analytics error:', error)
    return internalError('loading analytics')
  }
}
