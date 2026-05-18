import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/period-config - Get period configuration for the school
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF', 'STUDENT'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    let configs = await db.periodConfig.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { period: 'asc' },
    })

    // If no config exists, return default 10 periods
    if (configs.length === 0) {
      const defaults = [
        { period: 1, startTime: '08:00', endTime: '08:40', label: 'Period 1', isBreak: false },
        { period: 2, startTime: '08:40', endTime: '09:20', label: 'Period 2', isBreak: false },
        { period: 3, startTime: '09:20', endTime: '10:00', label: 'Period 3', isBreak: false },
        { period: 4, startTime: '10:00', endTime: '10:20', label: 'Break', isBreak: true },
        { period: 5, startTime: '10:20', endTime: '11:00', label: 'Period 4', isBreak: false },
        { period: 6, startTime: '11:00', endTime: '11:40', label: 'Period 5', isBreak: false },
        { period: 7, startTime: '11:40', endTime: '12:20', label: 'Period 6', isBreak: false },
        { period: 8, startTime: '12:20', endTime: '12:50', label: 'Lunch', isBreak: true },
        { period: 9, startTime: '12:50', endTime: '13:30', label: 'Period 7', isBreak: false },
        { period: 10, startTime: '13:30', endTime: '14:10', label: 'Period 8', isBreak: false },
      ]

      configs = await Promise.all(
        defaults.map(d =>
          db.periodConfig.create({
            data: { schoolId: user.schoolId, ...d },
          })
        )
      )
    }

    return NextResponse.json({ periods: configs })
  } catch (error) {
    console.error('Get period config error:', error)
    return internalError('loading period configuration')
  }
}

// PUT /api/school/period-config - Update period configuration
export async function PUT(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { periods } = body as {
      periods: { period: number; startTime: string; endTime: string; label: string; isBreak: boolean }[]
    }

    if (!periods || !Array.isArray(periods) || periods.length === 0) {
      return apiError(400, 'Please provide at least one period configuration.')
    }

    // Delete existing and recreate
    await db.periodConfig.deleteMany({ where: { schoolId: user.schoolId } })

    const configs = await Promise.all(
      periods.map(p =>
        db.periodConfig.create({
          data: {
            schoolId: user.schoolId,
            period: p.period,
            startTime: p.startTime,
            endTime: p.endTime,
            label: p.label || `Period ${p.period}`,
            isBreak: p.isBreak || false,
          },
        })
      )
    )

    return NextResponse.json({ periods: configs })
  } catch (error) {
    console.error('Update period config error:', error)
    return internalError('updating period configuration')
  }
}
