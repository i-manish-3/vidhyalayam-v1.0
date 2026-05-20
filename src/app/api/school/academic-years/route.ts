import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

function cleanAcademicYear(value: unknown) {
  if (typeof value !== 'string') return null
  const year = value.trim()
  return ACADEMIC_YEAR_PATTERN.test(year) ? year : null
}

function addAcademicYear(years: Set<string>, value: string | null | undefined) {
  const year = value?.trim()
  if (year && ACADEMIC_YEAR_PATTERN.test(year)) {
    years.add(year)
  }
}

function parseDate(value: unknown) {
  if (!value) return null
  if (typeof value !== 'string') return null

  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

async function seedAcademicYearsFromSchoolData(schoolId: string) {
  const [
    school,
    admissionSettings,
    admissions,
    feeStructures,
    exams,
    transportRoutes,
  ] = await Promise.all([
    db.school.findUnique({
      where: { id: schoolId },
      select: { academicYear: true },
    }),
    db.admissionSetting.findMany({
      where: { schoolId },
      distinct: ['academicYear'],
      select: { academicYear: true },
    }),
    db.admission.findMany({
      where: { schoolId },
      distinct: ['academicYear'],
      select: { academicYear: true },
    }),
    db.feesStructure.findMany({
      where: { schoolId, deletedAt: null },
      distinct: ['academicYear'],
      select: { academicYear: true },
    }),
    db.exam.findMany({
      where: { schoolId, deletedAt: null },
      distinct: ['academicYear'],
      select: { academicYear: true },
    }),
    db.transportRoute.findMany({
      where: { schoolId, deletedAt: null },
      distinct: ['academicYear'],
      select: { academicYear: true },
    }),
  ])

  const years = new Set<string>()
  addAcademicYear(years, school?.academicYear)
  admissionSettings.forEach((item) => addAcademicYear(years, item.academicYear))
  admissions.forEach((item) => addAcademicYear(years, item.academicYear))
  feeStructures.forEach((item) => addAcademicYear(years, item.academicYear))
  exams.forEach((item) => addAcademicYear(years, item.academicYear))
  transportRoutes.forEach((item) => addAcademicYear(years, item.academicYear))

  const currentYear = cleanAcademicYear(school?.academicYear)
  const data = Array.from(years).map((name) => ({
    schoolId,
    name,
    isCurrent: currentYear ? name === currentYear : false,
    isActive: true,
  }))

  if (data.length > 0) {
    await db.academicYear.createMany({
      data,
      skipDuplicates: true,
    })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF', 'PARENT', 'STUDENT'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const includeDeleted = request.nextUrl.searchParams.get('includeDeleted') === 'true' && user.role === 'SCHOOL_ADMIN'
    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'
    let years = await db.academicYear.findMany({
      where: { schoolId: user.schoolId, deletedAt: null },
      orderBy: [{ isCurrent: 'desc' }, { name: 'desc' }],
    })

    if (years.length === 0) {
      await seedAcademicYearsFromSchoolData(user.schoolId)
      years = await db.academicYear.findMany({
        where: { schoolId: user.schoolId, deletedAt: null },
        orderBy: [{ isCurrent: 'desc' }, { name: 'desc' }],
      })
    }

    const deletedYears = includeDeleted
      ? await db.academicYear.findMany({
          where: { schoolId: user.schoolId, deletedAt: { not: null } },
          orderBy: [{ name: 'desc' }],
        })
      : []

    return NextResponse.json({
      academicYears: years
        .filter((year) => includeInactive || year.isActive)
        .map((year) => year.name),
      years,
      deletedYears,
    })
  } catch (error) {
    console.error('List academic years error:', error)
    return internalError('loading academic years')
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const name = cleanAcademicYear(body.name)
    const startDate = parseDate(body.startDate)
    const endDate = parseDate(body.endDate)

    if (!name) {
      return apiError(400, 'Please enter academic year in YYYY-YYYY format.')
    }
    if (startDate && endDate && startDate > endDate) {
      return apiError(400, 'Start date must be before end date.')
    }

    const year = await db.academicYear.create({
      data: {
        schoolId: user.schoolId!,
        name,
        startDate,
        endDate,
        isCurrent: false,
        isActive: true,
      },
    })

    return NextResponse.json({ year }, { status: 201 })
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      return apiError(400, 'This academic year already exists for your school.')
    }
    console.error('Create academic year error:', error)
    return internalError('creating academic year')
  }
}
