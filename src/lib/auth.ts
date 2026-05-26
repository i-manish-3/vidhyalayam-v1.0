import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { db } from '@/lib/db'

// JWT_SECRET MUST be set in the environment. We refuse to start without it so a
// missing/leaked default secret can never be used to forge tokens in production.
function loadJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET environment variable is required and must be at least 32 characters. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"',
    )
  }
  return secret
}
const JWT_SECRET = loadJwtSecret()

// bcrypt cost 12 is the current industry default — balances brute-force resistance
// against latency (~250ms per hash on modern hardware). Old hashes created at lower
// cost still verify fine because bcrypt encodes the cost inside the hash itself.
const BCRYPT_COST = 12

export interface JWTPayload {
  userId: string
  email: string
  role: string
  schoolId?: string
}

// Refresh token carries only the user id — role/schoolId are re-fetched from
// the DB on every refresh so changes (role updates, school reassignment) take
// effect at the next refresh instead of waiting for the 30-day window.
export interface RefreshPayload {
  userId: string
  type: 'refresh'
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST)
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  // Use sync version to avoid async scheduling issues in sandboxed environments
  return bcrypt.compareSync(password, hashedPassword)
}

// Access token: 15 min. Short enough that a stolen access cookie has limited
// blast radius; long enough that we don't hit the refresh endpoint on every
// click. Carried in HttpOnly cookie `erp_access`.
export function generateAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' })
}

// Refresh token: 30 days, but the server re-issues it on every refresh so an
// active user effectively has a sliding session. Carried in HttpOnly cookie
// `erp_refresh`. The `type: 'refresh'` discriminator prevents misuse — a
// refresh token replayed against a protected route fails verifyAccessToken,
// and an access token replayed against the refresh endpoint fails
// verifyRefreshToken.
export function generateRefreshToken(userId: string): string {
  return jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' })
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload & { type?: string }
    // Access tokens don't have a `type` claim. If we see `type: 'refresh'`
    // here, someone slid a refresh token into the access slot.
    if (payload.type === 'refresh') return null
    return payload
  } catch {
    return null
  }
}

export function verifyRefreshToken(token: string): RefreshPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as RefreshPayload
    if (payload.type !== 'refresh') return null
    return payload
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
