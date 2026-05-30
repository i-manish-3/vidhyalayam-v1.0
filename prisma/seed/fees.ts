import { db } from '../../src/lib/db'
import { assignStudentFeesFromStructure, recordStudentLedgerPayment } from '../../src/lib/fees'

const ACADEMIC_YEAR = '2026-2027'

async function main() {
  console.log('🌱 Seeding student fee assignments and sample payments...')

  const school = await db.school.findFirst({ where: { subdomain: 'dps-delhi', deletedAt: null } })
  if (!school) throw new Error('Seed school "dps-delhi" not found. Run the core seed first.')

  const schoolAdmin = await db.user.findFirst({ where: { schoolId: school.id, role: 'SCHOOL_ADMIN', deletedAt: null } })
  if (!schoolAdmin) throw new Error('School admin not found. Run the core seed first.')

  // Default group fallback in case admission has no feesGroupId.
  const defaultGroup = await db.feesGroup.findFirst({
    where: { schoolId: school.id, name: 'New Admission', deletedAt: null },
  })

  // Process all seeded students (demo families ADM-SEED-* + bulk STD-*).
  const allStudents = await db.student.findMany({
    where: {
      schoolId: school.id,
      deletedAt: null,
      OR: [
        { admissionNumber: { startsWith: 'ADM-SEED-2026-' } },
        { admissionNumber: { startsWith: 'STD-2026-' } },
      ],
    },
    include: { admission: { select: { feesGroupId: true } } },
    orderBy: { admissionNumber: 'asc' },
  })

  if (allStudents.length === 0) {
    console.log('↺ No seeded students found. Run admissions + students-bulk seed first. Skipping.')
    return
  }

  let assignedCount = 0
  let skippedCount = 0
  for (const student of allStudents) {
    if (!student.classId) {
      skippedCount++
      continue
    }
    const feesGroupId = student.admission?.feesGroupId || defaultGroup?.id || null
    if (!feesGroupId) {
      skippedCount++
      continue
    }

    const existing = await db.studentFeeAssignment.findFirst({
      where: { schoolId: school.id, studentId: student.id, academicYear: ACADEMIC_YEAR, deletedAt: null },
      select: { id: true },
    })
    if (existing) continue

    const result = await db.$transaction(async (tx) => {
      return assignStudentFeesFromStructure({
        tx,
        schoolId: school.id,
        studentId: student.id,
        classId: student.classId!,
        sectionId: student.sectionId || null,
        feesGroupId,
        academicYear: ACADEMIC_YEAR,
        assignedBy: schoolAdmin.id,
        source: 'admission',
        effectiveFrom: new Date('2026-04-01'),
      })
    })

    if (result?.id) assignedCount++
  }
  console.log(`✅ Created ${assignedCount} new student fee assignments (${skippedCount} skipped)`)

  // ============================================
  // SAMPLE PAYMENTS — April installment paid for first 5 demo students
  // ============================================
  const demoStudents = allStudents.filter(s => s.admissionNumber?.startsWith('ADM-SEED-')).slice(0, 5)
  // Also pay for first 20 bulk students to show realistic collection activity.
  const bulkPayers = allStudents.filter(s => s.admissionNumber?.startsWith('STD-')).slice(0, 20)
  const payers = [...demoStudents, ...bulkPayers]

  let paymentsRecorded = 0
  for (const student of payers) {
    const existingPayment = await db.studentFeePayment.findFirst({
      where: { schoolId: school.id, studentId: student.id },
    })
    if (existingPayment) continue

    const aprilDebits = await db.studentFeeLedgerEntry.findMany({
      where: {
        schoolId: school.id,
        studentId: student.id,
        academicYear: ACADEMIC_YEAR,
        entryType: 'DEBIT',
        installmentName: 'Apr',
      },
      select: { id: true, balanceAmount: true },
    })
    const payAmount = aprilDebits.reduce((sum, d) => sum + Number(d.balanceAmount || 0), 0)
    if (payAmount <= 0) continue

    await db.$transaction(async (tx) => {
      await recordStudentLedgerPayment({
        tx,
        schoolId: school.id,
        studentId: student.id,
        amount: payAmount,
        paymentMethod: 'CASH',
        paymentDate: new Date('2026-04-10'),
        notes: 'Seed: April installment payment',
        receivedBy: schoolAdmin.id,
        academicYear: ACADEMIC_YEAR,
        targets: aprilDebits.map(d => ({ debitEntryId: d.id, amount: Number(d.balanceAmount || 0) })),
      })
    })
    paymentsRecorded++
  }
  console.log(`✅ Recorded ${paymentsRecorded} sample fee payments`)

  console.log('💰 Fees seed complete.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
