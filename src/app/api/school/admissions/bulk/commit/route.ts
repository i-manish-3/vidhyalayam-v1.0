import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'
import { hashPassword } from '@/lib/auth'
import { allocateSchoolNumber } from '@/lib/admission-numbering'
import { validateRow, checkAdmissionWindow, type RawRow, type NormalizedRow } from '@/lib/bulk-admission'
import { loadBulkAdmissionLookups } from '@/lib/bulk-admission-lookups'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/
const MAX_ROWS_PER_REQUEST = 50

async function resolveActiveAcademicYear(schoolId: string): Promise<string | null> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const year = (school?.academicYear || '').trim()
  if (!ACADEMIC_YEAR_PATTERN.test(year)) return null
  const exists = await db.academicYear.findFirst({
    where: { schoolId, name: year, isActive: true, deletedAt: null },
    select: { id: true },
  })
  return exists ? year : null
}

type CommitResult = {
  created: Array<{ index: number; studentId: string; admissionNumber: string }>
  failed: Array<{ index: number; reason: string }>
}

export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user || !user.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:create')
      if (!authorized) {
        return forbiddenError("You don't have permission to bulk-admit students.")
      }
    }

    const body = await request.json().catch(() => null)
    const rows: RawRow[] = Array.isArray(body?.rows) ? body.rows : []

    if (rows.length === 0) return apiError(400, 'No rows received.')
    if (rows.length > MAX_ROWS_PER_REQUEST) {
      return apiError(400, `Each commit chunk is limited to ${MAX_ROWS_PER_REQUEST} rows.`)
    }

    const academicYear = await resolveActiveAcademicYear(user.schoolId)
    if (!academicYear) {
      return apiError(400, 'No active academic year is configured for this school.')
    }

    const lookups = await loadBulkAdmissionLookups(user.schoolId, academicYear)
    const windowError = checkAdmissionWindow(lookups)
    if (windowError) return apiError(400, windowError)

    const seenOverrides = new Set<string>()
    const classTally = new Map<string, number>()
    const validated: Array<{ index: number; parsed: NormalizedRow } | { index: number; reason: string }> = rows.map(
      (row, index) => {
        const diagnostic = validateRow({ row, index, lookups, seenOverrides, classTally })
        if (diagnostic.status === 'invalid' || !diagnostic.parsed) {
          return { index, reason: diagnostic.errors.join('; ') || 'Validation failed' }
        }
        return { index, parsed: diagnostic.parsed }
      },
    )

    const familyIdByFatherPhone = new Map<string, string>()
    for (const item of validated) {
      if ('parsed' in item && !familyIdByFatherPhone.has(item.parsed.fatherPhone)) {
        familyIdByFatherPhone.set(item.parsed.fatherPhone, randomUUID())
      }
    }

    const result: CommitResult = { created: [], failed: [] }
    const userId = user.userId!
    const schoolId = user.schoolId

    const parentRole = await db.role.findFirst({
      where: { name: 'Parent', schoolId, deletedAt: null, isActive: true },
      select: { id: true },
    })

    for (const item of validated) {
      if ('reason' in item) {
        result.failed.push({ index: item.index, reason: item.reason })
        continue
      }

      const { index, parsed } = item
      try {
        const dob = new Date(parsed.dateOfBirth)
        const now = new Date()

        const createdInTx = await db.$transaction(async (tx) => {
          const familyId = familyIdByFatherPhone.get(parsed.fatherPhone)!

          const admissionNumber = parsed.admissionNumberOverride
            ? parsed.admissionNumberOverride
            : await allocateSchoolNumber(tx, schoolId, 'admission', parsed.classId)

          const registrationNumber = await allocateSchoolNumber(tx, schoolId, 'registration', parsed.classId)

          const admission = await tx.admission.create({
            data: {
              schoolId,
              admissionNumber,
              academicYear,
              admissionType: 'new',
              status: 'admitted',
              firstName: parsed.firstName,
              lastName: parsed.lastName,
              dateOfBirth: dob,
              dateOfAdmission: now,
              gender: parsed.gender,
              nationality: parsed.nationality,
              religion: parsed.religion,
              category: parsed.category,
              aadhaarNumber: parsed.aadhaarNumber,
              bloodGroup: parsed.bloodGroup,
              registrationNumber,
              address: parsed.address,
              city: parsed.city,
              state: parsed.state,
              pincode: parsed.pincode,
              fatherName: parsed.fatherName,
              fatherPhone: parsed.fatherPhone,
              motherName: parsed.motherName,
              motherPhone: parsed.motherPhone,
              classId: parsed.classId,
              sectionId: parsed.sectionId,
              admissionSession: academicYear,
              previousSchool: parsed.previousSchool,
              familyId,
              siblingId: null,
              appliedDate: now,
              admittedBy: userId,
              admittedAt: now,
              createdBy: userId,
            },
          })

          const student = await tx.student.create({
            data: {
              schoolId,
              admissionNumber: admission.admissionNumber,
              firstName: admission.firstName,
              lastName: admission.lastName,
              dateOfBirth: admission.dateOfBirth,
              gender: admission.gender,
              nationality: admission.nationality,
              religion: admission.religion,
              category: admission.category,
              aadhaarNumber: admission.aadhaarNumber,
              bloodGroup: admission.bloodGroup,
              address: admission.address,
              city: admission.city,
              state: admission.state,
              pincode: admission.pincode,
              country: 'India',
              admissionDate: now,
              previousSchool: admission.previousSchool,
              rollNumber: parsed.rollNumber,
              familyId,
              siblingId: null,
              admissionStatus: 'admitted',
              classId: admission.classId,
              sectionId: admission.sectionId,
            },
          })

          await tx.admission.update({
            where: { id: admission.id },
            data: { studentId: student.id },
          })

          await tx.studentAcademicEnrollment.create({
            data: {
              schoolId,
              studentId: student.id,
              academicYear,
              classId: admission.classId!,
              sectionId: admission.sectionId,
              rollNumber: parsed.rollNumber,
              status: 'active',
              source: 'admission',
              effectiveFrom: now,
              createdBy: userId,
            },
          })

          const fatherParent = await tx.parent.create({
            data: {
              schoolId,
              fatherName: admission.fatherName,
              motherName: null,
              phone: admission.fatherPhone,
              alternatePhone: admission.motherPhone,
              email: null,
              address: admission.address,
            },
          })

          await tx.studentParent.create({
            data: {
              studentId: student.id,
              parentId: fatherParent.id,
              relation: 'Father',
              isPrimary: true,
            },
          })

          if (admission.motherName) {
            const motherParent = await tx.parent.create({
              data: {
                schoolId,
                fatherName: null,
                motherName: admission.motherName,
                phone: admission.motherPhone || admission.fatherPhone,
                address: admission.address,
              },
            })
            await tx.studentParent.create({
              data: {
                studentId: student.id,
                parentId: motherParent.id,
                relation: 'Mother',
                isPrimary: false,
              },
            })
          }

          const cleanPhone = admission.fatherPhone!.replace(/\D/g, '').slice(-10)
          const parentEmail = `${cleanPhone}@parent.local`
          const parentName = admission.fatherName!

          const existingUser = await tx.user.findFirst({
            where: { phone: cleanPhone, schoolId, deletedAt: null },
          })

          let parentUserId: string | null = null
          if (existingUser) {
            if (existingUser.role !== 'PARENT') {
              throw new Error('PARENT_ACCOUNT_CONFLICT')
            }
            parentUserId = existingUser.id
          } else {
            const hashedPwd = await hashPassword('parent123')
            const newUser = await tx.user.create({
              data: {
                email: parentEmail,
                password: hashedPwd,
                name: parentName,
                phone: cleanPhone,
                role: 'PARENT',
                schoolId,
                isActive: true,
              },
            })
            parentUserId = newUser.id
          }

          await tx.parent.update({
            where: { id: fatherParent.id },
            data: { userId: parentUserId },
          })

          if (parentRole) {
            const existingRoleAssignment = await tx.userRole.findFirst({
              where: { userId: parentUserId, roleId: parentRole.id },
            })
            if (!existingRoleAssignment) {
              await tx.userRole.create({
                data: {
                  userId: parentUserId,
                  roleId: parentRole.id,
                  assignedBy: userId,
                },
              })
            }
          }

          await tx.admissionActivity.create({
            data: {
              admissionId: admission.id,
              action: 'created',
              toValue: 'admitted',
              performedBy: userId,
              description: `Bulk import: admission ${admissionNumber}, student ${student.id}`,
            },
          })

          return { studentId: student.id, admissionNumber }
        })

        result.created.push({
          index,
          studentId: createdInTx.studentId,
          admissionNumber: createdInTx.admissionNumber,
        })
      } catch (err) {
        result.failed.push({ index, reason: formatTransactionError(err) })
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Bulk admission commit error:', error)
    return internalError('committing the bulk admission')
  }
}

function formatTransactionError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === 'PARENT_ACCOUNT_CONFLICT') {
      return 'A non-parent user already exists with this phone number. Resolve manually or change the row.'
    }
    if (err.message.includes('Unique constraint')) {
      return `Duplicate value rejected by database: ${err.message.split('\n').pop()?.slice(0, 200)}`
    }
    return err.message.slice(0, 300)
  }
  return 'Unknown error'
}
