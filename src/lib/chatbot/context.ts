import { db } from '@/lib/db'
import type { JWTPayload } from '@/lib/auth'
import type { ChatContext } from './types'

/**
 * Build the per-request ChatContext from the authenticated user. For guardians
 * (PARENT) and students this resolves the exact set of student IDs they are
 * allowed to see, so every tool can hard-scope its queries to those wards.
 */
export async function buildChatContext(user: JWTPayload): Promise<ChatContext> {
  const schoolId = user.schoolId || ''
  let wardStudentIds: string[] | null = null

  if (user.role === 'PARENT') {
    // user -> Parent(userId) -> StudentParent -> Student, all within this school.
    const parents = await db.parent.findMany({
      where: { userId: user.userId, schoolId, isActive: true },
      select: { children: { select: { studentId: true } } },
    })
    wardStudentIds = Array.from(
      new Set(parents.flatMap((p) => p.children.map((c) => c.studentId)))
    )
  } else if (user.role === 'STUDENT') {
    // Student self-service is not enabled yet (no direct Student→User link in the
    // schema). Scope to an empty set so no student data is ever returned.
    wardStudentIds = []
  }

  return {
    userId: user.userId,
    schoolId,
    role: user.role,
    email: user.email,
    wardStudentIds,
  }
}

/**
 * Returns true when a tool should scope its student query to specific wards.
 * (i.e. the user is a guardian/student, not a school-wide role.)
 */
export function isWardScoped(ctx: ChatContext): boolean {
  return ctx.wardStudentIds !== null
}
