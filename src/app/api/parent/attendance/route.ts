import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'
import { getTeachingDays } from '@/lib/academic-calendar'
import { computePercent } from '@/lib/attendance-report-utils'

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
    if (targetStudentIds.length === 0) {
      return NextResponse.json({ attendance: [] })
    }

    const startDate = new Date(year, month - 1, 1)
    const endOfMonth = new Date(year, month, 0)
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    const endDate = endOfMonth > today ? today : endOfMonth

    const school = await db.school.findUnique({
      where: { id: user.schoolId },
      select: { academicYear: true },
    })
    const academicYear = school?.academicYear || ''

    const [attendance, teachingDays] = await Promise.all([
      db.attendance.findMany({
        where: {
          schoolId: user.schoolId,
          studentId: { in: targetStudentIds },
          date: { gte: startDate, lte: endDate },
        },
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { date: 'asc' },
      }),
      academicYear ? getTeachingDays(user.schoolId, academicYear, startDate, endDate) : Promise.resolve([]),
    ])

    const totalTeachingDays = teachingDays.length

    // Group by student. Seed every requested student so a child with zero
    // marked records still surfaces (so absent count works as implicit).
    const byStudent = new Map<string, {
      studentId: string
      studentName: string
      records: Array<{ date: Date; status: string; remarks: string | null }>
      summary: { total: number; present: number; absent: number; leave: number; late: number; halfDay: number }
    }>()

    const namesById = new Map<string, string>()
    for (const a of attendance) {
      namesById.set(a.studentId, `${a.student.firstName} ${a.student.lastName}`)
    }

    for (const sid of targetStudentIds) {
      byStudent.set(sid, {
        studentId: sid,
        studentName: namesById.get(sid) || '',
        records: [],
        summary: { total: totalTeachingDays, present: 0, absent: 0, leave: 0, late: 0, halfDay: 0 },
      })
    }

    for (const a of attendance) {
      const entry = byStudent.get(a.studentId)
      if (!entry) continue
      entry.records.push({ date: a.date, status: a.status, remarks: a.remarks })
      if (a.status === 'present') entry.summary.present++
      else if (a.status === 'absent') entry.summary.absent++
      else if (a.status === 'leave') entry.summary.leave++
      else if (a.status === 'late') entry.summary.late++
      else if (a.status === 'half_day') entry.summary.halfDay++
    }

    const result = Array.from(byStudent.values()).map((s) => {
      const markedDays = s.summary.present + s.summary.absent + s.summary.leave + s.summary.late + s.summary.halfDay
      const implicitAbsent = Math.max(0, totalTeachingDays - markedDays)
      const totalAbsent = s.summary.absent + implicitAbsent
      return {
        ...s,
        summary: {
          ...s.summary,
          absent: totalAbsent,
          percentage: Math.round(computePercent(s.summary.present, totalTeachingDays)),
        },
      }
    })

    return NextResponse.json({ attendance: result })
  } catch (error) {
    console.error('Parent attendance error:', error)
    return internalError('loading attendance records')
  }
}
