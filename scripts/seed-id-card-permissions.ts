import { PrismaClient } from '@prisma/client'

// One-shot upsert: adds the id-card permission catalog rows, grants them to
// every existing school, and links them to each school's "School Admin" role
// (system role). Idempotent — safe to re-run.
const db = new PrismaClient()

const ID_CARD_PERMISSIONS = [
  { code: 'idcard:read', name: 'View ID Card Module', module: 'idcards', action: 'read' },
  { code: 'idcard:template:create', name: 'Create ID Card Template', module: 'idcards', action: 'create' },
  { code: 'idcard:template:update', name: 'Edit ID Card Template', module: 'idcards', action: 'update' },
  { code: 'idcard:template:delete', name: 'Delete ID Card Template', module: 'idcards', action: 'delete' },
  { code: 'idcard:generate', name: 'Generate Student ID Cards', module: 'idcards', action: 'create' },
  { code: 'idcard:print', name: 'Print / Download ID Cards', module: 'idcards', action: 'read' },
]

async function main() {
  const created: { code: string; id: string }[] = []
  for (const p of ID_CARD_PERMISSIONS) {
    const rec = await db.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, module: p.module, action: p.action, isActive: true },
      create: { ...p, isActive: true },
    })
    created.push({ code: rec.code, id: rec.id })
  }
  console.log(`Upserted ${created.length} ID card permissions`)

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
    const schoolAdminRole = await db.role.findFirst({
      where: { schoolId: school.id, name: 'School Admin', deletedAt: null },
    })
    if (schoolAdminRole) {
      for (const perm of created) {
        await db.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: schoolAdminRole.id, permissionId: perm.id } },
          update: {},
          create: { roleId: schoolAdminRole.id, permissionId: perm.id },
        })
      }
    }
  }
  console.log('Granted ID card permissions to schools + their School Admin role')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
