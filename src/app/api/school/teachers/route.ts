import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { hashPassword } from '@/lib/auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { uploadIfDataUrl, IMAGE_MIME_TYPES } from '@/lib/storage'

// GET /api/school/teachers - List teachers
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { employeeId: { contains: search } },
        { specialization: { contains: search } },
      ]
    }

    const [teachers, total] = await Promise.all([
      db.teacher.findMany({
        where,
        include: {
          salaryStructure: {
            select: { id: true, grossSalary: true, netSalary: true },
          },
        },
        orderBy: [{ firstName: 'asc' }],
        skip,
        take: limit,
      }),
      db.teacher.count({ where }),
    ])

    return NextResponse.json({
      teachers: teachers.map((t) => ({
        ...t,
        fullName: `${t.firstName} ${t.lastName}`,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List teachers error:', error)
    return internalError('loading teachers')
  }
}

// POST /api/school/teachers - Create teacher
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
      employeeId,
      dateOfBirth,
      gender,
      address,
      city,
      state,
      pincode,
      aadhaarNumber,
      qualification,
      specialization,
      experience,
      joinDate,
      profileImage,
      // Optional: create user account
      createAccount,
      email,
      password,
      phone,
    } = body

    if (!firstName || !lastName) {
      return apiError(400, 'Please enter the teacher\'s first name and last name.')
    }

    let userId: string | undefined

    // Create user account if requested
    if (createAccount && email && password) {
      const existingUser = await db.user.findUnique({ where: { email } })
      if (existingUser) {
        return apiError(400, 'A teacher with this email already exists. Please use a different email address.')
      }
      const hashedPwd = await hashPassword(password)

      // Create user and auto-assign "Teacher" predefined role
      const newUser = await db.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email,
            password: hashedPwd,
            name: `${firstName} ${lastName}`,
            phone,
            role: 'TEACHER',
            schoolId: user.schoolId,
          },
        })

        // Find the "Teacher" predefined role for this school
        const teacherRole = await tx.role.findFirst({
          where: {
            schoolId: user.schoolId!,
            name: 'Teacher',
            deletedAt: null,
            isActive: true,
          },
        })

        // Auto-assign the user to the Teacher role (inherits all Teacher permissions)
        if (teacherRole) {
          await tx.userRole.create({
            data: {
              userId: createdUser.id,
              roleId: teacherRole.id,
              assignedBy: user.userId,
            },
          })
        }

        return createdUser
      })
      userId = newUser.id
    }

    const photoUpload = await uploadIfDataUrl(profileImage, {
      folder: `schools/${user.schoolId}/teachers`,
      maxBytes: 2 * 1024 * 1024,
      allowedMimeTypes: IMAGE_MIME_TYPES,
    })
    if (photoUpload.error) {
      return apiError(400, `Profile image: ${photoUpload.error}`)
    }

    const teacher = await db.teacher.create({
      data: {
        schoolId: user.schoolId,
        userId,
        employeeId,
        firstName,
        lastName,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender,
        address,
        city,
        state,
        pincode,
        aadhaarNumber,
        qualification,
        specialization,
        experience: experience || 0,
        joinDate: joinDate ? new Date(joinDate) : new Date(),
        profileImage: photoUpload.url ?? null,
      },
    })

    return NextResponse.json(teacher, { status: 201 })
  } catch (error) {
    console.error('Create teacher error:', error)
    return internalError('creating the teacher record')
  }
}
