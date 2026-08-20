import { db } from '@/lib/db'
import type { CertificateSnapshot } from './certificate-types'

function fmt(d: Date | null | undefined): string {
  if (!d) return ''
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function academicYearOf(today = new Date()): string {
  const y = today.getFullYear()
  const m = today.getMonth() + 1
  return m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

/**
 * Capture the student + school data that a certificate is issued from. The
 * snapshot is stored on the Certificate row so the printed certificate always
 * reflects the exact data at issue time — later edits to the student record
 * never rewrite history.
 */
export async function buildCertificateSnapshot(
  schoolId: string,
  studentId: string,
): Promise<CertificateSnapshot | null> {
  const [student, school] = await Promise.all([
    db.student.findFirst({
      where: { id: studentId, schoolId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        rollNumber: true,
        dateOfBirth: true,
        gender: true,
        nationality: true,
        religion: true,
        category: true,
        motherTongue: true,
        bloodGroup: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        admissionDate: true,
        previousSchool: true,
        previousClass: true,
        class: { select: { name: true } },
        section: { select: { name: true } },
        parentLinks: {
          select: {
            isPrimary: true,
            relation: true,
            parent: {
              select: {
                fatherName: true,
                motherName: true,
                phone: true,
                alternatePhone: true,
              },
            },
          },
        },
      },
    }),
    db.school.findFirst({
      where: { id: schoolId },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        contactPhone: true,
        contactEmail: true,
        website: true,
        board: true,
        registrationNumber: true,
        affiliationNumber: true,
        udiseNumber: true,
        principalName: true,
        trustName: true,
        academicYear: true,
      },
    }),
  ])

  if (!student || !school) return null

  const primaryParent =
    student.parentLinks.find((p) => p.isPrimary) ||
    student.parentLinks[0]

  return toSnapshot(student, school, primaryParent)
}

/**
 * Batch variant of buildCertificateSnapshot — one round-trip per school for
 * any number of students. Used by the bulk-issue flow so N certificates never
 * trigger 2N queries.
 */
export async function buildCertificateSnapshots(
  schoolId: string,
  studentIds: string[],
): Promise<Map<string, CertificateSnapshot>> {
  const out = new Map<string, CertificateSnapshot>()
  if (studentIds.length === 0) return out

  const [students, school] = await Promise.all([
    db.student.findMany({
      where: { id: { in: studentIds }, schoolId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        rollNumber: true,
        dateOfBirth: true,
        gender: true,
        nationality: true,
        religion: true,
        category: true,
        motherTongue: true,
        bloodGroup: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        admissionDate: true,
        previousSchool: true,
        previousClass: true,
        class: { select: { name: true } },
        section: { select: { name: true } },
        parentLinks: {
          select: {
            isPrimary: true,
            relation: true,
            parent: {
              select: {
                fatherName: true,
                motherName: true,
                phone: true,
                alternatePhone: true,
              },
            },
          },
        },
      },
    }),
    db.school.findFirst({
      where: { id: schoolId },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        contactPhone: true,
        contactEmail: true,
        website: true,
        board: true,
        registrationNumber: true,
        affiliationNumber: true,
        udiseNumber: true,
        principalName: true,
        trustName: true,
        academicYear: true,
      },
    }),
  ])

  if (!school) return out

  for (const student of students) {
    const primaryParent =
      student.parentLinks.find((p) => p.isPrimary) ||
      student.parentLinks[0]
    out.set(student.id, toSnapshot(student, school, primaryParent))
  }
  return out
}

interface SnapshotStudent {
  id: string
  firstName: string
  lastName: string | null
  admissionNumber: string | null
  rollNumber: string | null
  dateOfBirth: Date | null
  gender: string | null
  nationality: string | null
  religion: string | null
  category: string | null
  motherTongue: string | null
  bloodGroup: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  admissionDate: Date | null
  previousSchool: string | null
  previousClass: string | null
  class: { name: string } | null
  section: { name: string } | null
  parentLinks: Array<{
    isPrimary: boolean
    relation: string
    parent: { fatherName: string | null; motherName: string | null; phone: string | null; alternatePhone: string | null }
  }>
}

interface SnapshotSchool {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  contactPhone: string | null
  contactEmail: string | null
  website: string | null
  board: string
  registrationNumber: string | null
  affiliationNumber: string | null
  udiseNumber: string | null
  principalName: string | null
  trustName: string | null
  academicYear: string
}

function toSnapshot(
  student: SnapshotStudent,
  school: SnapshotSchool,
  primaryParent?: SnapshotStudent['parentLinks'][number],
): CertificateSnapshot {
  return {
    issuedAt: new Date().toISOString(),
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      fullName: [student.firstName, student.lastName].filter(Boolean).join(' '),
      admissionNumber: student.admissionNumber,
      rollNumber: student.rollNumber,
      className: student.class?.name || '',
      sectionName: student.section ? `, Section ${student.section.name}` : '',
      academicYear: school.academicYear,
      dateOfBirth: fmt(student.dateOfBirth),
      gender: student.gender || '',
      nationality: student.nationality || '',
      religion: student.religion || '',
      category: student.category || '',
      motherTongue: student.motherTongue || '',
      bloodGroup: student.bloodGroup || '',
      address: student.address || '',
      city: student.city || '',
      state: student.state || '',
      pincode: student.pincode || '',
      dateOfAdmission: fmt(student.admissionDate),
      previousSchool: student.previousSchool || '',
      previousClass: student.previousClass || '',
      fatherName: primaryParent?.parent.fatherName || '',
      motherName: primaryParent?.parent.motherName || '',
      parentPhone: primaryParent?.parent.phone || primaryParent?.parent.alternatePhone || '',
    },
    school: {
      id: school.id,
      name: school.name,
      address: school.address || '',
      city: school.city || '',
      state: school.state || '',
      pincode: school.pincode || '',
      phone: school.contactPhone || '',
      email: school.contactEmail || '',
      website: school.website || '',
      board: school.board || '',
      registrationNumber: school.registrationNumber || '',
      affiliationNumber: school.affiliationNumber || '',
      udiseNumber: school.udiseNumber || '',
      principalName: school.principalName || '',
      trustName: school.trustName || '',
      academicYear: school.academicYear || academicYearOf(),
    },
  }
}