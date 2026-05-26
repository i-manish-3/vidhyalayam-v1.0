import { db } from '../../src/lib/db'
import { hashPassword } from '../../src/lib/auth'

type DriverSeed = {
  firstName: string
  lastName: string
  gender: string
  phone: string
  dob: Date
  joinDate: Date
  drivingLicenseNumber: string
  assignedRouteNumber?: string // optional: which TransportRoute they drive
}

const drivers: DriverSeed[] = [
  { firstName: 'Ramesh', lastName: 'Yadav', gender: 'Male', phone: '9810011001', dob: new Date('1978-06-12'), joinDate: new Date('2018-07-01'), drivingLicenseNumber: 'DL-0420180000111', assignedRouteNumber: 'R1' },
  { firstName: 'Sunil', lastName: 'Kumar', gender: 'Male', phone: '9810011002', dob: new Date('1982-02-25'), joinDate: new Date('2019-04-15'), drivingLicenseNumber: 'DL-0420180000222', assignedRouteNumber: 'R2' },
  { firstName: 'Mohan', lastName: 'Singh', gender: 'Male', phone: '9810011003', dob: new Date('1975-11-04'), joinDate: new Date('2017-09-10'), drivingLicenseNumber: 'DL-0420180000333', assignedRouteNumber: 'R3' },
  { firstName: 'Vijay', lastName: 'Sharma', gender: 'Male', phone: '9810011004', dob: new Date('1980-09-18'), joinDate: new Date('2020-06-20'), drivingLicenseNumber: 'DL-0420180000444' },
  { firstName: 'Anil', lastName: 'Verma', gender: 'Male', phone: '9810011005', dob: new Date('1985-03-30'), joinDate: new Date('2021-08-05'), drivingLicenseNumber: 'DL-0420180000555' },
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
    const fullName = `${d.firstName} ${d.lastName}`.trim()
    const email = localDriverEmail(d.phone, school.id)
    const existing = await db.user.findFirst({
      where: {
        schoolId: school.id,
        OR: [{ email }, { phone: d.phone }],
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
          name: fullName,
          phone: d.phone,
          mustChangePassword: true,
          role: 'STAFF',
          isActive: true,
        },
      })
      await tx.userRole.create({
        data: { userId: driverUser.id, roleId: transportRole.id, assignedBy: schoolAdmin.id },
      })

      await tx.driver.create({
        data: {
          schoolId: school.id,
          userId: driverUser.id,
          firstName: d.firstName,
          lastName: d.lastName,
          gender: d.gender,
          dateOfBirth: d.dob,
          joinDate: d.joinDate,
          drivingLicenseNumber: d.drivingLicenseNumber,
        },
      })

      // Stamp route's driver fields when an assignment is given (display-only on TransportRoute).
      if (d.assignedRouteNumber) {
        const route = routeByNumber.get(d.assignedRouteNumber)
        if (route) {
          await tx.transportRoute.update({
            where: { id: route.id },
            data: { driverName: fullName, driverPhone: d.phone },
          })
        }
      }
    })
    created++
  }

  console.log(`✅ Created ${created} drivers (Driver model + Transport-role User). Default password: driver123 — must change on first login.`)
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
