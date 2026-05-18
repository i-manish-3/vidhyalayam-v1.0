import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/students - List students with pagination, search, filter
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const classId = searchParams.get('classId') || ''
    const sectionId = searchParams.get('sectionId') || ''
    const gender = searchParams.get('gender') || ''
    const isActiveParam = searchParams.get('isActive') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }

    if (search) {
      // Also search in admission.registrationNumber
      const matchingAdmissionStudentIds = await db.admission.findMany({
        where: {
          schoolId: user.schoolId,
          registrationNumber: { contains: search },
        },
        select: { studentId: true },
      })
      const admissionStudentIds = matchingAdmissionStudentIds
        .map(a => a.studentId)
        .filter((id): id is string => id !== null)

      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { rollNumber: { contains: search } },
        { aadhaarNumber: { contains: search } },
        { admissionNumber: { contains: search } },
        ...(admissionStudentIds.length > 0 ? [{ id: { in: admissionStudentIds } }] : []),
      ]
    }
    if (classId) where.classId = classId
    if (sectionId) where.sectionId = sectionId
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
      students: students.map((s) => ({
        ...s,
        fullName: `${s.firstName} ${s.lastName}`,
        transportRouteName: s.admission?.transportRouteId
          ? routeMap[s.admission.transportRouteId] || null
          : null,
      })),
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
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
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

    const student = await db.student.create({
      data: {
        schoolId: user.schoolId,
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
        admissionDate: admissionDate ? new Date(admissionDate) : new Date(),
        previousSchool,
        profileImage,
      },
    })

    // Create parent if parent info is provided
    if (parentInfo) {
      const parent = await db.parent.create({
        data: {
          schoolId: user.schoolId,
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

      await db.studentParent.create({
        data: {
          studentId: student.id,
          parentId: parent.id,
          relation: parentInfo.relation || 'Father',
          isPrimary: true,
        },
      })
    }

    return NextResponse.json(student, { status: 201 })
  } catch (error) {
    console.error('Create student error:', error)
    return internalError('creating the student record')
  }
}
