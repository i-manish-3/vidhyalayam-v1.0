import { db } from '@/lib/db'
import type { BulkLookups } from '@/lib/bulk-admission'

/**
 * Pre-fetch reference data needed to validate a bulk admission upload.
 * Fee/transport/hostel lookups are intentionally excluded because bulk import
 * only creates admission, student, family, and enrollment records.
 */
export async function loadBulkAdmissionLookups(
  schoolId: string,
  academicYear: string,
): Promise<BulkLookups> {
  const [classes, sections, existingStudents, settings, admissionsByClass] = await Promise.all([
    db.class.findMany({
      where: { schoolId, deletedAt: null, isActive: true },
      select: { id: true, name: true },
    }),
    db.section.findMany({
      where: { schoolId, deletedAt: null },
      select: { id: true, name: true, classId: true },
    }),
    db.student.findMany({
      where: { schoolId, deletedAt: null },
      select: { admissionNumber: true },
    }),
    db.admissionSetting.findUnique({
      where: { schoolId },
      select: {
        admissionOpenDate: true,
        admissionCloseDate: true,
        maxApplicationsPerClass: true,
      },
    }),
    db.admission.groupBy({
      by: ['classId'],
      where: { schoolId, academicYear, deletedAt: null },
      _count: { _all: true },
    }),
  ])

  const classByName = new Map<string, string>()
  for (const c of classes) classByName.set(c.name.toLowerCase(), c.id)

  const sectionByClassAndName = new Map<string, string>()
  for (const section of sections) {
    sectionByClassAndName.set(`${section.classId}|${section.name.toLowerCase()}`, section.id)
  }

  const existingAdmissionNumbers = new Set<string>()
  for (const student of existingStudents) {
    if (!student.admissionNumber) continue
    existingAdmissionNumbers.add(student.admissionNumber)
  }

  const admissionCountByClassId = new Map<string, number>()
  for (const row of admissionsByClass) {
    if (row.classId) admissionCountByClassId.set(row.classId, row._count._all)
  }

  return {
    classByName,
    sectionByClassAndName,
    existingAdmissionNumbers,
    admissionOpenAt: settings?.admissionOpenDate ? new Date(settings.admissionOpenDate).getTime() : null,
    admissionCloseAt: settings?.admissionCloseDate ? new Date(settings.admissionCloseDate).getTime() : null,
    maxApplicationsPerClass: settings?.maxApplicationsPerClass ?? null,
    admissionCountByClassId,
  }
}
