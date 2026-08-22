/**
 * One-time script to ensure the `attendance:staff` permission is assigned
 * to every school that already has any attendance permissions.
 *
 * Run with:  npx tsx scripts/fix-attendance-staff-perm.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // 1. Find the attendance:staff permission in the global Permission table
  let staffPerm = await db.permission.findFirst({
    where: { code: 'attendance:staff', isActive: true },
  })

  // If it doesn't exist at all, create it
  if (!staffPerm) {
    staffPerm = await db.permission.create({
      data: {
        code: 'attendance:staff',
        name: 'Employee Attendance',
        module: 'attendance',
        action: 'create',
        isActive: true,
      },
    })
    console.log('✅ Created global permission: attendance:staff')
  } else {
    console.log(`✅ Global permission exists: attendance:staff (id=${staffPerm.id})`)
  }

  // 2. Find all schools that have at least one attendance permission in SchoolPermission
  const markPerm = await db.permission.findFirst({
    where: { code: 'attendance:mark', isActive: true },
  })
  if (!markPerm) {
    console.log('⚠️  No attendance:mark permission found — nothing to do.')
    return
  }

  const schoolsWithAttendance = await db.schoolPermission.findMany({
    where: { permissionId: markPerm.id },
    select: { schoolId: true },
  })

  const schoolIds = [...new Set(schoolsWithAttendance.map((sp) => sp.schoolId))]
  console.log(`Found ${schoolIds.length} school(s) with attendance:mark permission.`)

  // Find an existing grantedBy from any SchoolPermission, or fall back to a SUPER_ADMIN user
  const existingGrant = await db.schoolPermission.findFirst({
    where: { permissionId: markPerm.id },
    select: { grantedBy: true },
  })
  let grantedBy = existingGrant?.grantedBy
  if (!grantedBy) {
    const superAdmin = await db.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    })
    grantedBy = superAdmin?.id || 'system-migration'
  }
  console.log(`Using grantedBy: ${grantedBy}`)

  // 3. For each school, add attendance:staff if missing
  let added = 0
  for (const schoolId of schoolIds) {
    const existing = await db.schoolPermission.findFirst({
      where: { schoolId, permissionId: staffPerm.id },
    })
    if (!existing) {
      await db.schoolPermission.create({
        data: { schoolId, permissionId: staffPerm.id, grantedBy },
      })
      added++
      console.log(`  ➕ Added attendance:staff to school ${schoolId}`)
    } else {
      console.log(`  ✔️  School ${schoolId} already has attendance:staff`)
    }
  }

  console.log(`\nDone. Added attendance:staff to ${added} school(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
