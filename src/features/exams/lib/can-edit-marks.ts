/**
 * Marks-edit permission check. Framework-agnostic — takes resolved lookup
 * results, does NOT import Prisma. Callers run the DB queries inline and
 * pass the boolean outcomes.
 */

export interface EditScope {
  schoolId: string
  academicYear: string
  classId: string
  sectionId: string | null
  subjectId: string
}

export interface EditChecks {
  isSchoolAdmin: boolean
  isClassTeacher: boolean
  isSubjectTeacher: boolean
}

/**
 * Return true if the authenticated user can edit marks for the given
 * (class, section, subject) scope in a particular academic year.
 *
 * Rules (from plan § "Phase 3 — Validation logic"):
 * 1. SCHOOL_ADMIN — always allowed.
 * 2. Class teacher of the relevant section (via ClassTeacherAssignment).
 * 3. Subject teacher assigned via TeacherSubjectAssignment for the exact
 *    (class, section, subject) combo.
 */
export function canEditMarks(checks: EditChecks): boolean {
  return checks.isSchoolAdmin || checks.isClassTeacher || checks.isSubjectTeacher
}
