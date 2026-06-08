import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

type DbClient = typeof db | Prisma.TransactionClient
type SchoolRole = Awaited<ReturnType<typeof db.role.findFirstOrThrow>>

type RoleAssignableUser = {
  id: string
  name: string
  email?: string
  role: string
}

interface RoleTemplate {
  name: string
  description: string
  color: string
  isSystem: boolean
  permissionCodes: string[] | 'ALL_SCHOOL_PERMISSIONS'
}

const PRIMARY_ROLE_COMPATIBILITY: Record<string, string[]> = {
  'School Admin': ['SCHOOL_ADMIN'],
  Teacher: ['TEACHER'],
  Student: ['STUDENT'],
  Parent: ['PARENT'],
  Staff: [],
}

const STAFF_PERMISSION_ROLES = new Set([
  'Transport',
  'Hostel',
  'Accountant',
  'Sr. Accountant',
  'Librarian',
  'Office',
  'Controller',
  'Reception',
  'Security',
])

export function getCompatibleUserRolesForRoleName(roleName: string): string[] {
  const primaryRoleMatch = PRIMARY_ROLE_COMPATIBILITY[roleName]
  if (primaryRoleMatch) return primaryRoleMatch

  if (STAFF_PERMISSION_ROLES.has(roleName)) {
    return ['STAFF']
  }

  // Custom roles are operational permission groups, so keep them staff-only.
  return ['STAFF']
}

export function findIncompatibleRoleAssignment(
  users: RoleAssignableUser[],
  roles: { name: string }[]
) {
  for (const role of roles) {
    const compatibleUserRoles = getCompatibleUserRolesForRoleName(role.name)
    const incompatibleUser = users.find((targetUser) => !compatibleUserRoles.includes(targetUser.role))
    if (incompatibleUser) {
      return {
        user: incompatibleUser,
        roleName: role.name,
        compatibleUserRoles,
      }
    }
  }

  return null
}

export const DEFAULT_ROLE_TEMPLATES: RoleTemplate[] = [
  {
    name: 'School Admin',
    description: 'Full access to all modules enabled for this school',
    color: '#3b82f6',
    isSystem: true,
    permissionCodes: 'ALL_SCHOOL_PERMISSIONS',
  },
  {
    name: 'Teacher',
    description: 'Teaching staff with class, attendance, exam, and student access',
    color: '#0ea5e9',
    isSystem: true,
    permissionCodes: [
      'student:read',
      'attendance:read',
      'attendance:mark',
      'attendance:update',
      'timetable:read',
      'exam:read',
      'exam:update',
      'exam:results',
      'library:read',
      'salary:read',
      'notification:read',
      'class:read',
      'subject:read',
    ],
  },
  {
    name: 'Student',
    description: 'Students with access to their own academic information',
    color: '#14b8a6',
    isSystem: true,
    permissionCodes: ['attendance:read', 'fees:read', 'timetable:read', 'exam:read', 'library:read', 'notification:read'],
  },
  {
    name: 'Parent',
    description: 'Parents with access to their children information',
    color: '#f97316',
    isSystem: true,
    permissionCodes: ['student:read', 'attendance:read', 'fees:read', 'notification:read', 'exam:read'],
  },
  {
    name: 'Staff',
    description: 'General staff role with limited operational access',
    color: '#6b7280',
    isSystem: true,
    permissionCodes: [
      'student:read',
      'attendance:read',
      'fees:read',
      'fees:collect',
      'salary:read',
      'transport:read',
      'library:read',
      'inventory:read',
      'petty_cash:read',
      'notification:read',
      'announcement:read',
    ],
  },
  {
    name: 'Transport',
    description: 'Manages transport routes, drivers, and vehicle operations',
    color: '#06b6d4',
    isSystem: true,
    permissionCodes: ['transport:read', 'transport:create', 'transport:update'],
  },
  {
    name: 'Hostel',
    description: 'Manages hostels, rooms, beds, and student allocations',
    color: '#0ea5e9',
    isSystem: true,
    permissionCodes: ['hostel:read', 'hostel:create', 'hostel:update'],
  },
  {
    name: 'Accountant',
    description: 'Manages fee collections and financial records',
    color: '#10b981',
    isSystem: true,
    permissionCodes: ['fees:read', 'fees:collect', 'fees:create', 'fees:update'],
  },
  {
    name: 'Sr. Accountant',
    description: 'Senior accounting staff with broader financial access',
    color: '#059669',
    isSystem: true,
    permissionCodes: ['fees:read', 'fees:collect', 'fees:create', 'fees:update', 'fees:refund', 'salary:read', 'salary:pay'],
  },
  {
    name: 'Librarian',
    description: 'Manages library books and book issues',
    color: '#8b5cf6',
    isSystem: true,
    permissionCodes: ['library:read', 'library:create', 'library:update', 'library:issue'],
  },
  {
    name: 'Office',
    description: 'General office staff handling administrative tasks',
    color: '#6366f1',
    isSystem: true,
    permissionCodes: ['student:read', 'admission:read', 'admission:create', 'parent:read', 'notification:read'],
  },
  {
    name: 'Controller',
    description: 'Oversees operations and administrative control',
    color: '#ec4899',
    isSystem: true,
    permissionCodes: ['student:read', 'attendance:read', 'fees:read', 'transport:read', 'library:read', 'inventory:read'],
  },
  {
    name: 'Reception',
    description: 'Front desk and visitor management',
    color: '#f59e0b',
    isSystem: true,
    permissionCodes: ['student:read', 'admission:read', 'admission:create', 'parent:read'],
  },
  {
    name: 'Security',
    description: 'Campus security and access control',
    color: '#ef4444',
    isSystem: true,
    permissionCodes: ['student:read', 'attendance:read'],
  },
]

