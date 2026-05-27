import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { hashPassword } from '@/lib/auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'
import { uploadIfDataUrl, IMAGE_MIME_TYPES } from '@/lib/storage'
import { employeeIdExists, normalizeEmployeeId, resolveEmployeeId } from '@/lib/employee-numbering'

const DEFAULT_STAFF_PASSWORD = 'staff123'

// Identity/system roles that cannot be assigned via staff creation.
const RESTRICTED_STAFF_ROLES = new Set(['School Admin', 'Student', 'Parent', 'Staff', 'Teacher', 'Transport'])

function localStaffEmail(phone: string, schoolId: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10)
  return `staff.${schoolId.slice(0, 8)}.${digits || Date.now()}@staff.local`
}

// GET /api/school/staff - List staff from Staff table joined with linked User for phone/email/role badges.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const staffRows = await db.staff.findMany({
      where: { schoolId: user.schoolId, deletedAt: null },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })

    const userIds = staffRows.map((s) => s.userId).filter(Boolean) as string[]
    const linkedUsers = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            phone: true,
            email: true,
            avatar: true,
            isActive: true,
            userRoles: {
              select: {
                role: { select: { id: true, name: true, color: true } },
              },
            },
          },
        })
      : []
    const userById = new Map(linkedUsers.map((u) => [u.id, u]))

    return NextResponse.json({
      staff: staffRows.map((s) => {
        const linked = s.userId ? userById.get(s.userId) : null
        return {
          id: s.id,
          employeeId: s.employeeId,
          firstName: s.firstName,
          lastName: s.lastName,
          name: `${s.firstName} ${s.lastName}`.trim(),
          gender: s.gender,
          designation: s.designation,
          department: s.department,
          qualification: s.qualification,
          experience: s.experience,
          phone: linked?.phone ?? null,
          email: linked?.email ?? null,
          avatar: s.profileImage ?? linked?.avatar ?? null,
          dob: s.dateOfBirth,
          joinDate: s.joinDate,
          isActive: s.isActive && (linked?.isActive ?? true),
          assignedRoles: linked?.userRoles.map((ur) => ({
            id: ur.role.id,
            name: ur.role.name,
            color: ur.role.color,
          })) ?? [],
        }
      }),
    })
  } catch (error) {
    console.error('List staff error:', error)
    return internalError('listing staff')
  }
}

