import { db } from '../src/lib/db'
import { ZKTECO_PROVIDER } from '../src/lib/zkteco-adms'
import { generateCommKey, hashCommKey, verifyCommKey } from '../src/lib/device-comm-key'

const BASE_URL = arg('--base-url') ?? 'http://localhost:3000'
const SUBDOMAIN = arg('--subdomain') ?? 'dps-delhi'
const SERIAL = arg('--serial') ?? 'TEST-SN-001'
const DEVICE_NAME = arg('--device-name') ?? 'Simulated ZKTeco Device'
const PIN = arg('--pin') ?? 'ADM101'
const PERSON_TYPE = (arg('--person-type') ?? 'student') as 'student' | 'teacher' | 'staff'
const PERSON_ID = arg('--person-id')
const ADMISSION_NUMBER = arg('--admission-number')
const EMPLOYEE_ID = arg('--employee-id')
const TIME = arg('--time')
const VERIFY_MODE = arg('--verify-mode') ?? '1'
const PUNCH_STATUS = arg('--punch-status') ?? '0'
const COMM_KEY = arg('--comm-key')

async function main() {
  const school = await db.school.findFirst({ where: { subdomain: SUBDOMAIN, deletedAt: null } })
  if (!school) throw new Error(`School "${SUBDOMAIN}" not found.`)

  const person = await resolvePerson(school.id)
  if (!person) throw new Error('Person not found. Provide --person-id, or --admission-number / --employee-id.')

  console.log(`School   : ${school.name} (${school.subdomain})`)
  console.log(`Person   : ${person.label} (${PERSON_TYPE})`)
  console.log(`PIN      : ${PIN}`)

  const device = await ensureDevice(school.id)
  console.log(`Device   : ${device.name} (serial ${device.serialNo})`)

  const credential = await ensureCredential(school.id, device.id, person.id)
  console.log(`Credential: ${credential.credentialType} "${credential.credentialValue}" -> ${PERSON_TYPE} ${person.id}`)

  const punchTime = formatInTimezone(TIME ? new Date(TIME) : new Date(), school.timezone || 'Asia/Kolkata')
  const body = `${PIN}\t${punchTime}\t${PUNCH_STATUS}\t${VERIFY_MODE}`

  console.log(`\nPOSTing ATTLOG to ${BASE_URL}/iclock/cdata`)
  console.log(`Body     : ${JSON.stringify(body)}`)
  console.log('')

  const res = await fetch(
    `${BASE_URL}/iclock/cdata?SN=${encodeURIComponent(SERIAL)}&table=ATTLOG&commkey=${encodeURIComponent(device.commKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body,
    },
  )
  const text = await res.text()
  console.log(`Response : ${res.status} ${text}`)

  await reportResult(school.id, device.id, PIN, punchTime)
}

async function resolvePerson(schoolId: string) {
  if (PERSON_ID) {
    if (PERSON_TYPE === 'student') {
      const s = await db.student.findFirst({ where: { id: PERSON_ID, schoolId, deletedAt: null } })
      return s ? { id: s.id, label: `${s.firstName} ${s.lastName ?? ''}` } : null
    }
    if (PERSON_TYPE === 'teacher') {
      const t = await db.teacher.findFirst({ where: { id: PERSON_ID, schoolId, deletedAt: null } })
      return t ? { id: t.id, label: `${t.firstName} ${t.lastName ?? ''}` } : null
    }
    const st = await db.staff.findFirst({ where: { id: PERSON_ID, schoolId, deletedAt: null } })
    return st ? { id: st.id, label: `${st.firstName} ${st.lastName ?? ''}` } : null
  }

  if (ADMISSION_NUMBER && PERSON_TYPE === 'student') {
    const s = await db.student.findFirst({ where: { schoolId, admissionNumber: ADMISSION_NUMBER, deletedAt: null } })
    return s ? { id: s.id, label: `${s.firstName} ${s.lastName ?? ''}` } : null
  }

  if (EMPLOYEE_ID && (PERSON_TYPE === 'teacher' || PERSON_TYPE === 'staff')) {
    if (PERSON_TYPE === 'teacher') {
      const t = await db.teacher.findFirst({ where: { schoolId, employeeId: EMPLOYEE_ID, deletedAt: null } })
      return t ? { id: t.id, label: `${t.firstName} ${t.lastName ?? ''}` } : null
    }
    const st = await db.staff.findFirst({ where: { schoolId, employeeId: EMPLOYEE_ID, deletedAt: null } })
    return st ? { id: st.id, label: `${st.firstName} ${st.lastName ?? ''}` } : null
  }

  return null
}

async function ensureDevice(schoolId: string) {
  const existing = await db.attendanceDevice.findUnique({ where: { serialNo: SERIAL } })

  if (existing) {
    if (existing.commKeyHash) {
      if (COMM_KEY && !verifyCommKey(COMM_KEY, existing.commKeyHash)) {
        throw new Error('The provided --comm-key does not match the device. Use the correct key or rotate it in the app.')
      }
      const plainKey = COMM_KEY || ''
      if (!plainKey) throw new Error('Device already has a comm key. Pass --comm-key to authenticate (see the Devices card / rotate key).')
      return { ...existing, commKey: plainKey }
    }
    const commKey = COMM_KEY || generateCommKey()
    await db.attendanceDevice.update({ where: { id: existing.id }, data: { commKeyHash: hashCommKey(commKey) } })
    return { ...existing, commKey }
  }

  const commKey = COMM_KEY || generateCommKey()
  const device = await db.attendanceDevice.create({
    data: { schoolId, provider: ZKTECO_PROVIDER, serialNo: SERIAL, name: DEVICE_NAME, commKeyHash: hashCommKey(commKey) },
  })
  return { ...device, commKey }
}

async function ensureCredential(schoolId: string, deviceId: string, personId: string) {
  const existing = await db.attendanceCredential.findFirst({
    where: { schoolId, provider: ZKTECO_PROVIDER, credentialValue: PIN, isActive: true, revokedAt: null },
  })
  if (existing) return existing
  return db.attendanceCredential.create({
    data: {
      schoolId,
      deviceId,
      provider: ZKTECO_PROVIDER,
      credentialType: 'zkteco_pin',
      credentialValue: PIN,
      personType: PERSON_TYPE,
      personId,
      academicYear: null,
    },
  })
}

async function reportResult(schoolId: string, deviceId: string, pin: string, punchTime: string) {
  const log = await db.attendanceDevicePunchLog.findFirst({
    where: { schoolId, deviceId, deviceUserId: pin },
    orderBy: { createdAt: 'desc' },
  })
  if (!log) {
    console.log('No punch log row found — the punch was not persisted.')
    return
  }

  const [datePart] = punchTime.split(' ')
  console.log('')
  console.log('Punch log :')
  console.log(`  result   = ${log.result}`)
  console.log(`  person   = ${log.personType} ${log.personId ?? '(unknown)'}`)
  console.log(`  detail   = ${log.errorDetail ?? '-'}`)

  const marked = log.result === 'marked' || log.result === 'updated'
  if (!marked || !log.personType || !log.personId) return

  const d = new Date(`${datePart}T00:00:00`)
  if (log.personType === 'student') {
    const att = await db.attendance.findUnique({
      where: { schoolId_studentId_date: { schoolId, studentId: log.personId, date: d } },
    })
    console.log('  attendance = ' + (att ? `${att.status} (source: ${att.markedSource})` : 'no attendance row found'))
  } else {
    const att = await db.employeeAttendance.findUnique({
      where: {
        schoolId_staffType_staffId_date: {
          schoolId,
          staffType: log.personType,
          staffId: log.personId,
          date: d,
        },
      },
    })
    console.log('  attendance = ' + (att ? `${att.status} (source: ${att.markedSource})` : 'no attendance row found'))
  }
}

function formatInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

function arg(name: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(`${name}=`))
  return found?.slice(name.length + 1)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())