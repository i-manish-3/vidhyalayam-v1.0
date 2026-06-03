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

    const now = new Date()
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    // Growth window covers the current month plus the previous 11 — 12 buckets total
    const growthWindowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1)

    const [
      totalSchools,
      activeSchools,
      trialSchools,
      suspendedSchools,
      pendingSchools,
      totalStudents,
      totalTeachers,
      totalUsers,
      schoolsThisMonth,
      schoolsLastMonth,
      studentsThisMonth,
      studentsLastMonth,
      trialExpiringSoon,
      openTickets,
      newContactRequests,
      schoolsCreatedSinceWindow,
      recentTrialExpirySchools,
    ] = await Promise.all([
      db.school.count({ where: { deletedAt: null } }),
      db.school.count({ where: { status: 'active', deletedAt: null } }),
      db.school.count({ where: { status: 'trial', deletedAt: null } }),
      db.school.count({ where: { status: 'suspended', deletedAt: null } }),
      db.school.count({ where: { status: 'pending', deletedAt: null } }),
      db.student.count({ where: { deletedAt: null } }),
      db.teacher.count({ where: { deletedAt: null } }),
      db.user.count({ where: { deletedAt: null } }),
      db.school.count({
        where: { deletedAt: null, createdAt: { gte: startOfThisMonth, lt: startOfNextMonth } },
      }),
      db.school.count({
        where: { deletedAt: null, createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
      }),
      db.student.count({
        where: { deletedAt: null, createdAt: { gte: startOfThisMonth, lt: startOfNextMonth } },
      }),
      db.student.count({
        where: { deletedAt: null, createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
      }),
      db.school.count({
        where: {
          deletedAt: null,
          status: 'trial',
          trialEndsAt: { gte: now, lte: sevenDaysAhead },
        },
      }),
      db.supportTicket.count({ where: { status: { in: ['open', 'in_progress'] } } }),
      db.contactRequest.count({ where: { status: 'new' } }),
      db.school.findMany({
        where: { deletedAt: null, createdAt: { gte: growthWindowStart } },
        select: { createdAt: true },
      }),
      db.school.findMany({
        where: {
          deletedAt: null,
          status: 'trial',
          trialEndsAt: { gte: now, lte: sevenDaysAhead },
        },
        select: { id: true, name: true, trialEndsAt: true },
        orderBy: { trialEndsAt: 'asc' },
        take: 5,
      }),
    ])

    // Build 12-month growth buckets in chronological order
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const growthByMonth: { month: string; schools: number; key: string }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      growthByMonth.push({
        month: monthLabels[d.getMonth()],
        key: `${d.getFullYear()}-${d.getMonth()}`,
        schools: 0,
      })
    }
    for (const s of schoolsCreatedSinceWindow) {
      const d = new Date(s.createdAt)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const bucket = growthByMonth.find((b) => b.key === key)
      if (bucket) bucket.schools += 1
    }

    // Month-over-month deltas
    const pctChange = (curr: number, prev: number): number => {
      if (prev === 0) return curr > 0 ? 100 : 0
      return Math.round(((curr - prev) / prev) * 100)
    }

    return NextResponse.json({
      totalSchools,
      activeSchools,
      trialSchools,
      suspendedSchools,
      pendingSchools,
      totalStudents,
      totalTeachers,
      totalUsers,
      // New: MoM signals
      schoolsThisMonth,
      schoolsLastMonth,
      studentsThisMonth,
      studentsLastMonth,
      schoolsTrend: pctChange(schoolsThisMonth, schoolsLastMonth),
      studentsTrend: pctChange(studentsThisMonth, studentsLastMonth),
      // New: action items
      trialExpiringSoon,
      openTickets,
      newContactRequests,
      // New: chart data
      growthByMonth: growthByMonth.map(({ month, schools }) => ({ month, schools })),
      statusBreakdown: [
        { name: 'Active', value: activeSchools },
        { name: 'Trial', value: trialSchools },
        { name: 'Pending', value: pendingSchools },
        { name: 'Suspended', value: suspendedSchools },
      ],
      // New: trial expiry list
      trialExpiryList: recentTrialExpirySchools.map((s) => ({
        id: s.id,
        name: s.name,
        trialEndsAt: s.trialEndsAt,
      })),
    })
  } catch (error) {
    console.error('Analytics error:', error)
    return internalError('loading analytics')
  }
}
