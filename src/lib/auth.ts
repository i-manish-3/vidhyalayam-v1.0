import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { db } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET || 'school-erp-super-secret-key-2025'

export interface JWTPayload {
  userId: string
  email: string
  role: string
  schoolId?: string
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 4)
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  // Use sync version to avoid async scheduling issues in sandboxed environments
  return bcrypt.compareSync(password, hashedPassword)
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
  } catch {
    return null
  }
}

export function canAccess(userRole: string, requiredRoles: string[]): boolean {
  return requiredRoles.includes(userRole)
}

// Role hierarchy for access control
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'], // All permissions
  SCHOOL_ADMIN: [
    'school:read', 'school:update',
    'student:*', 'teacher:*', 'parent:*',
    'attendance:*', 'fees:*', 'salary:*',
    'timetable:*', 'exam:*', 'transport:*',
    'library:*', 'inventory:*', 'petty_cash:*',
    'notification:*', 'announcement:*',
  ],
  TEACHER: [
    'school:read',
    'student:read', 'attendance:*',
    'timetable:read', 'exam:read', 'exam:update',
    'library:read', 'salary:read', 'notification:read',
    'advance:request',
  ],
  STUDENT: [
    'school:read',
    'attendance:read', 'fees:read', 'timetable:read',
    'exam:read', 'library:read', 'notification:read',
  ],
  PARENT: [
    'school:read',
    'student:read', 'attendance:read', 'fees:read',
    'notification:read', 'exam:read',
  ],
}

/**
 * Resolve a user's effective permissions from the database.
 * - SUPER_ADMIN: returns ['*'] (all permissions)
 * - SCHOOL_ADMIN: checks SchoolPermission for their school
 * - Others: union of RolePermissions (from UserRoles) + direct UserPermissions (granted=true),
 *   minus denied UserPermissions (granted=false)
 */
export async function getUserEffectivePermissions(
  userId: string,
  role: string,
  schoolId?: string
): Promise<string[]> {
  // SUPER_ADMIN has all permissions
  if (role === 'SUPER_ADMIN') return ['*']

  // SCHOOL_ADMIN: get permissions from SchoolPermission
  if (role === 'SCHOOL_ADMIN' && schoolId) {
    const schoolPerms = await db.schoolPermission.findMany({
      where: { schoolId },
      include: { permission: { select: { code: true } } },
    })
    return schoolPerms.map(sp => sp.permission.code)
  }

  // Other roles: resolve effective permissions

  // 1. Get all permission codes from assigned roles (UserRole → Role → RolePermission → Permission)
  const userRoles = await db.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: { select: { code: true } },
            },
          },
        },
      },
    },
  })

  const rolePermCodes = new Set<string>()
  for (const ur of userRoles) {
    for (const rp of ur.role.permissions) {
      rolePermCodes.add(rp.permission.code)
    }
  }

  // 2. Get direct user permissions (both grants and denies)
  const directPerms = await db.userPermission.findMany({
    where: { userId },
    include: { permission: { select: { code: true } } },
  })

  const grantedCodes = new Set<string>()
  const deniedCodes = new Set<string>()

  for (const dp of directPerms) {
    if (dp.granted) {
      grantedCodes.add(dp.permission.code)
    } else {
      deniedCodes.add(dp.permission.code)
    }
  }

  // 3. Union of role permissions + direct grants, minus direct denies
  const effectivePermissions = new Set<string>()
  for (const code of rolePermCodes) {
    if (!deniedCodes.has(code)) {
      effectivePermissions.add(code)
    }
  }
  for (const code of grantedCodes) {
    if (!deniedCodes.has(code)) {
      effectivePermissions.add(code)
    }
  }

  return Array.from(effectivePermissions)
}
