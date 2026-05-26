import { NextRequest } from 'next/server'
import { verifyAccessToken, JWTPayload } from './auth'
import { ACCESS_COOKIE } from './cookies'
import { db } from '@/lib/db'

// Auth state lives in the HttpOnly `erp_access` cookie. JavaScript on the page
// can't read this cookie, so an XSS bug can't exfiltrate it the way it could
// have with localStorage. The browser attaches it automatically on every
// same-origin request as long as fetch uses `credentials: 'include'`.
export function getAuthUser(request: NextRequest): JWTPayload | null {
  const token = request.cookies.get(ACCESS_COOKIE)?.value
  if (!token) return null
  return verifyAccessToken(token)
}

export function getSchoolId(request: NextRequest): string | null {
  const user = getAuthUser(request)
  return user?.schoolId || null
}

export function requireAuth(request: NextRequest): JWTPayload | null {
  return getAuthUser(request)
}

export function requireRole(request: NextRequest, roles: string[]): JWTPayload | null {
  const user = getAuthUser(request)
  if (!user) return null
  if (!roles.includes(user.role)) return null
  return user
}

/**
 * Check if the authenticated user has a specific permission.
 * - SUPER_ADMIN: always has all permissions
 * - SCHOOL_ADMIN: check if the permission exists in SchoolPermission for their school
 * - Other roles: check via UserRole → RolePermission → Permission (purely role-based)
 * 
 * Returns the user payload if authorized, or null if not.
 */
export async function requirePermission(
  request: NextRequest,
  permissionCode: string
): Promise<JWTPayload | null> {
  const user = getAuthUser(request)
  if (!user) return null

  // SUPER_ADMIN always has all permissions
  if (user.role === 'SUPER_ADMIN') return user

  // For SCHOOL_ADMIN, check SchoolPermission table
  if (user.role === 'SCHOOL_ADMIN') {
    if (!user.schoolId) return null

    const schoolPerm = await db.schoolPermission.findFirst({
      where: {
        schoolId: user.schoolId,
        permission: { code: permissionCode, isActive: true },
      },
    })
    return schoolPerm ? user : null
  }

  // For other roles: purely role-based check via UserRole → RolePermission → Permission
  // When a user is assigned to a role, they automatically inherit ALL permissions from that role.
  const rolePermission = await db.userRole.findFirst({
    where: {
      userId: user.userId,
      role: {
        schoolId: user.schoolId,
        deletedAt: null,
        isActive: true,
        permissions: {
          some: {
            permission: { code: permissionCode, isActive: true },
          },
        },
      },
    },
  })
  if (rolePermission) return user

  return null
}

/**
 * Get all permission codes for a given user.
 * Used by the frontend to determine UI visibility.
 * - SUPER_ADMIN: returns ['*']
 * - SCHOOL_ADMIN: returns permissions from SchoolPermission for their school
 * - Others: collect ALL permission codes from the user's assigned roles (purely role-based)
 */
export async function getUserPermissions(userId: string, role: string, schoolId?: string): Promise<string[]> {
  // SUPER_ADMIN has all permissions
  if (role === 'SUPER_ADMIN') return ['*']

  // SCHOOL_ADMIN: get permissions from SchoolPermission
  if (role === 'SCHOOL_ADMIN' && schoolId) {
    const schoolPerms = await db.schoolPermission.findMany({
      where: { schoolId, permission: { isActive: true } },
      include: { permission: { select: { code: true } } },
    })
    return schoolPerms.map(sp => sp.permission.code)
  }

  // Other roles: collect ALL permission codes from assigned roles
  // Flow: User → UserRole → Role → RolePermission → Permission
  const userRoles = await db.userRole.findMany({
    where: {
      userId,
      role: {
        schoolId,
        deletedAt: null,
        isActive: true,
      },
    },
    include: {
      role: {
        include: {
          permissions: {
            where: {
              permission: { isActive: true },
            },
            include: {
              permission: { select: { code: true } },
            },
          },
        },
      },
    },
  })

  const permissionCodes = new Set<string>()
  for (const ur of userRoles) {
    for (const rp of ur.role.permissions) {
      permissionCodes.add(rp.permission.code)
    }
  }

  return Array.from(permissionCodes)
}
