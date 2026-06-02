import { PrismaClient } from '@prisma/client'

// One-shot upsert: adds the new exam:* permission catalog rows, grants them to
// every existing school via SchoolPermission, and links them to each school's
// "School Admin" role plus a sensible Teacher subset. Idempotent — safe to
// re-run on any dev DB that was seeded before the exam module landed.
//
// Mirrors scripts/seed-id-card-permissions.ts.
const db = new PrismaClient()

const EXAM_PERMISSIONS = [
  { code: 'exam:configure', name: 'Configure Exam Pattern', module: 'exams', action: 'update' },
  { code: 'exam:schedule', name: 'Manage Exam Schedule', module: 'exams', action: 'update' },
  { code: 'exam:marks:enter', name: 'Enter Marks', module: 'exams', action: 'create' },
  { code: 'exam:marks:submit', name: 'Submit Marks', module: 'exams', action: 'update' },
  { code: 'exam:marks:lock', name: 'Lock Marks', module: 'exams', action: 'update' },
  { code: 'exam:marks:unlock', name: 'Unlock Marks', module: 'exams', action: 'update' },
  { code: 'exam:result:compute', name: 'Compute Exam Results', module: 'exams', action: 'create' },
  { code: 'exam:result:publish', name: 'Publish Exam Results', module: 'exams', action: 'update' },
  { code: 'exam:result:view', name: 'View Exam Results', module: 'exams', action: 'read' },
  { code: 'exam:gradescale:manage', name: 'Manage Grade Scales', module: 'exams', action: 'update' },
  { code: 'exam:reportcard:manage', name: 'Manage Report Card Templates', module: 'exams', action: 'update' },
  { code: 'exam:reportcard:download', name: 'Download Report Cards', module: 'exams', action: 'read' },
  { code: 'exam:audit:view', name: 'View Exam Audit Log', module: 'exams', action: 'read' },
]

// Subset granted to Teacher role (everything else stays admin-only).
const TEACHER_PERMISSION_CODES = new Set([
  'exam:marks:enter',
  'exam:marks:submit',
  'exam:result:view',
])

async function main() {
  const created: { code: string; id: string }[] = []
  for (const p of EXAM_PERMISSIONS) {
    const rec = await db.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, module: p.module, action: p.action, isActive: true },
      create: { ...p, isActive: true },
    })
    created.push({ code: rec.code, id: rec.id })
  }
  console.log(`Upserted ${created.length} exam permissions`)

  const schools = await db.school.findMany({ where: { deletedAt: null } })
  console.log(`Found ${schools.length} schools`)

  const someAdmin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN' } })
  const grantedBy = someAdmin?.id ?? 'system'

  for (const school of schools) {
    for (const perm of created) {
      await db.schoolPermission.upsert({
        where: { schoolId_permissionId: { schoolId: school.id, permissionId: perm.id } },
        update: {},
        create: { schoolId: school.id, permissionId: perm.id, grantedBy },
      })
    }

    const adminRole = await db.role.findFirst({
      where: { schoolId: school.id, name: 'School Admin', deletedAt: null },
    })
    if (adminRole) {
      for (const perm of created) {
        await db.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
          update: {},
          create: { roleId: adminRole.id, permissionId: perm.id },
        })
      }
    }

    const teacherRole = await db.role.findFirst({
      where: { schoolId: school.id, name: 'Teacher', deletedAt: null },
    })
    if (teacherRole) {
      for (const perm of created) {
        if (!TEACHER_PERMISSION_CODES.has(perm.code)) continue
        await db.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: teacherRole.id, permissionId: perm.id } },
          update: {},
          create: { roleId: teacherRole.id, permissionId: perm.id },
        })
      }
    }
  }
  console.log('Granted exam permissions to schools + School Admin role; subset to Teacher role')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
