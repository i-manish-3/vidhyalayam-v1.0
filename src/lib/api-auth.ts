import { NextRequest } from 'next/server'
import { verifyAccessToken, JWTPayload } from './auth'
import { ACCESS_COOKIE } from './cookies'
import { db } from '@/lib/db'

export function getAuthUser(request: NextRequest): JWTPayload | null {
  const cookieToken = request.cookies.get(ACCESS_COOKIE)?.value
  const token = cookieToken ?? getBearerToken(request)
  if (!token) return null
  return verifyAccessToken(token)
}

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : null
}

const PERMISSION_ALIASES: Record<string, string[]> = {
  'exam:read': ['exam:view'],
  'exam:create': ['exam:manage'],
  'exam:update': ['exam:manage'],
  'exam:delete': ['exam:manage'],
  'exam:configure': ['exam:manage'],
  'exam:schedule': ['exam:manage'],
  'exam:gradescale:manage': ['exam:manage'],
  'exam:reportcard:manage': ['exam:manage'],
  'exam:admitcard:download': ['exam:view'],
  'exam:reportcard:download': ['exam:results'],
  'exam:marks:enter': ['exam:marks'],
  'exam:marks:submit': ['exam:marks'],
  'exam:marks:lock': ['exam:manage'],
  'exam:marks:unlock': ['exam:manage'],
  'exam:result:view': ['exam:results'],
  'exam:result:compute': ['exam:results'],
  'exam:result:publish': ['exam:publish'],
  'exam:audit:view': ['exam:audit'],
}

function expandPermissionCodes(permissionCode: string): string[] {
  return [permissionCode, ...(PERMISSION_ALIASES[permissionCode] ?? [])]
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
  if (user.role === 'SUPER_ADMIN') return user
  if (!roles.includes(user.role)) return null
  return user
}

export async function requirePermission(
  request: NextRequest,
  permissionCode: string,
): Promise<JWTPayload | null> {
  const user = getAuthUser(request)
  if (!user) return null
  return (await hasPermission(user, permissionCode)) ? user : null
}

export async function hasPermission(user: JWTPayload, permissionCode: string): Promise<boolean> {
  if (user.role === 'SUPER_ADMIN') return true
  const permissionCodes = expandPermissionCodes(permissionCode)

  if (user.role === 'SCHOOL_ADMIN') {
    if (!user.schoolId) return false

    const schoolPerm = await db.schoolPermission.findFirst({
      where: {
        schoolId: user.schoolId,
        permission: { code: { in: permissionCodes }, isActive: true },
      },
      select: { id: true },
    })
    return Boolean(schoolPerm)
  }

  const rolePermission = await db.userRole.findFirst({
    where: {
      userId: user.userId,
      role: {
        schoolId: user.schoolId,
        deletedAt: null,
        isActive: true,
        permissions: {
          some: {
            permission: { code: { in: permissionCodes }, isActive: true },
          },
        },
      },
    },
    select: { id: true },
  })

  return Boolean(rolePermission)
}

export async function requireAnyPermission(
  request: NextRequest,
  permissionCodes: string[],
): Promise<JWTPayload | null> {
  const user = getAuthUser(request)
  if (!user) return null

  for (const code of permissionCodes) {
    if (await hasPermission(user, code)) return user
  }

  return null
}

export async function getUserPermissions(userId: string, role: string, schoolId?: string): Promise<string[]> {
  if (role === 'SUPER_ADMIN') return ['*']

  if (role === 'SCHOOL_ADMIN' && schoolId) {
    const schoolPerms = await db.schoolPermission.findMany({
      where: { schoolId, permission: { isActive: true } },
      include: { permission: { select: { code: true } } },
    })
    return schoolPerms.map((sp) => sp.permission.code)
  }

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
  for (const userRole of userRoles) {
    for (const rolePermission of userRole.role.permissions) {
      permissionCodes.add(rolePermission.permission.code)
    }
  }

  return Array.from(permissionCodes)
}
