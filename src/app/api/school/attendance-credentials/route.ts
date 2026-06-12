import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError } from '@/lib/api-errors'
import { ZKTECO_PROVIDER } from '@/lib/zkteco-adms'

const PERSON_TYPES = new Set(['student', 'teacher', 'staff'])
const CREDENTIAL_TYPES = new Set(['zkteco_pin', 'fingerprint', 'zkteco_card_no'])

export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'rfid:devices:manage')
    if (!user?.schoolId) return apiError(403, "You don't have permission to view attendance credentials.")

    const { searchParams } = new URL(request.url)
    const personType = searchParams.get('personType') || undefined
    const personId = searchParams.get('personId') || undefined
    const deviceId = searchParams.get('deviceId') || undefined

    const credentials = await db.attendanceCredential.findMany({
      where: {
        schoolId: user.schoolId,
        ...(personType && PERSON_TYPES.has(personType) ? { personType } : {}),
        ...(personId ? { personId } : {}),
        ...(deviceId ? { deviceId } : {}),
      },
      include: {
        device: { select: { id: true, name: true, serialNo: true, provider: true } },
      },
      orderBy: [{ isActive: 'desc' }, { assignedAt: 'desc' }],
    })

    const withPeople = await Promise.all(
      credentials.map(async (credential) => ({
        ...credential,
        person: await loadPerson(user.schoolId!, credential.personType, credential.personId),
      })),
    )

    return NextResponse.json({ credentials: withPeople })
  } catch (error) {
    console.error('List attendance credentials error:', error)
    return internalError('loading attendance credentials')
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'rfid:devices:manage')
    if (!user?.schoolId) return apiError(403, "You don't have permission to manage attendance credentials.")

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError(400, 'Body missing.')

    const provider = normalizeString(body.provider) || ZKTECO_PROVIDER
    const credentialType = normalizeString(body.credentialType) || 'zkteco_pin'
    const credentialValue = normalizeString(body.credentialValue)
    const personType = normalizeString(body.personType)
    const personId = normalizeString(body.personId)
    const deviceId = normalizeString(body.deviceId) || null
    const academicYear = normalizeString(body.academicYear) || null

    if (provider !== ZKTECO_PROVIDER) return apiError(400, 'Only ZKTeco ADMS credentials are supported here.')
    if (!CREDENTIAL_TYPES.has(credentialType)) return apiError(400, 'Unsupported credential type.')
    if (!credentialValue) return apiError(400, 'Credential value is required.')
    if (!PERSON_TYPES.has(personType) || !personId) return apiError(400, 'Please choose a student, teacher, or staff member.')

    const person = await loadPerson(user.schoolId, personType, personId)
    if (!person) return apiError(404, 'Selected person was not found or is inactive.')

    if (deviceId) {
      const device = await db.attendanceDevice.findFirst({
        where: { id: deviceId, schoolId: user.schoolId, provider, deletedAt: null },
        select: { id: true },
      })
      if (!device) return apiError(404, 'Selected attendance device was not found.')
    }

    const duplicate = await db.attendanceCredential.findFirst({
      where: {
        schoolId: user.schoolId,
        provider,
        credentialValue,
        isActive: true,
        revokedAt: null,
      },
      select: { id: true },
    })
    if (duplicate) return apiError(409, 'This ZKTeco User/PIN is already assigned.')

    if (personType === 'student' && academicYear) {
      const enrolled = await db.student.findFirst({
        where: {
          id: personId,
          schoolId: user.schoolId,
          deletedAt: null,
          OR: [
            { academicEnrollments: { some: { academicYear, deletedAt: null } } },
            { admission: { academicYear } },
          ],
        },
        select: { id: true },
      })
      if (!enrolled) return apiError(400, 'Student is not enrolled in the selected academic year.')
    }

    const credential = await db.attendanceCredential.create({
      data: {
        schoolId: user.schoolId,
        deviceId,
        provider,
        credentialType,
        credentialValue,
        personType,
        personId,
        academicYear,
        assignedBy: user.userId,
      },
      include: {
        device: { select: { id: true, name: true, serialNo: true, provider: true } },
      },
    })

    return NextResponse.json({ credential: { ...credential, person } }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError(409, 'This device credential is already assigned.')
    }
    console.error('Create attendance credential error:', error)
    return internalError('creating attendance credential')
  }
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function loadPerson(schoolId: string, personType: string, personId: string) {
  if (personType === 'student') {
    const student = await db.student.findFirst({
      where: { id: personId, schoolId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, admissionNumber: true },
    })
    return student
      ? {
          id: student.id,
          type: 'student',
          name: `${student.firstName} ${student.lastName}`,
          code: student.admissionNumber,
        }
      : null
  }

  if (personType === 'teacher') {
    const teacher = await db.teacher.findFirst({
      where: { id: personId, schoolId, deletedAt: null, isActive: true },
      select: { id: true, firstName: true, lastName: true, employeeId: true },
    })
    return teacher
      ? {
          id: teacher.id,
          type: 'teacher',
          name: `${teacher.firstName} ${teacher.lastName}`,
          code: teacher.employeeId,
        }
      : null
  }

  if (personType === 'staff') {
    const staff = await db.staff.findFirst({
      where: { id: personId, schoolId, deletedAt: null, isActive: true },
      select: { id: true, firstName: true, lastName: true, employeeId: true },
    })
    return staff
      ? {
          id: staff.id,
          type: 'staff',
          name: `${staff.firstName} ${staff.lastName}`,
          code: staff.employeeId,
        }
      : null
  }

  return null
}
