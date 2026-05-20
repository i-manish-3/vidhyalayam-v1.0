import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { apiError, forbiddenError, internalError, unauthorizedError } from '@/lib/api-errors'
import { formatSchoolNumber } from '@/lib/admission-numbering'

const FORMAT_PATTERN = /^[A-Za-z0-9{}_\-\/]+$/
const TOKEN_PATTERN = /\{(PREFIX|YEAR|YY|SEQ|CLASS)\}/g

function cleanText(value: unknown, fallback: string) {
  return typeof value === 'string' ? value.trim().toUpperCase() || fallback : fallback
}

function cleanNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

function cleanBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function validateFormat(format: string) {
  if (!FORMAT_PATTERN.test(format)) return false
  if (!format.includes('{SEQ}')) return false

  const stripped = format.replace(TOKEN_PATTERN, '')
  return !/[{}]/.test(stripped)
}

function sample(format: string, prefix: string, digits: number) {
  return formatSchoolNumber({
    format,
    prefix,
    sequence: 1,
    digits,
    classId: 'CLASS',
  })
}

export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:read')
      if (!authorized) return forbiddenError("You don't have access to admission settings.")
    }

    const settings = await db.admissionSetting.upsert({
      where: { schoolId: user.schoolId },
      update: {},
      create: { schoolId: user.schoolId },
    })

    return NextResponse.json({
      settings,
      samples: {
        admissionNumber: sample(settings.admissionNumberFormat, settings.admissionNumberPrefix, settings.sequenceDigits),
        registrationNumber: sample(settings.registrationNumberFormat, settings.registrationNumberPrefix, settings.registrationSequenceDigits),
      },
    })
  } catch (error) {
    console.error('Load admission settings error:', error)
    return internalError('loading admission settings')
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user?.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:update')
      if (!authorized) return forbiddenError("You don't have permission to update admission settings.")
    }

    const body = await request.json()
    const admissionNumberPrefix = cleanText(body.admissionNumberPrefix, 'STD')
    const admissionNumberFormat = cleanText(body.admissionNumberFormat, '{PREFIX}-{YEAR}-{SEQ}')
    const sequenceStart = cleanNumber(body.sequenceStart, 1, 1, 999999)
    const sequenceDigits = cleanNumber(body.sequenceDigits, 3, 1, 10)
    const resetSequenceYearly = cleanBoolean(body.resetSequenceYearly, true)

    const registrationNumberPrefix = cleanText(body.registrationNumberPrefix, 'REG')
    const registrationNumberFormat = cleanText(body.registrationNumberFormat, '{PREFIX}-{YEAR}-{SEQ}')
    const registrationSequenceStart = cleanNumber(body.registrationSequenceStart, 1, 1, 999999)
    const registrationSequenceDigits = cleanNumber(body.registrationSequenceDigits, 3, 1, 10)
    const registrationResetYearly = cleanBoolean(body.registrationResetYearly, true)

    if (!validateFormat(admissionNumberFormat)) {
      return apiError(400, 'Admission number format must include {SEQ} and only use supported tokens.')
    }
    if (!validateFormat(registrationNumberFormat)) {
      return apiError(400, 'Registration number format must include {SEQ} and only use supported tokens.')
    }

    const settings = await db.admissionSetting.upsert({
      where: { schoolId: user.schoolId },
      create: {
        schoolId: user.schoolId,
        admissionNumberPrefix,
        admissionNumberFormat,
        sequenceStart,
        sequenceDigits,
        resetSequenceYearly,
        registrationNumberPrefix,
        registrationNumberFormat,
        registrationSequenceStart,
        registrationSequenceDigits,
        registrationResetYearly,
      },
      update: {
        admissionNumberPrefix,
        admissionNumberFormat,
        sequenceStart,
        sequenceDigits,
        resetSequenceYearly,
        registrationNumberPrefix,
        registrationNumberFormat,
        registrationSequenceStart,
        registrationSequenceDigits,
        registrationResetYearly,
      },
    })

    return NextResponse.json({
      settings,
      samples: {
        admissionNumber: sample(settings.admissionNumberFormat, settings.admissionNumberPrefix, settings.sequenceDigits),
        registrationNumber: sample(settings.registrationNumberFormat, settings.registrationNumberPrefix, settings.registrationSequenceDigits),
      },
    })
  } catch (error) {
    console.error('Update admission settings error:', error)
    return internalError('saving admission settings')
  }
}