export async function getSchoolGrantedPermissionIds(schoolId: string, client: DbClient = db): Promise<Set<string>> {
  const schoolPermissions = await client.schoolPermission.findMany({
    where: { schoolId },
    select: { permissionId: true },
  })
  return new Set(schoolPermissions.map((permission) => permission.permissionId))
}

export async function validatePermissionsWithinSchoolGrant(
  schoolId: string,
  permissionIds: string[],
  client: DbClient = db
): Promise<string[]> {
  const grantedPermissionIds = await getSchoolGrantedPermissionIds(schoolId, client)
  return permissionIds.filter((permissionId) => !grantedPermissionIds.has(permissionId))
}

export async function ensureSchoolRole(
  schoolId: string,
  roleName: string,
  client: DbClient = db
) {
  const template = DEFAULT_ROLE_TEMPLATES.find((role) => role.name === roleName)

  return client.role.upsert({
    where: {
      schoolId_name: {
        schoolId,
        name: roleName,
      },
    },
    update: {
      deletedAt: null,
      isActive: true,
      ...(template
        ? {
            description: template.description,
            color: template.color,
            isSystem: template.isSystem,
          }
        : {}),
    },
    create: {
      schoolId,
      name: roleName,
      description: template?.description || null,
      color: template?.color || null,
      isSystem: template?.isSystem ?? true,
      isActive: true,
    },
  })
}

export async function provisionDefaultRolesForSchool(
  schoolId: string,
  client: DbClient = db
) {
  const schoolPermissions = await client.schoolPermission.findMany({
    where: { schoolId },
    include: { permission: { select: { id: true, code: true } } },
  })

  const grantedByCode = new Map(schoolPermissions.map((schoolPermission) => [
    schoolPermission.permission.code,
    schoolPermission.permission.id,
  ]))
  const allGrantedIds = schoolPermissions.map((schoolPermission) => schoolPermission.permissionId)

  const roles: SchoolRole[] = []

  for (const template of DEFAULT_ROLE_TEMPLATES) {
    const role = await ensureSchoolRole(schoolId, template.name, client)
    roles.push(role)

    const permissionIds = template.permissionCodes === 'ALL_SCHOOL_PERMISSIONS'
      ? allGrantedIds
      : template.permissionCodes
          .map((code) => grantedByCode.get(code))
          .filter((permissionId): permissionId is string => !!permissionId)

    await client.rolePermission.deleteMany({
      where: { roleId: role.id },
    })

    if (permissionIds.length > 0) {
      await client.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      })
    }
  }

  return roles
}

export async function syncSchoolAdminRoleWithSchoolPermissions(
  schoolId: string,
  client: DbClient = db
) {
  const schoolAdminRole = await ensureSchoolRole(schoolId, 'School Admin', client)
  const grantedPermissionIds = Array.from(await getSchoolGrantedPermissionIds(schoolId, client))

  await client.rolePermission.deleteMany({
    where: { roleId: schoolAdminRole.id },
  })

  if (grantedPermissionIds.length > 0) {
    await client.rolePermission.createMany({
      data: grantedPermissionIds.map((permissionId) => ({
        roleId: schoolAdminRole.id,
        permissionId,
      })),
      skipDuplicates: true,
    })
  }

  return schoolAdminRole
}

export async function assignUserToRoleByName(
  userId: string,
  schoolId: string,
  roleName: string,
  assignedBy: string,
  client: DbClient = db
) {
  const role = await ensureSchoolRole(schoolId, roleName, client)
  const targetUser = await client.user.findFirst({
    where: {
      id: userId,
      schoolId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  })

  if (!targetUser) {
    throw new Error('ROLE_ASSIGNMENT_USER_NOT_FOUND')
  }

  const incompatibleAssignment = findIncompatibleRoleAssignment([targetUser], [role])
  if (incompatibleAssignment) {
    throw new Error(`INCOMPATIBLE_ROLE_ASSIGNMENT:${incompatibleAssignment.user.name}:${incompatibleAssignment.user.role}:${incompatibleAssignment.roleName}`)
  }

  const template = DEFAULT_ROLE_TEMPLATES.find((defaultRole) => defaultRole.name === roleName)
  const existingPermissionCount = await client.rolePermission.count({
    where: { roleId: role.id },
  })
  if (template && existingPermissionCount === 0) {
    const schoolPermissions = await client.schoolPermission.findMany({
      where: { schoolId },
      include: { permission: { select: { id: true, code: true } } },
    })
    const grantedByCode = new Map(schoolPermissions.map((schoolPermission) => [
      schoolPermission.permission.code,
      schoolPermission.permission.id,
    ]))
    const permissionIds = template.permissionCodes === 'ALL_SCHOOL_PERMISSIONS'
      ? schoolPermissions.map((schoolPermission) => schoolPermission.permissionId)
      : template.permissionCodes
          .map((code) => grantedByCode.get(code))
          .filter((permissionId): permissionId is string => !!permissionId)

    if (permissionIds.length > 0) {
      await client.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      })
    }
  }

  await client.userRole.upsert({
    where: {
      userId_roleId: {
        userId,
        roleId: role.id,
      },
    },
    update: {
      assignedBy,
    },
    create: {
      userId,
      roleId: role.id,
      assignedBy,
    },
  })

  return role
}