// POST /api/school/staff - Create Staff profile + linked User login + role assignment.
export async function POST(request: NextRequest) {
  try {
    const authUser = await requirePermission(request, 'role:create')
    if (!authUser || !authUser.schoolId) {
      return apiError(403, "You don't have permission to create staff accounts.")
    }

    const body = await request.json()
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : ''
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : ''
    const gender = typeof body.gender === 'string' ? body.gender.trim() : ''
    const dob = typeof body.dob === 'string' ? body.dob.trim() : ''
    const joinDate = typeof body.joinDate === 'string' ? body.joinDate.trim() : ''
    const designation = typeof body.designation === 'string' ? body.designation.trim() : ''
    const department = typeof body.department === 'string' ? body.department.trim() : ''
    const qualification = typeof body.qualification === 'string' ? body.qualification.trim() : ''
    const experience = Number.isFinite(body.experience) ? Number(body.experience) : 0
    const address = typeof body.address === 'string' ? body.address.trim() : ''
    const emailInput = typeof body.email === 'string' ? body.email.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const avatar = body.avatar
    const roleId = typeof body.roleId === 'string' ? body.roleId : ''
    const requestedEmployeeId = normalizeEmployeeId(body.employeeId)

    if (!firstName || !lastName || !gender || !dob || !phone || !roleId) {
      return apiError(400, 'Please enter first name, last name, gender, DOB, phone, and select a role.')
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      return apiError(400, 'Phone must be 10 digits starting with 6, 7, 8 or 9.')
    }

    const parsedDob = new Date(dob)
    if (Number.isNaN(parsedDob.getTime())) {
      return apiError(400, 'Please enter a valid date of birth.')
    }

    let parsedJoinDate: Date | null = null
    if (joinDate) {
      const candidate = new Date(joinDate)
      if (Number.isNaN(candidate.getTime())) {
        return apiError(400, 'Please enter a valid join date.')
      }
      parsedJoinDate = candidate
    }

    if (emailInput && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput)) {
      return apiError(400, 'Please enter a valid email address.')
    }

    // Validate role
    const role = await db.role.findFirst({
      where: { id: roleId, schoolId: authUser.schoolId, deletedAt: null, isActive: true },
    })
    if (!role) {
      return apiError(400, "The role you selected doesn't exist. Please refresh and try again.")
    }
    if (RESTRICTED_STAFF_ROLES.has(role.name)) {
      return apiError(403, `The "${role.name}" role cannot be assigned to staff. Please choose a permission role like Accountant, Reception, etc.`)
    }

    // Phone uniqueness
    const existingPhone = await db.user.findFirst({
      where: { phone, deletedAt: null },
    })
    if (existingPhone) {
      return apiError(400, 'A user with this phone number already exists.')
    }

    if (requestedEmployeeId && await employeeIdExists(db, authUser.schoolId, requestedEmployeeId)) {
      return apiError(400, `Employee ID "${requestedEmployeeId}" is already in use.`)
    }

    // Email handling: real email if provided, else synthetic.
    let email = emailInput
    if (email) {
      const existingByEmail = await db.user.findUnique({ where: { email } })
      if (existingByEmail) {
        return apiError(400, 'A user with this email already exists.')
      }
    } else {
      email = localStaffEmail(phone, authUser.schoolId)
      const existing = await db.user.findUnique({ where: { email } })
      if (existing) {
        email = `staff.${authUser.schoolId.slice(0, 8)}.${Date.now()}@staff.local`
      }
    }

    const avatarUpload = await uploadIfDataUrl(avatar, {
      folder: `schools/${authUser.schoolId}/staff`,
      maxBytes: 1024 * 1024,
      allowedMimeTypes: IMAGE_MIME_TYPES,
    })
    if (avatarUpload.error) {
      return apiError(400, `Avatar: ${avatarUpload.error}`)
    }

    const hashedPwd = await hashPassword(DEFAULT_STAFF_PASSWORD)
    const fullName = `${firstName} ${lastName}`.trim()

    const created = await db.$transaction(async (tx) => {
      const finalEmployeeId = await resolveEmployeeId(tx, authUser.schoolId!, requestedEmployeeId)

      const newUser = await tx.user.create({
        data: {
          employeeId: finalEmployeeId,
          schoolId: authUser.schoolId!,
          name: fullName,
          email,
          password: hashedPwd,
          phone,
          avatar: avatarUpload.url ?? null,
          mustChangePassword: true,
          role: 'STAFF',
          isActive: true,
        },
      })

      await tx.userRole.create({
        data: { userId: newUser.id, roleId: role.id, assignedBy: authUser.userId },
      })

      const staff = await tx.staff.create({
        data: {
          schoolId: authUser.schoolId!,
          userId: newUser.id,
          employeeId: finalEmployeeId,
          firstName,
          lastName,
          gender,
          dateOfBirth: parsedDob,
          joinDate: parsedJoinDate,
          designation: designation || role.name,
          department: department || null,
          qualification: qualification || null,
          experience,
          address: address || null,
          profileImage: avatarUpload.url ?? null,
        },
      })

      return { staff, user: newUser }
    })

    return NextResponse.json(
      {
        id: created.staff.id,
        employeeId: created.staff.employeeId,
        firstName: created.staff.firstName,
        lastName: created.staff.lastName,
        name: fullName,
        email,
        phone,
        dob: created.staff.dateOfBirth,
        joinDate: created.staff.joinDate,
        designation: created.staff.designation,
        assignedRole: { id: role.id, name: role.name, color: role.color },
        message: `"${fullName}" can sign in with phone ${phone} and default password "${DEFAULT_STAFF_PASSWORD}". Password change required on first login.`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create staff error:', error)
    return internalError('creating the staff member')
  }
}
