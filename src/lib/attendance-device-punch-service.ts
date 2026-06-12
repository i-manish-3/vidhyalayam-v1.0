import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { isSchoolTeachingDay } from '@/lib/academic-calendar'
import { ingestTap, type TapResultCode } from '@/lib/attendance-tap-service'
import { resolveLocalDate } from '@/lib/timezone'
import { ZKTECO_PROVIDER } from '@/lib/zkteco-adms'

export type AttendancePersonType = 'student' | 'teacher' | 'staff'

export type DevicePunchResultCode =
  | 'marked'
  | 'updated'
  | 'duplicate'
  | 'duplicate_event'
  | 'unknown_device'
  | 'unknown_user'
  | 'unknown_card'
  | 'inactive_credential'
  | 'card_revoked'
  | 'enrollment_missing'
  | 'finalized'
  | 'non_teaching'
  | 'invalid_uid'
  | 'ignored'

export interface DevicePunchInput {
  provider: typeof ZKTECO_PROVIDER
  serialNo: string
  deviceUserId: string
  punchTime: Date
  verifyMode?: string
  punchStatus?: string
  workCode?: string | null
  rawLine: string
  remoteIp?: string | null
}

export interface DevicePunchResult {
  result: DevicePunchResultCode
  personType?: AttendancePersonType
  personId?: string
  personName?: string
  date?: string
  message?: string
}

export async function ingestAttendanceDevicePunch(input: DevicePunchInput): Promise<DevicePunchResult> {
  const serialNo = input.serialNo.trim()
  const deviceUserId = input.deviceUserId.trim()
  const verifyMode = input.verifyMode ?? ''
  const punchStatus = input.punchStatus ?? ''

  if (!serialNo || !deviceUserId || Number.isNaN(input.punchTime.getTime())) {
    return { result: 'ignored', message: 'Punch payload is incomplete.' }
  }

  const device = await db.attendanceDevice.findUnique({
    where: { serialNo },
    select: {
      id: true,
      schoolId: true,
      isActive: true,
      deletedAt: true,
      school: { select: { academicYear: true, timezone: true } },
    },
  })

  if (!device || !device.isActive || device.deletedAt) {
    return { result: 'unknown_device', message: 'Attendance device is not registered or active.' }
  }

  await db.attendanceDevice
    .update({
      where: { id: device.id },
      data: { lastSeenAt: new Date(), lastSeenIp: input.remoteIp ?? undefined },
    })
    .catch(() => {})

  const existingPunch = await db.attendanceDevicePunchLog.findUnique({
    where: {
      serialNo_deviceUserId_punchTime_verifyMode_punchStatus: {
        serialNo,
        deviceUserId,
        punchTime: input.punchTime,
        verifyMode,
        punchStatus,
      },
    },
    select: {
      result: true,
      personType: true,
      personId: true,
    },
  })

  if (existingPunch) {
    return {
      result: 'duplicate_event',
      personType: asPersonType(existingPunch.personType),
      personId: existingPunch.personId ?? undefined,
      message: 'Punch was already processed.',
    }
  }

  const credential = await db.attendanceCredential.findFirst({
    where: {
      schoolId: device.schoolId,
      provider: input.provider,
      credentialValue: deviceUserId,
      isActive: true,
      revokedAt: null,
    },
    orderBy: [{ deviceId: 'desc' }, { assignedAt: 'desc' }],
  })

  if (!credential) {
    const studentTap = await ingestTap({
      schoolId: device.schoolId,
      uid: deviceUserId,
      source: 'webhook',
      deviceId: null,
      tappedAt: input.punchTime,
    })
    const result = mapTapResultToPunchResult(studentTap.result)

    await createPunchLog(input, device, {
      personType: studentTap.student ? 'student' : null,
      personId: studentTap.student?.id ?? null,
      result,
      errorDetail: studentTap.message ?? (studentTap.result === 'unknown_card' ? 'No employee credential or student RFID card mapping for device user id.' : null),
    })

    if (studentTap.student) {
      return {
        result,
        personType: 'student',
        personId: studentTap.student.id,
        personName: `${studentTap.student.firstName} ${studentTap.student.lastName}`,
        date: studentTap.date,
        message: studentTap.message,
      }
    }

    return {
      result,
      date: studentTap.date,
      message: studentTap.message ?? 'Device user is not mapped to any student or employee.',
    }
  }

  if (credential.deviceId && credential.deviceId !== device.id) {
    await createPunchLog(input, device, {
      credentialId: credential.id,
      personType: credential.personType,
      personId: credential.personId,
      result: 'inactive_credential',
      errorDetail: 'Credential belongs to another device.',
    })
    return { result: 'inactive_credential', message: 'Credential is not assigned to this device.' }
  }

  const personType = asPersonType(credential.personType)
  if (!personType) {
    await createPunchLog(input, device, {
      credentialId: credential.id,
      personType: credential.personType,
      personId: credential.personId,
      result: 'unknown_user',
      errorDetail: 'Unsupported person type.',
    })
    return { result: 'unknown_user', message: 'Credential has an unsupported person type.' }
  }

  const academicYear = device.school.academicYear
  if (credential.academicYear && personType === 'student' && credential.academicYear !== academicYear) {
    await createPunchLog(input, device, {
      credentialId: credential.id,
      personType,
      personId: credential.personId,
      result: 'inactive_credential',
      errorDetail: 'Student credential is not valid for current academic year.',
    })
    return { result: 'inactive_credential', message: 'Student credential is not valid for the current academic year.' }
  }

  const date = resolveLocalDate(device.school.timezone, input.punchTime)
  const teaching = await isSchoolTeachingDay(device.schoolId, academicYear, date)
  if (!teaching.teaching) {
    await createPunchLog(input, device, {
      credentialId: credential.id,
      personType,
      personId: credential.personId,
      result: 'non_teaching',
      errorDetail: teaching.reason,
    })
    return {
      result: 'non_teaching',
      personType,
      personId: credential.personId,
      date: formatLocalDate(date),
      message: teaching.reason === 'holiday' ? `${teaching.holiday?.name || 'Holiday'} - attendance not marked.` : 'School is closed today.',
    }
  }

  if (personType === 'student') {
    return markStudentPresent({ input, device, credential, date, academicYear })
  }

  return markEmployeePresent({ input, device, credential, date, academicYear, personType })
}

