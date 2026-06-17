import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { hasPermission } from '@/lib/api-auth'
import type { ChatTool, ChatContext, ToolResult } from '../types'

// Cap rows returned to keep the payload (and Claude's context) small.
const MAX_STUDENTS = 25

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * get_fee_dues — outstanding fee dues, aggregated per student.
 *
 * Scope rules (enforced server-side, never from the model):
 *  - schoolId is always the caller's school.
 *  - PARENT/STUDENT callers are hard-limited to their own ward student IDs.
 *  - school-wide callers must hold `fees:collect`.
 */
export const getFeeDuesTool: ChatTool = {
  name: 'get_fee_dues',
  description:
    "Get outstanding (unpaid) fee dues for students, aggregated per student. Use for questions like 'what are my child's pending fees', 'total dues this year', or 'which students owe fees'. Returns each student's total outstanding amount and a breakdown by fee head.",
  inputSchema: {
    type: 'object',
    properties: {
      studentName: {
        type: 'string',
        description: 'Optional. Filter to students whose name or admission number matches this text.',
      },
      academicYear: {
        type: 'string',
        description: "Optional academic year like '2025-2026'. Omit for all years.",
      },
    },
  },
  isAvailable: (user) => {
    if (user.role === 'PARENT' || user.role === 'STUDENT') return true
    return hasPermission(user, 'fees:collect')
  },
  handler: async (input, ctx: ChatContext): Promise<ToolResult> => {
    const studentName = typeof input.studentName === 'string' ? input.studentName.trim() : ''
    const academicYear = typeof input.academicYear === 'string' ? input.academicYear.trim() : ''

    // Ward scoping: guardians/students only ever see their own students.
    if (ctx.wardStudentIds !== null && ctx.wardStudentIds.length === 0) {
      return { ok: true, data: { students: [], note: 'No linked students found for this account.' } }
    }

    const where: Prisma.StudentFeeLedgerEntryWhereInput = {
      schoolId: ctx.schoolId,
      entryType: 'DEBIT',
      deletedAt: null,
      balanceAmount: { gt: 0 },
      ...(academicYear ? { academicYear } : {}),
      ...(ctx.wardStudentIds !== null ? { studentId: { in: ctx.wardStudentIds } } : {}),
      ...(studentName
        ? {
            student: {
              OR: [
                { firstName: { contains: studentName, mode: 'insensitive' } },
                { lastName: { contains: studentName, mode: 'insensitive' } },
                { admissionNumber: { contains: studentName, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    }

    const entries = await db.studentFeeLedgerEntry.findMany({
      where,
      select: {
        studentId: true,
        feeHeadName: true,
        balanceAmount: true,
        dueDate: true,
        academicYear: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNumber: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
      take: 500,
    })

    // Aggregate per student.
    const byStudent = new Map<string, {
      name: string
      admissionNumber: string | null
      className: string | null
      totalDue: number
      items: Array<{ feeHead: string; balance: number; dueDate: string | null; academicYear: string | null }>
    }>()

    for (const e of entries) {
      const key = e.studentId
      const name = `${e.student.firstName} ${e.student.lastName || ''}`.trim()
      const className = [e.student.class?.name, e.student.section?.name].filter(Boolean).join(' ') || null
      const existing = byStudent.get(key) || {
        name,
        admissionNumber: e.student.admissionNumber,
        className,
        totalDue: 0,
        items: [],
      }
      existing.totalDue = round2(existing.totalDue + e.balanceAmount)
      existing.items.push({
        feeHead: e.feeHeadName || 'Fee',
        balance: round2(e.balanceAmount),
        dueDate: e.dueDate ? e.dueDate.toISOString().slice(0, 10) : null,
        academicYear: e.academicYear,
      })
      byStudent.set(key, existing)
    }

    const students = Array.from(byStudent.values())
      .sort((a, b) => b.totalDue - a.totalDue)
      .slice(0, MAX_STUDENTS)

    const grandTotal = round2(Array.from(byStudent.values()).reduce((s, x) => s + x.totalDue, 0))

    return {
      ok: true,
      data: {
        studentsWithDues: byStudent.size,
        shown: students.length,
        grandTotalOutstanding: grandTotal,
        currency: 'INR',
        students,
      },
    }
  },
}
