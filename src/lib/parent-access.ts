import { db } from '@/lib/db'

/**
 * Resolve the set of student IDs a parent user is allowed to see — the children
 * linked (via StudentParent) to any Parent record owned by this user in their
 * school. Returns a de-duplicated list; empty when the user has no linked
 * children. Used by every /api/parent/* endpoint to scope and ownership-check
 * access so a parent can never read another family's data.
 */
export async function getParentChildStudentIds(userId: string, schoolId: string): Promise<string[]> {
  const parents = await db.parent.findMany({
    where: { userId, schoolId, deletedAt: null },
    select: { id: true },
  })
  if (parents.length === 0) return []

  const links = await db.studentParent.findMany({
    where: { parentId: { in: parents.map((p) => p.id) } },
    select: { studentId: true },
  })
  return Array.from(new Set(links.map((l) => l.studentId)))
}
