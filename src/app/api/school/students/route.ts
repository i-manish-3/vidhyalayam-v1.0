import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

async function resolveAcademicYear(schoolId: string, value: string | null) {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const academicYear = (value || school?.academicYear || '').trim()
  return ACADEMIC_YEAR_PATTERN.test(academicYear) ? academicYear : null
}

// GET /api/school/students - List students with pagination, search, filter
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SUPER_ADMIN' && user.role !== 'TEACHER') {
      const authorized = await requirePermission(request, 'student:read')
      if (!authorized) return forbiddenError("You don't have permission to view students.")
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const classId = searchParams.get('classId') || ''
    const sectionId = searchParams.get('sectionId') || ''
    const gender = searchParams.get('gender') || ''
    const isActiveParam = searchParams.get('isActive') || ''
    const academicYear = await resolveAcademicYear(user.schoolId, searchParams.get('academicYear'))
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }
    if (academicYear) {
      const enrollmentFilter: Record<string, unknown> = { academicYear, deletedAt: null }
      if (classId) enrollmentFilter.classId = classId
      if (sectionId) enrollmentFilter.sectionId = sectionId
      where.AND = [
        {
          OR: [
            { academicEnrollments: { some: enrollmentFilter } },
            {
              admission: {
                academicYear,
                ...(classId ? { classId } : {}),
                ...(sectionId ? { sectionId } : {}),
              },
            },
          ],
        },
      ]
    }

    if (search) {
      const searchTerms = search.trim().split(/\s+/).filter(Boolean)
      const nameTermFilters = searchTerms.map((term) => ({
        OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
        ],
      }))
      const matchingAdmissionStudentIds = await db.admission.findMany({
        where: {
          schoolId: user.schoolId,
          registrationNumber: { contains: search, mode: 'insensitive' },
        },
        select: { studentId: true },
      })
      const admissionStudentIds = matchingAdmissionStudentIds
        .map(a => a.studentId)
        .filter((id): id is string => id !== null)

      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        ...(nameTermFilters.length > 1 ? [{ AND: nameTermFilters }] : []),
        { rollNumber: { contains: search, mode: 'insensitive' } },
        { aadhaarNumber: { contains: search, mode: 'insensitive' } },
        { admissionNumber: { contains: search, mode: 'insensitive' } },
        ...(admissionStudentIds.length > 0 ? [{ id: { in: admissionStudentIds } }] : []),
      ]
    }
    if (!academicYear && classId) where.classId = classId
    if (!academicYear && sectionId) where.sectionId = sectionId
    if (gender) where.gender = gender
    if (isActiveParam === 'true') where.isActive = true
    else if (isActiveParam === 'false') where.isActive = false

    const [students, total] = await Promise.all([
      db.student.findMany({
        where,
        include: {
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          admission: {
            select: {
              registrationNumber: true,
              transportRouteId: true,
              dateOfAdmission: true,
              profileImage: true,
            },
          },
          parentLinks: {
            include: {
              parent: {
                select: { id: true, fatherName: true, motherName: true, phone: true },
              },
            },
          },
          ...(academicYear
            ? {
                academicEnrollments: {
                  where: { academicYear, deletedAt: null },
                  include: {
                    class: { select: { id: true, name: true } },
                    section: { select: { id: true, name: true } },
                  },
                  take: 1,
                },
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      db.student.count({ where }),
    ])

    // Resolve transport route names
    const transportRouteIds = [
      ...new Set(
        students
          .map(s => s.admission?.transportRouteId)
          .filter((id): id is string => !!id)
      ),
    ]

    let routeMap: Record<string, string> = {}
    if (transportRouteIds.length > 0) {
      const routes = await db.transportRoute.findMany({
        where: { id: { in: transportRouteIds } },
        select: { id: true, routeName: true },
      })
      routeMap = Object.fromEntries(routes.map(r => [r.id, r.routeName]))
    }

    return NextResponse.json({
      students: students.map((s) => {
        const enrollment = academicYear
          ? (s as unknown as { academicEnrollments?: Array<{ classId: string; sectionId: string | null; rollNumber: string | null; class: { id: string; name: string } | null; section: { id: string; name: string } | null }> }).academicEnrollments?.[0]
          : undefined
        const sessionClass = enrollment?.class || s.class
        const sessionSection = enrollment?.section || s.section
        const sessionRollNumber = enrollment?.rollNumber ?? s.rollNumber
        return {
          ...s,
          class: sessionClass,
          section: sessionSection,
          rollNumber: sessionRollNumber,
          fullName: `${s.firstName} ${s.lastName}`,
          transportRouteName: s.admission?.transportRouteId
            ? routeMap[s.admission.transportRouteId] || null
            : null,
        }
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List students error:', error)
    return internalError('loading students')
  }
}

// POST /api/school/students - Create student
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'student:create')
      if (!authorized) return forbiddenError("You don't have permission to create students.")
    }

    const body = await request.json()
    const {
      firstName,
      lastName,
      classId,
      sectionId,
      rollNumber,
      dateOfBirth,
      gender,
      address,
      city,
      state,
      pincode,
      aadhaarNumber,
      bloodGroup,
      admissionDate,
      previousSchool,
      profileImage,
      // Parent info
      parentInfo,
    } = body

    if (!firstName || !lastName || !classId || !sectionId) {
      return apiError(400, 'Please fill in the student\'s first name, last name, class, and section to continue.')
    }

    // Verify class and section belong to this school
    const classRecord = await db.class.findFirst({
      where: { id: classId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!classRecord) {
      return apiError(400, 'The class you selected doesn\'t exist anymore. It may have been removed. Please refresh the page and try again.')
    }

    const sectionRecord = await db.section.findFirst({
      where: { id: sectionId, schoolId: user.schoolId, classId, deletedAt: null },
    })
    if (!sectionRecord) {
      return apiError(400, 'The section you selected doesn\'t exist anymore. It may have been removed. Please refresh the page and try again.')
    }

    const academicYear = await resolveAcademicYear(user.schoolId, null)
    if (!academicYear) {
      return apiError(400, 'No active academic year configured for this school. Please set one before adding students.')
    }

    const admissionDateValue = admissionDate ? new Date(admissionDate) : new Date()

    const student = await db.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: {
          schoolId: user.schoolId!,
          firstName,
          lastName,
          classId,
          sectionId,
          rollNumber,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          gender,
          address,
          city,
          state,
          pincode,
          aadhaarNumber,
          bloodGroup,
          admissionDate: admissionDateValue,
          previousSchool,
          profileImage,
        },
      })

      // Enrollment row for the school's active session — mirrors the admissions flow
      // so the student-detail / view-attendance / fees pages can find this student
      // by academic year.
      await tx.studentAcademicEnrollment.create({
        data: {
          schoolId: user.schoolId!,
          studentId: created.id,
          academicYear,
          classId,
          sectionId,
          rollNumber: rollNumber || null,
          status: 'active',
          source: 'direct',
          effectiveFrom: admissionDateValue,
          createdBy: user.userId,
        },
      })

      if (parentInfo) {
        const parent = await tx.parent.create({
          data: {
            schoolId: user.schoolId!,
            fatherName: parentInfo.fatherName,
            motherName: parentInfo.motherName,
            phone: parentInfo.phone,
            alternatePhone: parentInfo.alternatePhone,
            email: parentInfo.email,
            occupation: parentInfo.occupation,
            address: parentInfo.address,
            annualIncome: parentInfo.annualIncome,
          },
        })

        await tx.studentParent.create({
          data: {
            studentId: created.id,
            parentId: parent.id,
            relation: parentInfo.relation || 'Father',
            isPrimary: true,
          },
        })
      }

      return created
    })

    return NextResponse.json(student, { status: 201 })
  } catch (error) {
    console.error('Create student error:', error)
    return internalError('creating the student record')
  }
}
