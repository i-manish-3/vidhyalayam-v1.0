import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'
import { getHolidaysInRange, getSchoolWorkingDays, isDateOnHoliday } from '@/lib/academic-calendar'
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

    // Active children across ALL of this user's parent records. A parent with
    // multiple children often has one Parent row per child (same userId), so we
    // must union them — otherwise the second/third sibling 401s and logs the
    // user out.
    const links = await db.studentParent.findMany({
      where: {
        parent: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
        student: { isActive: true },
      },
      select: { studentId: true },
    })
    const childIds = Array.from(new Set(links.map((l) => l.studentId)))

    if (childIds.length === 0) {
      return NextResponse.json({ attendance: [], children: [] })
    }

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

    const [attendance, holidayRecords, workingDays] = await Promise.all([
      db.attendance.findMany({
        where: {
          schoolId: user.schoolId,
          studentId: { in: targetStudentIds },
          date: { gte: startDate, lte: endDate },
          // Only finalized attendance is visible to parents — un-finalized
          // auto-default rows stay hidden until the teacher finalizes the day.
          finalized: true,
        },
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { date: 'asc' },
      }),
      // Holidays span the FULL month (incl. upcoming days) so the calendar can
      // highlight them even before the month is over.
      academicYear ? getHolidaysInRange(user.schoolId, academicYear, startDate, endOfMonth) : Promise.resolve([]),
      getSchoolWorkingDays(user.schoolId),
    ])

    // Expand holiday ranges into per-day entries for easy calendar lookup.
    const holidays: Array<{ day: number; name: string; type: string }> = []
    const daysInMonth = endOfMonth.getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const h = isDateOnHoliday(new Date(year, month - 1, d), holidayRecords)
      if (h) holidays.push({ day: d, name: h.name, type: h.type })
    }

    // Group by student. Seed every requested student so a child with zero
    // marked records still surfaces (so absent count works as implicit).
    const byStudent = new Map<string, {
      studentId: string
      studentName: string
      records: Array<{ date: Date; day: number; status: string; remarks: string | null }>
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
        summary: { total: 0, present: 0, absent: 0, leave: 0, late: 0, halfDay: 0 },
      })
    }

    for (const a of attendance) {
      const entry = byStudent.get(a.studentId)
      if (!entry) continue
      entry.records.push({ date: a.date, day: a.date.getDate(), status: a.status, remarks: a.remarks })
      if (a.status === 'present') entry.summary.present++
      else if (a.status === 'absent') entry.summary.absent++
      else if (a.status === 'leave') entry.summary.leave++
      else if (a.status === 'late') entry.summary.late++
      else if (a.status === 'half_day') entry.summary.halfDay++
    }

    // Denominator = the student's FINALIZED days only (no implicit-absent for
    // un-finalized days). Finalize requires every student marked, so the marked
    // count is the true count of days attendance was actually taken & confirmed.
    const result = Array.from(byStudent.values()).map((s) => {
      const finalizedDays =
        s.summary.present + s.summary.absent + s.summary.leave + s.summary.late + s.summary.halfDay
      return {
        ...s,
        summary: {
          ...s.summary,
          total: finalizedDays,
          percentage: Math.round(computePercent(s.summary.present, finalizedDays)),
        },
      }
    })

    return NextResponse.json({ attendance: result, holidays, workingDays })
  } catch (error) {
    console.error('Parent attendance error:', error)
    return internalError('loading attendance records')
  }
}
