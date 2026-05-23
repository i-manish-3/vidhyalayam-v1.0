// One-time backfill: ensure the `fees:change-group` permission exists in the
// Permission catalog, and is granted to every existing School via SchoolPermission
// so that School Admins of those schools can use the Change Fee Group feature.
//
// Idempotent: safe to re-run. Skips records that already exist.
// Run with: bun run scripts/backfill-fees-change-group-permission.ts

import { db } from '../src/lib/db'

async function main() {
  const code = 'fees:change-group'
  const name = 'Change Fee Group'
  const module = 'fees'
  const action = 'update'

  let permission = await db.permission.findUnique({ where: { code } })
  if (!permission) {
    permission = await db.permission.create({
      data: { code, name, module, action },
    })
    console.log(`Created permission ${code}`)
  } else {
    console.log(`Permission ${code} already exists`)
  }

  const schools = await db.school.findMany({ select: { id: true, name: true } })
  console.log(`Granting ${code} to ${schools.length} school(s)...`)

  const superAdmin = await db.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true },
  })
  if (!superAdmin) {
    throw new Error('No SUPER_ADMIN user found — cannot record grantedBy for SchoolPermission rows.')
  }

  let grantedCount = 0
  let skippedCount = 0

  for (const school of schools) {
    const existing = await db.schoolPermission.findFirst({
      where: { schoolId: school.id, permissionId: permission.id },
      select: { id: true },
    })
    if (existing) {
      skippedCount += 1
      continue
    }
    await db.schoolPermission.create({
      data: {
        schoolId: school.id,
        permissionId: permission.id,
        grantedBy: superAdmin.id,
      },
    })
    grantedCount += 1
    console.log(`  granted to ${school.name}`)
  }

  console.log(`Done. Granted ${grantedCount}, skipped ${skippedCount}.`)

  // Sync the "School Admin" role of each school so SCHOOL_ADMIN users pick it up.
  const adminRoles = await db.role.findMany({
    where: { name: 'School Admin', deletedAt: null },
    select: { id: true, schoolId: true, name: true },
  })

  let rolesUpdated = 0
  for (const role of adminRoles) {
    const existingRolePerm = await db.rolePermission.findFirst({
      where: { roleId: role.id, permissionId: permission.id },
      select: { id: true },
    })
    if (existingRolePerm) continue
    await db.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    })
    rolesUpdated += 1
  }
  console.log(`Linked permission to ${rolesUpdated} School Admin role(s).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
