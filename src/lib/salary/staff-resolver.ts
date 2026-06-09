/**
 * Polymorphic staff resolution for the salary/payroll module.
 *
 * Staff live in three separate tables (Teacher, Staff, Driver). Salary records
 * reference them via a (staffType, staffId) pair instead of a typed FK, so every
 * lookup branches on staffType. This module is the single source of truth for
 * that branching.
 */

import type { PrismaClient } from '@prisma/client'

export const STAFF_TYPES = ['teacher', 'staff', 'driver'] as const
export type StaffType = (typeof STAFF_TYPES)[number]

export function isStaffType(value: unknown): value is StaffType {
  return typeof value === 'string' && (STAFF_TYPES as readonly string[]).includes(value)
}

export interface ResolvedStaff {
  id: string
  staffType: StaffType
  firstName: string
  lastName: string
  fullName: string
  employeeId: string | null
  /** Human label for the staff's role: designation, "Teacher", or "Driver". */
  roleLabel: string
  department: string | null
  isActive: boolean
}

type Db = PrismaClient | any

const TEACHER_ROLE_LABEL = 'Teacher'
const DRIVER_ROLE_LABEL = 'Driver'

function toFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim()
}

/**
 * Resolve a single staff record across the three tables. Returns null if not
 * found in this school or soft-deleted.
 */
export async function resolveStaff(
  db: Db,
  schoolId: string,
  staffType: string,
  staffId: string
): Promise<ResolvedStaff | null> {
  if (!isStaffType(staffType) || !staffId) return null

  const baseWhere = { id: staffId, schoolId, deletedAt: null }

  if (staffType === 'teacher') {
    const t = await db.teacher.findFirst({
      where: baseWhere,
      select: { id: true, firstName: true, lastName: true, employeeId: true, isActive: true },
    })
    if (!t) return null
    return {
      id: t.id,
      staffType,
      firstName: t.firstName,
      lastName: t.lastName,
      fullName: toFullName(t.firstName, t.lastName),
      employeeId: t.employeeId ?? null,
      roleLabel: TEACHER_ROLE_LABEL,
      department: null,
      isActive: t.isActive,
    }
  }

  if (staffType === 'driver') {
    const d = await db.driver.findFirst({
      where: baseWhere,
      select: { id: true, firstName: true, lastName: true, employeeId: true, isActive: true },
    })
    if (!d) return null
    return {
      id: d.id,
      staffType,
      firstName: d.firstName,
      lastName: d.lastName,
      fullName: toFullName(d.firstName, d.lastName),
      employeeId: d.employeeId ?? null,
      roleLabel: DRIVER_ROLE_LABEL,
      department: null,
      isActive: d.isActive,
    }
  }

  // staff
  const s = await db.staff.findFirst({
    where: baseWhere,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeId: true,
      designation: true,
      department: true,
      isActive: true,
    },
  })
  if (!s) return null
  return {
    id: s.id,
    staffType,
    firstName: s.firstName,
    lastName: s.lastName,
    fullName: toFullName(s.firstName, s.lastName),
    employeeId: s.employeeId ?? null,
    roleLabel: s.designation || 'Staff',
    department: s.department ?? null,
    isActive: s.isActive,
  }
}

interface ListOptions {
  /** Restrict to a single staff type; omit/'all' for every type. */
  type?: string
  /** Case-insensitive match against name or employeeId. */
  search?: string
  /** When true, include inactive staff. Defaults to active only. */
  includeInactive?: boolean
}

/**
 * Unified, searchable list of payable staff across all three tables. Used by the
 * staff picker and the payroll-run generator.
 */
