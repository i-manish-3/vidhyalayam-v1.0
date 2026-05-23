import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'

// GET /api/school/dashboard/birthdays — today's birthdays for students,
// teachers, and other school staff (drivers, office staff, librarians, …).
// Parents are intentionally excluded (the Parent model has no DOB column).
//
// Source split:
//   • Students  ← Student table (dateOfBirth)
//   • Teachers  ← Teacher table (dateOfBirth)
//   • Staff     ← User table (dob), role in {STAFF, SCHOOL_ADMIN}, with
//                 their school-defined Role.name (e.g. "Transport",
//                 "Library Staff") used as the label when present.

interface BirthdayPerson {
  id: string
  name: string
  type: 'student' | 'teacher' | 'staff'
  profileImage: string | null
  age: number | null
  className: string | null
  roleName: string | null
}

function matchesToday(dob: Date | null, month: number, day: number): boolean {
  if (!dob) return false
  return dob.getMonth() + 1 === month && dob.getDate() === day
}

export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    const schoolId = user.schoolId
    const today = new Date()
    const month = today.getMonth() + 1
    const day = today.getDate()
    const year = today.getFullYear()

    const [students, teachers, staffUsers] = await Promise.all([
      db.student.findMany({
        where: { schoolId, deletedAt: null, isActive: true, dateOfBirth: { not: null } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profileImage: true,
          dateOfBirth: true,
          class: { select: { name: true } },
        },
      }),
      db.teacher.findMany({
        where: { schoolId, deletedAt: null, isActive: true, dateOfBirth: { not: null } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profileImage: true,
          dateOfBirth: true,
        },
      }),
      db.user.findMany({
        where: {
          schoolId,
          deletedAt: null,
          isActive: true,
          dob: { not: null },
          // STAFF covers drivers, librarians, office staff, etc. SCHOOL_ADMIN
          // covers the school's primary admin user. Teachers/students/parents
          // are intentionally excluded — teachers come from db.teacher above
          // and parents have no DOB.
          role: { in: ['STAFF', 'SCHOOL_ADMIN'] },
        },
        select: {
          id: true,
          name: true,
          avatar: true,
          dob: true,
          role: true,
          userRoles: {
            select: { role: { select: { name: true } } },
            take: 1,
          },
        },
      }),
    ])

    const studentBirthdays: BirthdayPerson[] = students
      .filter((s) => matchesToday(s.dateOfBirth, month, day))
      .map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        type: 'student',
        profileImage: s.profileImage,
        age: s.dateOfBirth ? year - s.dateOfBirth.getFullYear() : null,
        className: s.class?.name ?? null,
        roleName: null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const teacherBirthdays: BirthdayPerson[] = teachers
      .filter((t) => matchesToday(t.dateOfBirth, month, day))
      .map((t) => ({
        id: t.id,
        name: `${t.firstName} ${t.lastName}`.trim(),
        type: 'teacher',
        profileImage: t.profileImage,
        age: t.dateOfBirth ? year - t.dateOfBirth.getFullYear() : null,
        className: null,
        roleName: null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const staffBirthdays: BirthdayPerson[] = staffUsers
      .filter((u) => matchesToday(u.dob, month, day))
      .map((u) => ({
        id: u.id,
        name: u.name,
        type: 'staff',
        profileImage: u.avatar,
        age: u.dob ? year - u.dob.getFullYear() : null,
        className: null,
        roleName:
          u.userRoles[0]?.role?.name ||
          (u.role === 'SCHOOL_ADMIN' ? 'Admin' : 'Staff'),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({
      students: studentBirthdays,
      teachers: teacherBirthdays,
      staff: staffBirthdays,
      total:
        studentBirthdays.length + teacherBirthdays.length + staffBirthdays.length,
    })
  } catch (error) {
    console.error('Birthdays error:', error)
    return internalError('loading birthdays')
  }
}