interface PunchContext {
  input: DevicePunchInput
  device: {
    id: string
    schoolId: string
  }
  credential: {
    id: string
    personType: string
    personId: string
  }
  date: Date
  academicYear: string
}

async function markStudentPresent(ctx: PunchContext): Promise<DevicePunchResult> {
  const student = await db.student.findFirst({
    where: {
      id: ctx.credential.personId,
      schoolId: ctx.device.schoolId,
      deletedAt: null,
      OR: [
        { academicEnrollments: { some: { academicYear: ctx.academicYear, deletedAt: null } } },
        { admission: { academicYear: ctx.academicYear } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  })

  if (!student) {
    await createPunchLog(ctx.input, ctx.device, {
      credentialId: ctx.credential.id,
      personType: 'student',
      personId: ctx.credential.personId,
      result: 'unknown_user',
      errorDetail: 'Student not active or not enrolled in current academic year.',
    })
    return { result: 'unknown_user', message: 'Mapped student is not active in the current academic year.' }
  }

  const outcome = await db.$transaction(async (tx) => {
    const existing = await tx.attendance.findUnique({
      where: {
        schoolId_studentId_date: {
          schoolId: ctx.device.schoolId,
          studentId: student.id,
          date: ctx.date,
        },
      },
      select: { status: true, finalized: true },
    })

    if (existing?.finalized) {
      await createPunchLogTx(tx, ctx.input, ctx.device, {
        credentialId: ctx.credential.id,
        personType: 'student',
        personId: student.id,
        result: 'finalized',
      })
      return 'finalized' as const
    }

    if (existing?.status === 'present') {
      await createPunchLogTx(tx, ctx.input, ctx.device, {
        credentialId: ctx.credential.id,
        personType: 'student',
        personId: student.id,
        result: 'duplicate',
      })
      return 'duplicate' as const
    }

    await tx.attendance.upsert({
      where: {
        schoolId_studentId_date: {
          schoolId: ctx.device.schoolId,
          studentId: student.id,
          date: ctx.date,
        },
      },
      create: {
        schoolId: ctx.device.schoolId,
        studentId: student.id,
        academicYear: ctx.academicYear,
        date: ctx.date,
        status: 'present',
        markedBy: null,
        markedSource: ctx.input.provider,
      },
      update: {
        status: 'present',
        markedBy: null,
        markedSource: ctx.input.provider,
      },
    })

    const result = existing ? 'updated' : 'marked'
    await createPunchLogTx(tx, ctx.input, ctx.device, {
      credentialId: ctx.credential.id,
      personType: 'student',
      personId: student.id,
      result,
    })
    return result
  })

  return {
    result: outcome,
    personType: 'student',
    personId: student.id,
    personName: `${student.firstName} ${student.lastName}`,
    date: formatLocalDate(ctx.date),
  }
}

async function markEmployeePresent(
  ctx: PunchContext & { personType: 'teacher' | 'staff' },
): Promise<DevicePunchResult> {
  const person =
    ctx.personType === 'teacher'
      ? await db.teacher.findFirst({
          where: { id: ctx.credential.personId, schoolId: ctx.device.schoolId, deletedAt: null, isActive: true },
          select: { id: true, firstName: true, lastName: true },
        })
      : await db.staff.findFirst({
          where: { id: ctx.credential.personId, schoolId: ctx.device.schoolId, deletedAt: null, isActive: true },
          select: { id: true, firstName: true, lastName: true },
        })

  if (!person) {
    await createPunchLog(ctx.input, ctx.device, {
      credentialId: ctx.credential.id,
      personType: ctx.personType,
      personId: ctx.credential.personId,
      result: 'unknown_user',
      errorDetail: 'Employee not active.',
    })
    return { result: 'unknown_user', message: 'Mapped employee is not active.' }
  }

  const outcome = await db.$transaction(async (tx) => {
    const existing = await tx.employeeAttendance.findUnique({
      where: {
        schoolId_staffType_staffId_date: {
          schoolId: ctx.device.schoolId,
          staffType: ctx.personType,
          staffId: person.id,
          date: ctx.date,
        },
      },
      select: { status: true, finalized: true },
    })

    if (existing?.finalized) {
      await createPunchLogTx(tx, ctx.input, ctx.device, {
        credentialId: ctx.credential.id,
        personType: ctx.personType,
        personId: person.id,
        result: 'finalized',
      })
      return 'finalized' as const
    }

    if (existing?.status === 'present') {
      await createPunchLogTx(tx, ctx.input, ctx.device, {
        credentialId: ctx.credential.id,
        personType: ctx.personType,
        personId: person.id,
        result: 'duplicate',
      })
      return 'duplicate' as const
    }

    await tx.employeeAttendance.upsert({
      where: {
        schoolId_staffType_staffId_date: {
          schoolId: ctx.device.schoolId,
          staffType: ctx.personType,
          staffId: person.id,
          date: ctx.date,
        },
      },
      create: {
        schoolId: ctx.device.schoolId,
        staffType: ctx.personType,
        staffId: person.id,
        academicYear: ctx.academicYear,
        date: ctx.date,
        status: 'present',
        markedBy: null,
        markedSource: ctx.input.provider,
      },
      update: {
        status: 'present',
        markedBy: null,
        markedSource: ctx.input.provider,
      },
    })

    const result = existing ? 'updated' : 'marked'
    await createPunchLogTx(tx, ctx.input, ctx.device, {
      credentialId: ctx.credential.id,
      personType: ctx.personType,
      personId: person.id,
      result,
    })
    return result
  })

  return {
    result: outcome,
    personType: ctx.personType,
    personId: person.id,
    personName: `${person.firstName} ${person.lastName}`,
    date: formatLocalDate(ctx.date),
  }
}

type PunchLogMeta = {
  credentialId?: string | null
  personType?: string | null
  personId?: string | null
  result: DevicePunchResultCode
  errorDetail?: string | null
}

async function createPunchLog(
  input: DevicePunchInput,
  device: { id: string; schoolId: string },
  meta: PunchLogMeta,
) {
  await db.attendanceDevicePunchLog.create({
    data: buildPunchLogData(input, device, meta),
  })
}

async function createPunchLogTx(
  tx: Prisma.TransactionClient,
  input: DevicePunchInput,
  device: { id: string; schoolId: string },
  meta: PunchLogMeta,
) {
  await tx.attendanceDevicePunchLog.create({
    data: buildPunchLogData(input, device, meta),
  })
}

function buildPunchLogData(
  input: DevicePunchInput,
  device: { id: string; schoolId: string },
  meta: PunchLogMeta,
) {
  return {
    schoolId: device.schoolId,
    deviceId: device.id,
    serialNo: input.serialNo.trim(),
    provider: input.provider,
    deviceUserId: input.deviceUserId.trim(),
    personType: meta.personType ?? null,
    personId: meta.personId ?? null,
    credentialId: meta.credentialId ?? null,
    punchTime: input.punchTime,
    verifyMode: input.verifyMode ?? '',
    punchStatus: input.punchStatus ?? '',
    workCode: input.workCode ?? null,
    rawLine: input.rawLine.slice(0, 1000),
    result: meta.result,
    errorDetail: meta.errorDetail ?? null,
  }
}

function asPersonType(value: string | null): AttendancePersonType | undefined {
  return value === 'student' || value === 'teacher' || value === 'staff' ? value : undefined
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mapTapResultToPunchResult(result: TapResultCode): DevicePunchResultCode {
  if (result === 'unknown_card') return 'unknown_card'
  if (result === 'card_revoked') return 'card_revoked'
  if (result === 'enrollment_missing') return 'enrollment_missing'
  if (result === 'invalid_uid') return 'invalid_uid'
  return result
}
