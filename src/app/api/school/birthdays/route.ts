import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, hasPermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

type AuthUser = NonNullable<ReturnType<typeof getAuthUser>>

async function hasAnyPermission(user: AuthUser, codes: string[]) {
  const checks = await Promise.all(codes.map((code) => hasPermission(user, code)))
  return checks.some(Boolean)
}

function monthDay(d: Date): { month: number; day: number } {
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

function isInWindow(
  dob: Date,
  today: Date,
  windowEnd: Date,
): { ageTurning: number } | null {
  const dobMD = monthDay(dob)
  const thisYear = today.getUTCFullYear()
  const thisYearCandidate = new Date(Date.UTC(thisYear, dobMD.month - 1, dobMD.day))
  if (thisYearCandidate >= today && thisYearCandidate <= windowEnd) {
    return { ageTurning: Math.max(0, thisYear - dob.getUTCFullYear()) }
  }
  const nextYear = thisYear + 1
  const nextYearCandidate = new Date(Date.UTC(nextYear, dobMD.month - 1, dobMD.day))
  if (nextYearCandidate <= windowEnd) {
    return { ageTurning: Math.max(0, nextYear - dob.getUTCFullYear()) }
  }
  return null
}

// GET /api/school/birthdays?days=14
// Upcoming birthdays (today → +days) across active students, teachers, and staff.
export async function GET(request: NextRequest) {
  try {
    const user = getAuthUser(request)
    if (!user || !user.schoolId) return unauthorizedError()

    if (!(await hasAnyPermission(user, ['student:read', 'teacher:read']))) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '14', 10) || 14, 1), 60)

    const now = new Date()
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const windowEnd = new Date(today.getTime() + days * 24 * 60 * 60 * 1000)

    const schoolId = user.schoolId

    const [students, teachers, staffMembers] = await Promise.all([
      db.student.findMany({
        where: {
          schoolId,
          deletedAt: null,
          isActive: true,
          admissionStatus: 'admitted',
          dateOfBirth: { not: null },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          profileImage: true,
          class: { select: { name: true } },
          section: { select: { name: true } },
        },
      }),
      db.teacher.findMany({
        where: {
          schoolId,
          deletedAt: null,
          isActive: true,
          dateOfBirth: { not: null },
        },
        select: { id: true, firstName: true, lastName: true, dateOfBirth: true, profileImage: true },
      }),
      db.staff.findMany({
        where: {
          schoolId,
          deletedAt: null,
          isActive: true,
          dateOfBirth: { not: null },
        },
        select: { id: true, firstName: true, lastName: true, dateOfBirth: true, profileImage: true, designation: true },
      }),
    ])

    interface RawBirthday {
      id: string
      type: 'student' | 'teacher' | 'staff'
      firstName: string
      lastName: string | null
      dateOfBirth: Date
      profileImage: string | null
      label: string | null
    }

    const raw: RawBirthday[] = [
      ...students.map((s) => ({
        id: s.id,
        type: 'student' as const,
        firstName: s.firstName,
        lastName: s.lastName,
        dateOfBirth: s.dateOfBirth as Date,
        profileImage: s.profileImage,
        label: [s.class?.name, s.section?.name].filter(Boolean).join('-') || null,
      })),
      ...teachers.map((t) => ({
        id: t.id,
        type: 'teacher' as const,
        firstName: t.firstName,
        lastName: t.lastName,
        dateOfBirth: t.dateOfBirth as Date,
        profileImage: t.profileImage,
        label: 'Teacher',
      })),
      ...staffMembers.map((st) => ({
        id: st.id,
        type: 'staff' as const,
        firstName: st.firstName,
        lastName: st.lastName,
        dateOfBirth: st.dateOfBirth as Date,
        profileImage: st.profileImage,
        label: st.designation || 'Staff',
      })),
    ]

    const birthdays = raw
      .map((b) => {
        const win = isInWindow(b.dateOfBirth, today, windowEnd)
        if (!win) return null
        return {
          id: b.id,
          type: b.type,
          name: `${b.firstName} ${b.lastName ?? ''}`.trim(),
          firstName: b.firstName,
          lastName: b.lastName,
          dob: b.dateOfBirth.toISOString(),
          month: b.dateOfBirth.getUTCMonth() + 1,
          day: b.dateOfBirth.getUTCDate(),
          ageTurning: win.ageTurning,
          profileImage: b.profileImage,
          label: b.label,
        }
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .sort((a, b) => a.month - b.month || a.day - b.day || a.name.localeCompare(b.name))

    return Response.json({ birthdays, rangeDays: days, date: today.toISOString() })
  } catch (err) {
    console.error('[birthdays]', err)
    return internalError('Could not load birthdays')
  }
}