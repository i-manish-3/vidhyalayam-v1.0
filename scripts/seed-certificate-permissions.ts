import { PrismaClient } from '@prisma/client'

// One-shot upsert: adds the certificate permission catalog rows, grants them
// to every existing school, and links them to each school's "School Admin"
// role (system role). Idempotent — safe to re-run. Mirrors
// scripts/seed-id-card-permissions.ts.
const db = new PrismaClient()

const CERTIFICATE_PERMISSIONS = [
  { code: 'certificate:read', name: 'View Certificates Module', module: 'certificates', action: 'read' },
  { code: 'certificate:issue', name: 'Issue Certificates', module: 'certificates', action: 'create' },
  { code: 'certificate:void', name: 'Void Certificates', module: 'certificates', action: 'update' },
  { code: 'certificate:template:manage', name: 'Manage Certificate Templates', module: 'certificates', action: 'update' },
]

async function main() {
  const created: { code: string; id: string }[] = []
  for (const p of CERTIFICATE_PERMISSIONS) {
    const rec = await db.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, module: p.module, action: p.action, isActive: true },
      create: { ...p, isActive: true },
    })
    created.push({ code: rec.code, id: rec.id })
  }
  console.log(`Upserted ${created.length} certificate permissions`)

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
  console.log('Granted certificate permissions to schools + their School Admin role')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })