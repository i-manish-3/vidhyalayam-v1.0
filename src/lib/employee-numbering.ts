import { Prisma, PrismaClient } from '@prisma/client'

type Tx = Prisma.TransactionClient | PrismaClient

const EMPLOYEE_KIND = 'employee'
const EMPLOYEE_PREFIX = 'EMP'
const EMPLOYEE_DIGITS = 4
const EMPLOYEE_FORMAT = '{PREFIX}-{SEQ}'

type EmployeeNumberingConfig = {
  prefix: string
  format: string
  start: number
  digits: number
  resetYearly: boolean
}

function isPrismaErrorCode(err: unknown, code: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code
}

export function formatEmployeeNumber(args: {
  format: string
  prefix: string
  sequence: number
  digits: number
}) {
  const now = new Date()
  const seq = args.sequence.toString().padStart(args.digits, '0')

  return args.format
    .replaceAll('{PREFIX}', args.prefix)
    .replaceAll('{YEAR}', now.getFullYear().toString())
    .replaceAll('{YY}', now.getFullYear().toString().slice(-2))
    .replaceAll('{SEQ}', seq)
}

function sequenceFromEmployeeId(employeeId: string | null | undefined) {
  const match = employeeId?.match(/(\d+)$/)
  return match ? Number(match[1]) || 0 : 0
}

export function normalizeEmployeeId(employeeId: unknown) {
  return typeof employeeId === 'string' ? employeeId.trim().toUpperCase() : ''
}

async function maxExistingEmployeeSequence(tx: Tx, schoolId: string) {
  const [teachers, users] = await Promise.all([
    tx.teacher.findMany({
      where: { schoolId, employeeId: { not: null }, deletedAt: null },
      select: { employeeId: true },
    }),
    tx.user.findMany({
      where: { schoolId, employeeId: { not: null }, deletedAt: null },
      select: { employeeId: true },
    }),
  ])

  return [...teachers, ...users].reduce(
    (max, row) => Math.max(max, sequenceFromEmployeeId(row.employeeId)),
    0,
  )
}

async function resolveEmployeeConfig(tx: Tx, schoolId: string): Promise<EmployeeNumberingConfig> {
  const settings = await tx.admissionSetting.findUnique({ where: { schoolId } })

  return {
    prefix: settings?.employeeNumberPrefix || EMPLOYEE_PREFIX,
    format: settings?.employeeNumberFormat || EMPLOYEE_FORMAT,
    start: settings?.employeeSequenceStart || 1,
    digits: settings?.employeeSequenceDigits || EMPLOYEE_DIGITS,
    resetYearly: settings?.employeeResetYearly ?? false,
  }
}

function counterYearKey(resetYearly: boolean) {
  return resetYearly ? new Date().getFullYear() : 0
}

export async function employeeIdExists(tx: Tx, schoolId: string, employeeId: string) {
  const [teacher, user] = await Promise.all([
    tx.teacher.findFirst({
      where: { schoolId, employeeId, deletedAt: null },
      select: { id: true },
    }),
    tx.user.findFirst({
      where: { schoolId, employeeId, deletedAt: null },
      select: { id: true },
    }),
  ])

  return !!teacher || !!user
}

async function allocateEmployeeSequence(tx: Tx, schoolId: string, config: EmployeeNumberingConfig) {
  const year = counterYearKey(config.resetYearly)
  const key = {
    schoolId_kind_year: {
      schoolId,
      kind: EMPLOYEE_KIND,
      year,
    },
  }

  try {
    const updated = await tx.numberCounter.update({
      where: key,
      data: { lastValue: { increment: 1 } },
      select: { lastValue: true },
    })
    if (updated.lastValue >= config.start) return updated.lastValue

    const jumped = await tx.numberCounter.update({
      where: key,
      data: { lastValue: config.start },
      select: { lastValue: true },
    })
    return jumped.lastValue
  } catch (err) {
    if (!isPrismaErrorCode(err, 'P2025')) throw err
  }

  const seedAllocation = Math.max(config.start, (await maxExistingEmployeeSequence(tx, schoolId)) + 1)

  try {
    await tx.numberCounter.create({
      data: {
        schoolId,
        kind: EMPLOYEE_KIND,
        year,
        lastValue: seedAllocation,
      },
    })
    return seedAllocation
  } catch (err) {
    if (!isPrismaErrorCode(err, 'P2002')) throw err
    const updated = await tx.numberCounter.update({
      where: key,
      data: { lastValue: { increment: 1 } },
      select: { lastValue: true },
    })
    return updated.lastValue
  }
}

export async function allocateEmployeeId(tx: Tx, schoolId: string) {
  const config = await resolveEmployeeConfig(tx, schoolId)

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const employeeId = formatEmployeeNumber({
      format: config.format,
      prefix: config.prefix,
      sequence: await allocateEmployeeSequence(tx, schoolId, config),
      digits: config.digits,
    })
    if (!(await employeeIdExists(tx, schoolId, employeeId))) {
      return employeeId
    }
  }

  throw new Error('Could not allocate a unique employee ID. Please try again.')
}

export async function previewEmployeeId(tx: Tx, schoolId: string) {
  const config = await resolveEmployeeConfig(tx, schoolId)
  const year = counterYearKey(config.resetYearly)
  const counter = await tx.numberCounter.findUnique({
    where: { schoolId_kind_year: { schoolId, kind: EMPLOYEE_KIND, year } },
    select: { lastValue: true },
  })
  const sequence = counter
    ? Math.max(counter.lastValue + 1, config.start)
    : Math.max(config.start, (await maxExistingEmployeeSequence(tx, schoolId)) + 1)

  return formatEmployeeNumber({
    format: config.format,
    prefix: config.prefix,
    sequence,
    digits: config.digits,
  })
}

export async function resolveEmployeeId(tx: Tx, schoolId: string, requestedEmployeeId: unknown) {
  const manualEmployeeId = normalizeEmployeeId(requestedEmployeeId)

  if (manualEmployeeId) {
    if (await employeeIdExists(tx, schoolId, manualEmployeeId)) {
      throw new Error(`Employee ID "${manualEmployeeId}" is already in use.`)
    }
    return manualEmployeeId
  }

  return allocateEmployeeId(tx, schoolId)
}
