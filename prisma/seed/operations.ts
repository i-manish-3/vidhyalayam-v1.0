import { db } from '../../src/lib/db'

async function main() {
  console.log('🌱 Seeding operations (book issues, salary payments, advances)...')

  const school = await db.school.findFirst({ where: { subdomain: 'dps-delhi', deletedAt: null } })
  if (!school) throw new Error('Seed school "dps-delhi" not found. Run the core seed first.')

  const schoolAdmin = await db.user.findFirst({ where: { schoolId: school.id, role: 'SCHOOL_ADMIN', deletedAt: null } })
  if (!schoolAdmin) throw new Error('School admin not found. Run the core seed first.')

  // ============================================
  // BOOK ISSUES — one returned, one outstanding
  // ============================================
  const books = await db.libraryBook.findMany({ where: { schoolId: school.id, deletedAt: null }, orderBy: { title: 'asc' } })
  const demoStudents = await db.student.findMany({
    where: { schoolId: school.id, admissionNumber: { startsWith: 'ADM-SEED-2025-' }, deletedAt: null },
    orderBy: { admissionNumber: 'asc' },
    take: 2,
  })

  let issuesCreated = 0
  if (books.length >= 2 && demoStudents.length >= 2) {
    // First issue — returned on time
    const existingReturned = await db.bookIssue.findFirst({
      where: { schoolId: school.id, bookId: books[0].id, studentId: demoStudents[0].id, status: 'returned' },
    })
    if (!existingReturned) {
      await db.bookIssue.create({
        data: {
          schoolId: school.id,
          bookId: books[0].id,
          studentId: demoStudents[0].id,
          issueDate: new Date('2025-05-05'),
          dueDate: new Date('2025-05-19'),
          returnDate: new Date('2025-05-17'),
          fine: 0,
          status: 'returned',
        },
      })
      issuesCreated++
    }

    // Second issue — still outstanding
    const existingOutstanding = await db.bookIssue.findFirst({
      where: { schoolId: school.id, bookId: books[1].id, studentId: demoStudents[1].id, status: 'issued' },
    })
    if (!existingOutstanding) {
      await db.bookIssue.create({
        data: {
          schoolId: school.id,
          bookId: books[1].id,
          studentId: demoStudents[1].id,
          issueDate: new Date('2025-06-02'),
          dueDate: new Date('2025-06-16'),
          fine: 0,
          status: 'issued',
        },
      })
      issuesCreated++
    }
  }
  console.log(`✅ Created ${issuesCreated} book issues`)

  // ============================================
  // SALARY PAYMENTS — Apr 2025 + May 2025 paid for every teacher with a structure
  // ============================================
  const structures = await db.salaryStructure.findMany({
    where: { schoolId: school.id, isActive: true },
    include: { teacher: true },
  })

  const payMonths: Array<{ month: number; year: number; date: Date }> = [
    { month: 4, year: 2025, date: new Date('2025-05-01') },
    { month: 5, year: 2025, date: new Date('2025-06-01') },
  ]

  let salaryPaymentsCreated = 0
  for (const struct of structures) {
    for (const pm of payMonths) {
      const existing = await db.salaryPayment.findFirst({
        where: { schoolId: school.id, teacherId: struct.teacherId, month: pm.month, year: pm.year },
      })
      if (existing) continue
      const totalDeductions = (struct.pf || 0) + (struct.esi || 0) + (struct.tax || 0) + (struct.otherDeductions || 0)
      await db.salaryPayment.create({
        data: {
          schoolId: school.id,
          teacherId: struct.teacherId,
          salaryStructureId: struct.id,
          month: pm.month,
          year: pm.year,
          basicSalary: struct.basicSalary,
          hra: struct.hra,
          da: struct.da,
          ta: struct.ta,
          medicalAllowance: struct.medicalAllowance,
          specialAllowance: struct.specialAllowance,
          grossEarnings: struct.grossSalary,
          pf: struct.pf,
          esi: struct.esi,
          tax: struct.tax,
          otherDeductions: struct.otherDeductions,
          totalDeductions,
          netPayable: struct.netSalary,
          paymentStatus: 'paid',
          paymentDate: pm.date,
          paymentMethod: 'BANK_TRANSFER',
          transactionRef: `SAL-${pm.year}-${String(pm.month).padStart(2, '0')}-${struct.teacherId.slice(-4)}`,
          generatedOn: pm.date,
        },
      })
      salaryPaymentsCreated++
    }
  }
  console.log(`✅ Created ${salaryPaymentsCreated} salary payments`)

  // ============================================
  // ADVANCE REQUESTS — one approved advance for first 2 teachers
  // ============================================
  let advancesCreated = 0
  for (const struct of structures.slice(0, 2)) {
    const existing = await db.advanceRequest.findFirst({
      where: { schoolId: school.id, teacherId: struct.teacherId, approvalStatus: 'approved' },
    })
    if (existing) continue
    await db.advanceRequest.create({
      data: {
        schoolId: school.id,
        teacherId: struct.teacherId,
        amount: 10000,
        reason: 'Medical emergency — family treatment',
        requestDate: new Date('2025-05-15'),
        approvalStatus: 'approved',
        approvedBy: schoolAdmin.id,
        approvedAt: new Date('2025-05-16'),
        deductionMonth: 7,
        deductionYear: 2025,
      },
    })
    advancesCreated++
  }
  console.log(`✅ Created ${advancesCreated} advance requests`)

  console.log('🧰 Operations seed complete.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
