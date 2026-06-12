import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'
import { computePercent } from '@/lib/attendance-report-utils'

// GET /api/student/attendance - Get attendance for the logged-in student
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['STUDENT'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    // Find student linked to this user
    // Currently Student model doesn't have userId, so we find by looking for a parent linked to this user
    // then get the student through parent
    const parent = await db.parent.findFirst({
      where: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
      include: {
        children: {
          where: { student: { isActive: true } },
          select: { studentId: true },
        },
      },
    })

    // For a student user, we look for the student directly
    // This is a placeholder - in a full system, Student would have a userId field
    const studentId = searchParams.get('studentId')

    if (!studentId) {
      // Try to find through parent linkage
      if (parent && parent.children.length > 0) {
        const targetId = parent.children[0].studentId
        return getAttendanceForStudent(user.schoolId, targetId, month, year)
      }
      return NextResponse.json({ attendance: [], summary: { total: 0, present: 0, absent: 0, late: 0, percentage: 0 } })
    }

    // Verify student belongs to this user's scope
    if (parent && !parent.children.some(c => c.studentId === studentId)) {
      return unauthorizedError()
    }

    return await getAttendanceForStudent(user.schoolId, studentId, month, year)
  } catch (error) {
    console.error('Student attendance error:', error)
    return internalError('loading your attendance')
  }
}

async function getAttendanceForStudent(schoolId: string, studentId: string, month: number, year: number) {
  const startDate = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0)
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const endDate = endOfMonth > today ? today : endOfMonth

  // Only finalized attendance is visible — un-finalized auto-default rows stay
  // hidden until the teacher finalizes. Denominator = finalized days only (no
  // implicit-absent), since finalize requires every student to be marked.
  const attendance = await db.attendance.findMany({
    where: {
      schoolId,
      studentId,
      date: { gte: startDate, lte: endDate },
      finalized: true,
    },
    orderBy: { date: 'asc' },
  })

  const present = attendance.filter(a => a.status === 'present').length
  const absent = attendance.filter(a => a.status === 'absent').length
  const leave = attendance.filter(a => a.status === 'leave').length
  const late = attendance.filter(a => a.status === 'late').length
  const halfDay = attendance.filter(a => a.status === 'half_day').length
  const finalizedDays = present + absent + leave + late + halfDay

  const summary = {
    total: finalizedDays,
    present,
    absent,
    leave,
    late,
    halfDay,
    percentage: Math.round(computePercent(present, finalizedDays)),
  }

  return NextResponse.json({
    attendance: attendance.map(a => ({
      date: a.date,
      status: a.status,
      remarks: a.remarks,
    })),
    summary,
  })
}
