import { db } from '../src/lib/db'

// One-shot backfill: every Student in every school must have a
// StudentAcademicEnrollment row for that school's active academic year.
// Earlier student-creation code paths (the direct POST /api/school/students
// endpoint and previous seed iterations) didn't create one, which makes the
// student-detail page show "wasn't enrolled in <year>" even when the student
// is in the active session.
//
// Safe to re-run — for each student, it only inserts a row when one is missing.

async function main() {
  console.log('🌱 Backfilling missing StudentAcademicEnrollment rows...')

  const schools = await db.school.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, academicYear: true },
  })

  let totalBackfilled = 0
  let totalSkipped = 0

  for (const school of schools) {
    if (!school.academicYear) {
      console.log(`↺ ${school.name}: no active academicYear configured. Skipping.`)
      continue
    }

    const schoolAdmin = await db.user.findFirst({
      where: { schoolId: school.id, role: 'SCHOOL_ADMIN', deletedAt: null },
      select: { id: true },
    })

    const students = await db.student.findMany({
      where: { schoolId: school.id, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        classId: true,
        sectionId: true,
        rollNumber: true,
        admissionDate: true,
      },
    })

    let schoolBackfilled = 0
    let schoolSkipped = 0
    for (const stu of students) {
      if (!stu.classId) {
        schoolSkipped++
        continue
      }
      const existing = await db.studentAcademicEnrollment.findFirst({
        where: {
          studentId: stu.id,
          academicYear: school.academicYear,
          deletedAt: null,
        },
        select: { id: true },
      })
      if (existing) continue

      await db.studentAcademicEnrollment.create({
        data: {
          schoolId: school.id,
          studentId: stu.id,
          academicYear: school.academicYear,
          classId: stu.classId,
          sectionId: stu.sectionId,
          rollNumber: stu.rollNumber,
          status: 'active',
          source: 'backfill',
          effectiveFrom: stu.admissionDate || new Date('2025-04-01'),
          createdBy: schoolAdmin?.id || null,
        },
      })
      schoolBackfilled++
    }

    console.log(
      `✅ ${school.name} (${school.academicYear}): backfilled ${schoolBackfilled}, skipped ${schoolSkipped} (missing classId)`
    )
    totalBackfilled += schoolBackfilled
    totalSkipped += schoolSkipped
  }

  console.log(`\n🎯 Total: backfilled ${totalBackfilled}, skipped ${totalSkipped}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
