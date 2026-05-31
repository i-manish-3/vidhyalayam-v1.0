import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'
import { hashPassword } from '@/lib/auth'
import { assignStudentFeesFromStructure } from '@/lib/fees'
import { allocateSchoolNumber } from '@/lib/admission-numbering'
import { validateRow, type RawRow, type NormalizedRow } from '@/lib/bulk-admission'
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
  created: Array<{ index: number; studentId: string; admissionNumber: string; feesAssigned: boolean }>
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
    // Global toggle for the whole batch — when true, every row's fee
    // assignment is created without join-month pro-rating.
    const chargeFullYearFees: boolean = body?.chargeFullYearFees === true

    if (rows.length === 0) return apiError(400, 'No rows received.')
    if (rows.length > MAX_ROWS_PER_REQUEST) {
      return apiError(400, `Each commit chunk is limited to ${MAX_ROWS_PER_REQUEST} rows.`)
    }

    const academicYear = await resolveActiveAcademicYear(user.schoolId)
    if (!academicYear) {
      return apiError(400, 'No active academic year is configured for this school.')
    }

    // Re-fetch lookups so a class/section deleted between validate and commit
    // is caught here rather than silently inserted with stale ids.
    const lookups = await loadBulkAdmissionLookups(user.schoolId, academicYear)

    // First pass: re-validate every row. Anything invalid is rejected outright.
    // Inside-batch admission-number duplicates are also caught here.
    const seenOverrides = new Set<string>()
    const validated: Array<{ index: number; parsed: NormalizedRow } | { index: number; reason: string }> = rows.map(
      (row, index) => {
        const d = validateRow({ row, index, lookups, seenOverrides })
        if (d.status === 'invalid' || !d.parsed) {
          return { index, reason: d.errors.join('; ') || 'Validation failed' }
        }
        return { index, parsed: d.parsed }
      },
    )

    // Pre-compute familyId per fatherPhone group, so siblings in the same upload
    // get the same familyId without needing to look at each other in the DB.
    const familyIdByFatherPhone = new Map<string, string>()
    for (const item of validated) {
      if ('parsed' in item) {
        if (!familyIdByFatherPhone.has(item.parsed.fatherPhone)) {
          familyIdByFatherPhone.set(item.parsed.fatherPhone, randomUUID())
        }
      }
    }

    const result: CommitResult = { created: [], failed: [] }
    const userId = user.userId!
    const schoolId = user.schoolId

    // Lookup the school's "Parent" role once — referenced by every parent user
    // we create below. If it doesn't exist, parent role assignment is silently
    // skipped (matches single-admission's behavior).
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
        const familyId = familyIdByFatherPhone.get(parsed.fatherPhone)!
        const dob = new Date(parsed.dateOfBirth)
        const now = new Date()

        const createdInTx = await db.$transaction(async (tx) => {
          // Allocate admission/registration numbers inside the tx so the
          // counter increment is part of the same atomic unit. If a row in
          // the CSV provided an explicit admissionNumber override, use that
          // instead (it was already collision-checked during validate).
          const admissionNumber = parsed.admissionNumberOverride
            ? parsed.admissionNumberOverride
            : await allocateSchoolNumber(tx, schoolId, 'admission', parsed.classId)

          const registrationNumber = await allocateSchoolNumber(
            tx,
            schoolId,
            'registration',
            parsed.classId,
          )

          // 1. Admission
          const adm = await tx.admission.create({
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
              feesGroupId: parsed.feesGroupId,
              familyId,
              appliedDate: now,
              admittedBy: userId,
              admittedAt: now,
              createdBy: userId,
            },
          })

          // 2. Student
          const student = await tx.student.create({
            data: {
              schoolId,
              admissionNumber: adm.admissionNumber,
              firstName: adm.firstName,
              lastName: adm.lastName,
              dateOfBirth: adm.dateOfBirth,
              gender: adm.gender,
              nationality: adm.nationality,
              religion: adm.religion,
              category: adm.category,
              aadhaarNumber: adm.aadhaarNumber,
              bloodGroup: adm.bloodGroup,
              address: adm.address,
              city: adm.city,
              state: adm.state,
              pincode: adm.pincode,
              country: 'India',
              admissionDate: now,
              previousSchool: adm.previousSchool,
              rollNumber: parsed.rollNumber,
              familyId,
              admissionStatus: 'admitted',
              classId: adm.classId,
              sectionId: adm.sectionId,
            },
          })

          // 3. Link admission → student
          await tx.admission.update({
            where: { id: adm.id },
            data: { studentId: student.id },
          })

          // 4. Academic enrollment for the year
          await tx.studentAcademicEnrollment.create({
            data: {
              schoolId,
              studentId: student.id,
              academicYear,
              classId: adm.classId!,
              sectionId: adm.sectionId,
              rollNumber: parsed.rollNumber,
              status: 'active',
              source: 'admission',
              effectiveFrom: now,
              createdBy: userId,
            },
          })

          // 5. Fee assignment (best-effort — skip if no structure)
          let feesAssigned = false
          if (parsed.hasFeesStructure) {
            await assignStudentFeesFromStructure({
              tx,
              schoolId,
              studentId: student.id,
              classId: adm.classId,
              sectionId: adm.sectionId,
              feesGroupId: parsed.feesGroupId,
              academicYear,
              assignedBy: userId,
              source: 'admission',
              effectiveFrom: now,
              chargeFullYear: chargeFullYearFees,
            })
            feesAssigned = true
          }

          // 6. Father parent + StudentParent link
          const fatherParent = await tx.parent.create({
            data: {
              schoolId,
              fatherName: adm.fatherName,
              motherName: null,
              phone: adm.fatherPhone,
              alternatePhone: adm.motherPhone,
              email: null,
              address: adm.address,
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

          // 7. Mother parent (optional) + StudentParent link
          if (adm.motherName) {
            const motherParent = await tx.parent.create({
              data: {
                schoolId,
                fatherName: null,
                motherName: adm.motherName,
                phone: adm.motherPhone || adm.fatherPhone,
                address: adm.address,
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

          // 8. Parent User account for login (matches single-admission flow).
          //    Reuses an existing PARENT user with the same phone if one exists;
          //    refuses to reuse a non-PARENT user (would let parents log into
          //    e.g. a teacher account).
          const cleanPhone = adm.fatherPhone!.replace(/\D/g, '').slice(-10)
          const parentEmail = `${cleanPhone}@parent.local`
          const parentName = adm.fatherName!

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

          // Link the user to the father parent record (and assign Parent role if missing).
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

          // 9. Activity log
          await tx.admissionActivity.create({
            data: {
              admissionId: adm.id,
              action: 'created',
              toValue: 'admitted',
              performedBy: userId,
              description: `Bulk import: admission ${admissionNumber}, student ${student.id}`,
            },
          })

          return { studentId: student.id, admissionNumber, feesAssigned }
        })

        result.created.push({
          index,
          studentId: createdInTx.studentId,
          admissionNumber: createdInTx.admissionNumber,
          feesAssigned: createdInTx.feesAssigned,
        })
      } catch (err) {
        const reason = formatTransactionError(err)
        result.failed.push({ index, reason })
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
    // Prisma unique-constraint failures land here as messages like
    // "Unique constraint failed on the fields: (`admissionNumber`)".
    if (err.message.includes('Unique constraint')) {
      return `Duplicate value rejected by database: ${err.message.split('\n').pop()?.slice(0, 200)}`
    }
    return err.message.slice(0, 300)
  }
  return 'Unknown error'
}
