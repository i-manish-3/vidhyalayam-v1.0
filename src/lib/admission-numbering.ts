import { Prisma, PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'

type NumberKind = 'admission' | 'registration'

// Anything Prisma-transactional. The allocate function runs inside the caller's
// $transaction so the counter increment commits/rolls back atomically with the
// admission insert.
type Tx = Prisma.TransactionClient | PrismaClient

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

type ResolvedConfig = {
  prefix: string
  format: string
  start: number
  digits: number
  resetYearly: boolean
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

function resolveConfig(settings: NumberingSettings | null, kind: NumberKind): ResolvedConfig {
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

// Counter rows are keyed by year so each January reset gets its own row. When
// resetYearly is false we collapse all years onto year=0 — single counter for
// the school's lifetime.
function counterYearKey(resetYearly: boolean): number {
  if (!resetYearly) return 0
  return new Date().getFullYear()
}

async function countExistingAdmissions(
  tx: Tx,
  schoolId: string,
  kind: NumberKind,
  resetYearly: boolean,
): Promise<number> {
  const { start, end } = getYearBounds()
  const baseWhere = {
    schoolId,
    deletedAt: null,
    ...(resetYearly ? { dateOfAdmission: { gte: start, lt: end } } : {}),
  }

  if (kind === 'registration') {
    return tx.admission.count({
      where: { ...baseWhere, registrationNumber: { not: null } },
    })
  }
  return tx.admission.count({
    where: { ...baseWhere, admissionNumber: { not: null } },
  })
}

function isPrismaErrorCode(err: unknown, code: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code
}

/**
 * Allocate the next sequence number for a school + kind, atomically.
 *
 * MUST be called inside a db.$transaction. The counter increment commits
 * (or rolls back) along with the surrounding admission insert, so the same
 * sequence number is never handed out twice and abandoned transactions don't
 * leave gaps in the series.
 *
 * On the very first call per (school, kind, year) the counter row doesn't
 * exist yet — we seed it from a count of existing admissions so this works
 * even for schools that already have data from before this migration.
 */
async function allocateSequence(
  tx: Tx,
  schoolId: string,
  kind: NumberKind,
  config: ResolvedConfig,
): Promise<number> {
  const year = counterYearKey(config.resetYearly)
  const key = { schoolId_kind_year: { schoolId, kind, year } }

  // Fast path: row exists. The `increment` UPDATE takes a row-level lock so
  // two parallel allocators serialize cleanly — each gets its own value.
  try {
    const updated = await tx.numberCounter.update({
      where: key,
      data: { lastValue: { increment: 1 } },
      select: { lastValue: true },
    })
    return updated.lastValue
  } catch (err) {
    if (!isPrismaErrorCode(err, 'P2025')) throw err
    // Counter doesn't exist yet — seed it.
  }

  // Seed path: count existing admissions so we don't restart from 1 on a
  // school that already has data. Lastvalue = start + count - 1 means the next
  // allocation (the one we're doing right now) is start + count.
  const existingCount = await countExistingAdmissions(tx, schoolId, kind, config.resetYearly)
  const seedAllocation = config.start + existingCount

  try {
    await tx.numberCounter.create({
      data: { schoolId, kind, year, lastValue: seedAllocation },
    })
    return seedAllocation
  } catch (err) {
    if (!isPrismaErrorCode(err, 'P2002')) throw err
    // Lost the seed race against another tx. Now the row exists; do the
    // normal update path.
    const updated = await tx.numberCounter.update({
      where: key,
      data: { lastValue: { increment: 1 } },
      select: { lastValue: true },
    })
    return updated.lastValue
  }
}

/**
 * Allocate and format the next admission/registration number atomically.
 * Call inside a db.$transaction.
 */
export async function allocateSchoolNumber(
  tx: Tx,
  schoolId: string,
  kind: NumberKind,
  classId?: string | null,
): Promise<string> {
  const settings = await tx.admissionSetting.findUnique({ where: { schoolId } })
  const config = resolveConfig(settings, kind)
  const sequence = await allocateSequence(tx, schoolId, kind, config)
  return formatSchoolNumber({
    format: config.format,
    prefix: config.prefix,
    sequence,
    digits: config.digits,
    classId,
  })
}

/**
 * Read-only preview of the next number that would be allocated. Does NOT
 * reserve the number — two callers will see the same preview until one of
 * them actually allocates. Use for UI hints only.
 */
async function previewNextSequence(
  tx: Tx,
  schoolId: string,
  kind: NumberKind,
  config: ResolvedConfig,
): Promise<number> {
  const year = counterYearKey(config.resetYearly)
  const counter = await tx.numberCounter.findUnique({
    where: { schoolId_kind_year: { schoolId, kind, year } },
    select: { lastValue: true },
  })
  if (counter) return counter.lastValue + 1
  // No counter yet — preview matches what the first allocation will seed to.
  const existingCount = await countExistingAdmissions(tx, schoolId, kind, config.resetYearly)
  return config.start + existingCount
}

export async function previewSchoolNumber(
  schoolId: string,
  kind: NumberKind,
  classId?: string | null,
): Promise<string> {
  const settings = await db.admissionSetting.findUnique({ where: { schoolId } })
  const config = resolveConfig(settings, kind)
  const sequence = await previewNextSequence(db, schoolId, kind, config)
  return formatSchoolNumber({
    format: config.format,
    prefix: config.prefix,
    sequence,
    digits: config.digits,
    classId,
  })
}

export async function previewAdmissionNumbers(
  schoolId: string,
  classId?: string | null,
): Promise<AdmissionNumberPreview> {
  const [nextAdmissionNumber, nextRegistrationNumber] = await Promise.all([
    previewSchoolNumber(schoolId, 'admission', classId),
    previewSchoolNumber(schoolId, 'registration', classId),
  ])
  return { nextAdmissionNumber, nextRegistrationNumber }
}