export async function listPayableStaff(
  db: Db,
  schoolId: string,
  options: ListOptions = {}
): Promise<ResolvedStaff[]> {
  const { type, search, includeInactive } = options
  const wantType = isStaffType(type) ? type : undefined

  const nameFilter = search
    ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { employeeId: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const baseWhere = {
    schoolId,
    deletedAt: null,
    ...(includeInactive ? {} : { isActive: true }),
    ...nameFilter,
  }

  const results: ResolvedStaff[] = []

  if (!wantType || wantType === 'teacher') {
    const teachers = await db.teacher.findMany({
      where: baseWhere,
      select: { id: true, firstName: true, lastName: true, employeeId: true, isActive: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })
    for (const t of teachers) {
      results.push({
        id: t.id,
        staffType: 'teacher',
        firstName: t.firstName,
        lastName: t.lastName,
        fullName: toFullName(t.firstName, t.lastName),
        employeeId: t.employeeId ?? null,
        roleLabel: TEACHER_ROLE_LABEL,
        department: null,
        isActive: t.isActive,
      })
    }
  }

  if (!wantType || wantType === 'staff') {
    const staff = await db.staff.findMany({
      where: baseWhere,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        designation: true,
        department: true,
        isActive: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })
    for (const s of staff) {
      results.push({
        id: s.id,
        staffType: 'staff',
        firstName: s.firstName,
        lastName: s.lastName,
        fullName: toFullName(s.firstName, s.lastName),
        employeeId: s.employeeId ?? null,
        roleLabel: s.designation || 'Staff',
        department: s.department ?? null,
        isActive: s.isActive,
      })
    }
  }

  if (!wantType || wantType === 'driver') {
    const drivers = await db.driver.findMany({
      where: baseWhere,
      select: { id: true, firstName: true, lastName: true, employeeId: true, isActive: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })
    for (const d of drivers) {
      results.push({
        id: d.id,
        staffType: 'driver',
        firstName: d.firstName,
        lastName: d.lastName,
        fullName: toFullName(d.firstName, d.lastName),
        employeeId: d.employeeId ?? null,
        roleLabel: DRIVER_ROLE_LABEL,
        department: null,
        isActive: d.isActive,
      })
    }
  }

  results.sort((a, b) => a.fullName.localeCompare(b.fullName))
  return results
}

export function staffKey(staffType: string, staffId: string): string {
  return `${staffType}:${staffId}`
}

/**
 * Batch-resolve many (staffType, staffId) refs in at most three queries (one per
 * table). Returns a Map keyed by `staffType:staffId`. Used by list endpoints to
 * avoid N+1 lookups. Includes soft-deleted/inactive staff so historical rows
 * still render a name.
 */
export async function resolveStaffMap(
  db: Db,
  schoolId: string,
  refs: Array<{ staffType: string; staffId: string }>
): Promise<Map<string, ResolvedStaff>> {
  const map = new Map<string, ResolvedStaff>()
  const idsByType: Record<StaffType, Set<string>> = {
    teacher: new Set(),
    staff: new Set(),
    driver: new Set(),
  }
  for (const ref of refs) {
    if (isStaffType(ref.staffType) && ref.staffId) idsByType[ref.staffType].add(ref.staffId)
  }

  if (idsByType.teacher.size > 0) {
    const rows = await db.teacher.findMany({
      where: { schoolId, id: { in: [...idsByType.teacher] } },
      select: { id: true, firstName: true, lastName: true, employeeId: true, isActive: true },
    })
    for (const t of rows) {
      map.set(staffKey('teacher', t.id), {
        id: t.id,
        staffType: 'teacher',
        firstName: t.firstName,
        lastName: t.lastName,
        fullName: toFullName(t.firstName, t.lastName),
        employeeId: t.employeeId ?? null,
        roleLabel: TEACHER_ROLE_LABEL,
        department: null,
        isActive: t.isActive,
      })
    }
  }

  if (idsByType.staff.size > 0) {
    const rows = await db.staff.findMany({
      where: { schoolId, id: { in: [...idsByType.staff] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        designation: true,
        department: true,
        isActive: true,
      },
    })
    for (const s of rows) {
      map.set(staffKey('staff', s.id), {
        id: s.id,
        staffType: 'staff',
        firstName: s.firstName,
        lastName: s.lastName,
        fullName: toFullName(s.firstName, s.lastName),
        employeeId: s.employeeId ?? null,
        roleLabel: s.designation || 'Staff',
        department: s.department ?? null,
        isActive: s.isActive,
      })
    }
  }

  if (idsByType.driver.size > 0) {
    const rows = await db.driver.findMany({
      where: { schoolId, id: { in: [...idsByType.driver] } },
      select: { id: true, firstName: true, lastName: true, employeeId: true, isActive: true },
    })
    for (const d of rows) {
      map.set(staffKey('driver', d.id), {
        id: d.id,
        staffType: 'driver',
        firstName: d.firstName,
        lastName: d.lastName,
        fullName: toFullName(d.firstName, d.lastName),
        employeeId: d.employeeId ?? null,
        roleLabel: DRIVER_ROLE_LABEL,
        department: null,
        isActive: d.isActive,
      })
    }
  }

  return map
}

/** Round money to 2 decimals, mirroring the fee module's roundMoney helper. */
export function salaryRound(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}
