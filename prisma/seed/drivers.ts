import { db } from '../../src/lib/db'
import { hashPassword } from '../../src/lib/auth'

type DriverSeed = {
  name: string
  phone: string
  dob: Date
  drivingLicenseNumber: string
  assignedRouteNumber?: string // optional: which TransportRoute they drive
}

const drivers: DriverSeed[] = [
  { name: 'Ramesh Yadav', phone: '9810011001', dob: new Date('1978-06-12'), drivingLicenseNumber: 'DL-0420180000111', assignedRouteNumber: 'R1' },
  { name: 'Sunil Kumar', phone: '9810011002', dob: new Date('1982-02-25'), drivingLicenseNumber: 'DL-0420180000222', assignedRouteNumber: 'R2' },
  { name: 'Mohan Singh', phone: '9810011003', dob: new Date('1975-11-04'), drivingLicenseNumber: 'DL-0420180000333', assignedRouteNumber: 'R3' },
  { name: 'Vijay Sharma', phone: '9810011004', dob: new Date('1980-09-18'), drivingLicenseNumber: 'DL-0420180000444' },
  { name: 'Anil Verma', phone: '9810011005', dob: new Date('1985-03-30'), drivingLicenseNumber: 'DL-0420180000555' },
]

function localDriverEmail(phone: string, schoolId: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10)
  return `driver.${schoolId.slice(0, 8)}.${digits}@driver.local`
}

async function main() {
  console.log('🌱 Seeding transport drivers...')

  const school = await db.school.findFirst({ where: { subdomain: 'dps-delhi', deletedAt: null } })
  if (!school) throw new Error('Seed school "dps-delhi" not found. Run the core seed first.')

  const schoolAdmin = await db.user.findFirst({ where: { schoolId: school.id, role: 'SCHOOL_ADMIN', deletedAt: null } })
  if (!schoolAdmin) throw new Error('School admin not found. Run the core seed first.')

  const transportRole = await db.role.findFirst({
    where: { schoolId: school.id, name: 'Transport', deletedAt: null, isActive: true },
  })
  if (!transportRole) {
    throw new Error('Transport role not found for school. Core seed should create it.')
  }

  const routes = await db.transportRoute.findMany({ where: { schoolId: school.id, deletedAt: null } })
  const routeByNumber = new Map(routes.map(r => [r.routeNumber || '', r]))

  const defaultPassword = await hashPassword('driver123')

  let created = 0
  for (const d of drivers) {
    const email = localDriverEmail(d.phone, school.id)
    const existing = await db.user.findFirst({
      where: {
        schoolId: school.id,
        OR: [{ email }, { phone: d.phone }, { drivingLicenseNumber: d.drivingLicenseNumber }],
        deletedAt: null,
      },
    })
    if (existing) continue

    await db.$transaction(async (tx) => {
      const driverUser = await tx.user.create({
        data: {
          schoolId: school.id,
          email,
          password: defaultPassword,
          name: d.name,
          phone: d.phone,
          dob: d.dob,
          drivingLicenseNumber: d.drivingLicenseNumber,
          mustChangePassword: true,
          role: 'STAFF',
          isActive: true,
        },
      })
      await tx.userRole.create({
        data: { userId: driverUser.id, roleId: transportRole.id, assignedBy: schoolAdmin.id },
      })

      // Stamp route's driver fields when an assignment is given (display-only on TransportRoute).
      if (d.assignedRouteNumber) {
        const route = routeByNumber.get(d.assignedRouteNumber)
        if (route) {
          await tx.transportRoute.update({
            where: { id: route.id },
            data: { driverName: d.name, driverPhone: d.phone },
          })
        }
      }
    })
    created++
  }

  console.log(`✅ Created ${created} drivers (Transport role). Default password: driver123 — must change on first login.`)
  console.log('🚐 Drivers seed complete.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
