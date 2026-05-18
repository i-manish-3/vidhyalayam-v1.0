import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, forbiddenError } from '@/lib/api-errors'

// Helper: Check if an admission number exists in either Admission or Student table
async function admissionNumberExists(admissionNumber: string): Promise<boolean> {
  const [inAdmission, inStudent] = await Promise.all([
    db.admission.findFirst({ where: { admissionNumber }, select: { id: true } }),
    db.student.findFirst({ where: { admissionNumber }, select: { id: true } }),
  ])
  return !!(inAdmission || inStudent)
}

// Helper: Generate admission number from settings (same logic as main admissions route)
async function generateAdmissionNumber(
  schoolId: string,
  classId?: string | null
): Promise<string> {
  const settings = await db.admissionSetting.findUnique({
    where: { schoolId },
  })

  const currentYear = new Date().getFullYear()
  const yearShort = currentYear.toString().slice(-2)

  if (settings) {
    const prefix = settings.admissionNumberPrefix || 'STD'
    const format = settings.admissionNumberFormat || '{PREFIX}-{YEAR}-{SEQ}'
    const digits = settings.sequenceDigits || 3
    const startSeq = settings.sequenceStart || 1

    // Count existing admissions this year for sequence
    const yearPrefix = `${prefix}-${currentYear}-`
    const existingCount = await db.admission.count({
      where: {
        schoolId,
        admissionNumber: { startsWith: yearPrefix },
      },
    })

    const sequence = (startSeq + existingCount).toString().padStart(digits, '0')

    // Replace format tokens
    let admissionNumber = format
      .replace('{PREFIX}', prefix)
      .replace('{YEAR}', currentYear.toString())
      .replace('{YY}', yearShort)
      .replace('{SEQ}', sequence)
      .replace('{CLASS}', classId ? `C${classId}` : '')

    // Ensure uniqueness across BOTH Admission and Student tables
    let finalAdmissionNumber = admissionNumber
    let exists = await admissionNumberExists(finalAdmissionNumber)

    let retryCount = 0
    while (exists && retryCount < 50) {
      retryCount++
      const newSeq = (startSeq + existingCount + retryCount).toString().padStart(digits, '0')
      finalAdmissionNumber = format
        .replace('{PREFIX}', prefix)
        .replace('{YEAR}', currentYear.toString())
        .replace('{YY}', yearShort)
        .replace('{SEQ}', newSeq)
        .replace('{CLASS}', classId ? `C${classId}` : '')
      exists = await admissionNumberExists(finalAdmissionNumber)
    }

    return finalAdmissionNumber
  }

  // Fallback: default format STD-{YEAR}-{SEQ}
  const yearPrefix = `STD-${currentYear}-`
  const existingCount = await db.admission.count({
    where: {
      schoolId,
      admissionNumber: { startsWith: yearPrefix },
    },
  })

  const sequence = (existingCount + 1).toString().padStart(3, '0')
  let admissionNumber = `${yearPrefix}${sequence}`

  // Ensure uniqueness across BOTH Admission and Student tables
  let exists = await admissionNumberExists(admissionNumber)

  let retryCount = 0
  while (exists && retryCount < 50) {
    retryCount++
    const newSeq = (existingCount + 1 + retryCount).toString().padStart(3, '0')
    admissionNumber = `${yearPrefix}${newSeq}`
    exists = await admissionNumberExists(admissionNumber)
  }

  return admissionNumber
}

// GET /api/school/admissions/next-number - Preview the next admission number
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    // Check admission:read permission for non-SUPER_ADMIN
    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:read')
      if (!authorized) {
        return forbiddenError("You don't have access to the Admissions section. Please contact your school administrator.")
      }
    }

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId') || undefined

    const nextAdmissionNumber = await generateAdmissionNumber(user.schoolId, classId)

    return NextResponse.json({ nextAdmissionNumber })
  } catch (error) {
    console.error('Preview next admission number error:', error)
    return internalError('previewing next admission number')
  }
}
