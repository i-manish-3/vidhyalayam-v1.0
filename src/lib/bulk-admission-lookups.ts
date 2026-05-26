import { db } from '@/lib/db'
import type { BulkLookups } from '@/lib/bulk-admission'

/**
 * Pre-fetch all reference data needed to validate a bulk admission upload.
 *
 * One call returns everything: classes, sections, fee groups, fee structures,
 * and existing admission numbers. The validator then runs row-by-row against
 * these in-memory maps with zero further DB calls.
 *
 * Server-only — must not be imported from client code (depends on @/lib/db).
 */
export async function loadBulkAdmissionLookups(
  schoolId: string,
  academicYear: string,
): Promise<BulkLookups> {
  const [classes, sections, feesGroups, feesStructures, existingStudents] = await Promise.all([
    db.class.findMany({
      where: { schoolId, deletedAt: null, isActive: true },
      select: { id: true, name: true },
    }),
    db.section.findMany({
      where: { schoolId, deletedAt: null },
      select: { id: true, name: true, classId: true },
    }),
    db.feesGroup.findMany({
      where: { schoolId, deletedAt: null, isActive: true },
      select: { id: true, name: true },
    }),
    db.feesStructure.findMany({
      where: {
        schoolId,
        academicYear,
        isActive: true,
        status: 'active',
        deletedAt: null,
      },
      select: { classId: true, feesGroupId: true },
    }),
    db.student.findMany({
      where: { schoolId, deletedAt: null },
      select: { admissionNumber: true },
    }),
  ])

  const classByName = new Map<string, string>()
  for (const c of classes) classByName.set(c.name.toLowerCase(), c.id)

  const sectionByClassAndName = new Map<string, string>()
  for (const s of sections) sectionByClassAndName.set(`${s.classId}|${s.name.toLowerCase()}`, s.id)

  const feesGroupByName = new Map<string, string>()
  for (const g of feesGroups) feesGroupByName.set(g.name.toLowerCase(), g.id)

  const feesStructureKeys = new Set<string>()
  for (const fs of feesStructures) feesStructureKeys.add(`${fs.classId}|${fs.feesGroupId}`)

  const existingAdmissionNumbers = new Set<string>()
  for (const s of existingStudents) {
    if (s.admissionNumber) existingAdmissionNumbers.add(s.admissionNumber)
  }

  return {
    classByName,
    sectionByClassAndName,
    feesGroupByName,
    feesStructureKeys,
    existingAdmissionNumbers,
  }
}
