import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { internalError, apiError, notFoundError } from '@/lib/api-errors'

/**
 * GET /api/school/exams/[id]/reports/class-summary
 *
 * Returns one row per (class, section): total, pass, fail, partial, absent,
 * average %, highest %, lowest %. Used by the reports dashboard.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:result:view')
    if (!user || !user.schoolId) return apiError(403, "You don't have permission to view reports.")
    const { id: examId } = await params

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, name: true, academicYear: true },
    })
    if (!exam) return notFoundError('Exam')

    const results = await db.examResult.findMany({
      where: { examId, schoolId: user.schoolId, deletedAt: null },
      include: {
        student: {
          select: { classId: true, sectionId: true },
        },
      },
    })

    // Group by (classId, sectionId). null sectionId becomes its own bucket so
    // it's visible to the admin (rather than silently rolled into the class).
    const groups = new Map<
      string,
      {
        classId: string
        sectionId: string | null
        total: number
        pass: number
        fail: number
        partial: number
        absent: number
        sumPct: number
        highest: number
        lowest: number
      }
    >()

    for (const r of results) {
      const classId = r.student.classId ?? ''
      const sectionId = r.student.sectionId
      const key = `${classId}::${sectionId ?? ''}`
      const cur = groups.get(key) ?? {
        classId,
        sectionId,
        total: 0,
        pass: 0,
        fail: 0,
        partial: 0,
        absent: 0,
        sumPct: 0,
        highest: -Infinity,
        lowest: Infinity,
      }
      cur.total += 1
      if (r.status === 'pass') cur.pass += 1
      else if (r.status === 'fail') cur.fail += 1
      else if (r.status === 'partial') cur.partial += 1
      else if (r.status === 'absent') cur.absent += 1
      if (r.status !== 'absent') {
        cur.sumPct += r.percentage
        if (r.percentage > cur.highest) cur.highest = r.percentage
        if (r.percentage < cur.lowest) cur.lowest = r.percentage
      }
      groups.set(key, cur)
    }

    const classIds = Array.from(new Set(Array.from(groups.values()).map((g) => g.classId).filter(Boolean)))
    const sectionIds = Array.from(
      new Set(Array.from(groups.values()).map((g) => g.sectionId).filter((s): s is string => !!s)),
    )
    const [classes, sections] = await Promise.all([
      db.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }),
      db.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true } }),
    ])
    const classMap = new Map(classes.map((c) => [c.id, c.name]))
    const sectionMap = new Map(sections.map((s) => [s.id, s.name]))

    const rows = Array.from(groups.values())
      .map((g) => {
        const scored = g.total - g.absent
        return {
          classId: g.classId,
          className: classMap.get(g.classId) ?? '(unknown)',
          sectionId: g.sectionId,
          sectionName: g.sectionId ? sectionMap.get(g.sectionId) ?? '(unknown)' : null,
          total: g.total,
          pass: g.pass,
          fail: g.fail,
          partial: g.partial,
          absent: g.absent,
          averagePercentage: scored > 0 ? Math.round((g.sumPct / scored) * 100) / 100 : 0,
          highestPercentage: g.highest === -Infinity ? 0 : Math.round(g.highest * 100) / 100,
          lowestPercentage: g.lowest === Infinity ? 0 : Math.round(g.lowest * 100) / 100,
          passRate: g.total > 0 ? Math.round((g.pass / g.total) * 10000) / 100 : 0,
        }
      })
      .sort((a, b) => {
        const c = a.className.localeCompare(b.className)
        if (c !== 0) return c
        return (a.sectionName ?? '').localeCompare(b.sectionName ?? '')
      })

    return NextResponse.json({ exam, rows })
  } catch (error) {
    console.error('Class summary report error:', error)
    return internalError('building the class summary')
  }
}
