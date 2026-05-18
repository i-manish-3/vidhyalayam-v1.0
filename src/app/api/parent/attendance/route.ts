import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'

// GET /api/parent/attendance - Get attendance for parent's children
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['PARENT'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') || ''
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    // Find parent record
    const parent = await db.parent.findFirst({
      where: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
      include: {
        children: {
          where: { student: { isActive: true } },
          select: { studentId: true },
        },
      },
    })

    if (!parent) {
      return NextResponse.json({ attendance: [], children: [] })
    }

    const childIds = parent.children.map(c => c.studentId)

    // If specific student requested, verify it belongs to this parent
    if (studentId && !childIds.includes(studentId)) {
      return unauthorizedError()
    }

    const targetStudentIds = studentId ? [studentId] : childIds

    // Build date range for the month
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0) // Last day of month

    const attendance = await db.attendance.findMany({
      where: {
        schoolId: user.schoolId,
        studentId: { in: targetStudentIds },
        date: { gte: startDate, lte: endDate },
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { date: 'asc' },
    })

    // Group by student
    const byStudent = attendance.reduce((acc, a) => {
      const key = a.studentId
      if (!acc[key]) {
        acc[key] = {
          studentId: a.studentId,
          studentName: `${a.student.firstName} ${a.student.lastName}`,
          records: [],
          summary: { total: 0, present: 0, absent: 0, late: 0, halfDay: 0 },
        }
      }
      acc[key].records.push({
        date: a.date,
        status: a.status,
        remarks: a.remarks,
      })
      acc[key].summary.total++
      if (a.status === 'present') acc[key].summary.present++
      else if (a.status === 'absent') acc[key].summary.absent++
      else if (a.status === 'late') acc[key].summary.late++
      else if (a.status === 'half_day') acc[key].summary.halfDay++
      return acc
    }, {} as Record<string, {
      studentId: string
      studentName: string
      records: Array<{ date: Date; status: string; remarks: string | null }>
      summary: { total: number; present: number; absent: number; late: number; halfDay: number }
    }>)

    // Add attendance percentage
    const result = Object.values(byStudent).map(s => ({
      ...s,
      summary: {
        ...s.summary,
        percentage: s.summary.total > 0 ? Math.round((s.summary.present / s.summary.total) * 100) : 0,
      },
    }))

    return NextResponse.json({ attendance: result })
  } catch (error) {
    console.error('Parent attendance error:', error)
    return internalError('loading attendance records')
  }
}
