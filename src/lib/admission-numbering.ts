import { db } from '@/lib/db'

type NumberKind = 'admission' | 'registration'

type NumberingSettings = {
  admissionNumberPrefix: string
  admissionNumberFormat: string
  sequenceStart: number
  sequenceDigits: number
  resetSequenceYearly: boolean
  registrationNumberPrefix?: string
  registrationNumberFormat?: string
  registrationSequenceStart?: number
  registrationSequenceDigits?: number
  registrationResetYearly?: boolean
}

export type AdmissionNumberPreview = {
  nextAdmissionNumber: string
  nextRegistrationNumber: string
}

const DEFAULT_ADMISSION = {
  prefix: 'STD',
  format: '{PREFIX}-{YEAR}-{SEQ}',
  start: 1,
  digits: 3,
  resetYearly: true,
}

const DEFAULT_REGISTRATION = {
  prefix: 'REG',
  format: '{PREFIX}-{YEAR}-{SEQ}',
  start: 1,
  digits: 3,
  resetYearly: true,
}

function getYearBounds() {
  const now = new Date()
  return {
    year: now.getFullYear().toString(),
    yearShort: now.getFullYear().toString().slice(-2),
    start: new Date(now.getFullYear(), 0, 1),
    end: new Date(now.getFullYear() + 1, 0, 1),
  }
}

function normalizeClassToken(classId?: string | null) {
  return classId ? `C${classId}` : ''
}

export function formatSchoolNumber(args: {
  format: string
  prefix: string
  sequence: number
  digits: number
  classId?: string | null
}) {
  const { year, yearShort } = getYearBounds()
  const seq = args.sequence.toString().padStart(args.digits, '0')

  return args.format
    .replaceAll('{PREFIX}', args.prefix)
    .replaceAll('{YEAR}', year)
    .replaceAll('{YY}', yearShort)
    .replaceAll('{SEQ}', seq)
    .replaceAll('{CLASS}', normalizeClassToken(args.classId))
}

function resolveConfig(settings: NumberingSettings | null, kind: NumberKind) {
  if (kind === 'registration') {
    return {
      prefix: settings?.registrationNumberPrefix || DEFAULT_REGISTRATION.prefix,
      format: settings?.registrationNumberFormat || DEFAULT_REGISTRATION.format,
      start: settings?.registrationSequenceStart || DEFAULT_REGISTRATION.start,
      digits: settings?.registrationSequenceDigits || DEFAULT_REGISTRATION.digits,
      resetYearly: settings?.registrationResetYearly ?? DEFAULT_REGISTRATION.resetYearly,
    }
  }

  return {
    prefix: settings?.admissionNumberPrefix || DEFAULT_ADMISSION.prefix,
    format: settings?.admissionNumberFormat || DEFAULT_ADMISSION.format,
    start: settings?.sequenceStart || DEFAULT_ADMISSION.start,
    digits: settings?.sequenceDigits || DEFAULT_ADMISSION.digits,
    resetYearly: settings?.resetSequenceYearly ?? DEFAULT_ADMISSION.resetYearly,
  }
}

async function countExisting(schoolId: string, kind: NumberKind, resetYearly: boolean) {
  const { start, end } = getYearBounds()
  const baseWhere = {
    schoolId,
    deletedAt: null,
    ...(resetYearly ? { dateOfAdmission: { gte: start, lt: end } } : {}),
  }

  if (kind === 'registration') {
    return db.admission.count({
      where: {
        ...baseWhere,
        registrationNumber: { not: null },
      },
    })
  }

  return db.admission.count({
    where: {
      ...baseWhere,
      admissionNumber: { not: null },
    },
  })
}

async function numberExists(schoolId: string, value: string, kind: NumberKind) {
  if (kind === 'registration') {
    const existing = await db.admission.findFirst({
      where: { schoolId, registrationNumber: value, deletedAt: null },
      select: { id: true },
    })
    return !!existing
  }

  const [inAdmission, inStudent] = await Promise.all([
    db.admission.findFirst({ where: { admissionNumber: value }, select: { id: true } }),
    db.student.findFirst({ where: { admissionNumber: value }, select: { id: true } }),
  ])
  return !!(inAdmission || inStudent)
}

export async function generateSchoolNumber(
  schoolId: string,
  kind: NumberKind,
  classId?: string | null
) {
  const settings = await db.admissionSetting.findUnique({ where: { schoolId } })
  const config = resolveConfig(settings, kind)
  const existingCount = await countExisting(schoolId, kind, config.resetYearly)

  for (let offset = 0; offset < 200; offset++) {
    const value = formatSchoolNumber({
      format: config.format,
      prefix: config.prefix,
      sequence: config.start + existingCount + offset,
      digits: config.digits,
      classId,
    })

    if (!(await numberExists(schoolId, value, kind))) {
      return value
    }
  }

  throw new Error(`Could not generate a unique ${kind} number.`)
}

export async function previewAdmissionNumbers(
  schoolId: string,
  classId?: string | null
): Promise<AdmissionNumberPreview> {
  const [nextAdmissionNumber, nextRegistrationNumber] = await Promise.all([
    generateSchoolNumber(schoolId, 'admission', classId),
    generateSchoolNumber(schoolId, 'registration', classId),
  ])

  return { nextAdmissionNumber, nextRegistrationNumber }
}
