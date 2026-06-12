import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const EXAM_PERMISSIONS = [
  { code: 'exam:view', name: 'View Exams', module: 'exams', action: 'read' },
  { code: 'exam:manage', name: 'Manage Exams', module: 'exams', action: 'update' },
  { code: 'exam:marks', name: 'Enter Marks', module: 'exams', action: 'update' },
  { code: 'exam:results', name: 'View & Compute Results', module: 'exams', action: 'read' },
  { code: 'exam:publish', name: 'Publish Results', module: 'exams', action: 'update' },
  { code: 'exam:audit', name: 'View Exam Audit', module: 'exams', action: 'read' },
]

const LEGACY_EXAM_PERMISSION_CODES = [
  'exam:read',
  'exam:create',
  'exam:update',
  'exam:delete',
  'exam:configure',
  'exam:schedule',
  'exam:marks:enter',
  'exam:marks:submit',
  'exam:marks:lock',
  'exam:marks:unlock',
  'exam:result:compute',
  'exam:result:publish',
  'exam:result:view',
  'exam:gradescale:manage',
  'exam:reportcard:manage',
  'exam:reportcard:download',
  'exam:admitcard:download',
  'exam:audit:view',
]

const TEACHER_PERMISSION_CODES = new Set(['exam:view', 'exam:marks'])

async function main() {
  const created: { code: string; id: string }[] = []
  for (const permission of EXAM_PERMISSIONS) {
    const rec = await db.permission.upsert({
      where: { code: permission.code },
      update: {
        name: permission.name,
        module: permission.module,
        action: permission.action,
        isActive: true,
      },
      create: { ...permission, isActive: true },
    })
    created.push({ code: rec.code, id: rec.id })
  }

  await db.permission.updateMany({
    where: { code: { in: LEGACY_EXAM_PERMISSION_CODES } },
    data: { isActive: false },
  })

  const schools = await db.school.findMany({ where: { deletedAt: null } })
  const someAdmin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN' } })
  const grantedBy = someAdmin?.id ?? 'system'

  for (const school of schools) {
    for (const permission of created) {
      await db.schoolPermission.upsert({
        where: { schoolId_permissionId: { schoolId: school.id, permissionId: permission.id } },
        update: {},
        create: { schoolId: school.id, permissionId: permission.id, grantedBy },
      })
    }

    const adminRole = await db.role.findFirst({
      where: { schoolId: school.id, name: 'School Admin', deletedAt: null },
    })
    if (adminRole) {
      for (const permission of created) {
        await db.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
          update: {},
          create: { roleId: adminRole.id, permissionId: permission.id },
        })
      }
    }

    const teacherRole = await db.role.findFirst({
      where: { schoolId: school.id, name: 'Teacher', deletedAt: null },
    })
    if (teacherRole) {
      for (const permission of created) {
        if (!TEACHER_PERMISSION_CODES.has(permission.code)) continue
        await db.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: teacherRole.id, permissionId: permission.id } },
          update: {},
          create: { roleId: teacherRole.id, permissionId: permission.id },
        })
      }
    }
  }

  console.log(`Upserted ${created.length} simple exam permissions and migrated ${schools.length} school(s).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
