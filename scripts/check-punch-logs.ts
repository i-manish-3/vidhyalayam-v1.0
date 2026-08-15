import { db } from '../src/lib/db'

const SUBDOMAIN = arg('--subdomain') ?? 'dps-delhi'
const SERIAL = arg('--serial')
const LIMIT = Number(arg('--limit') ?? '10')
const RESULT = arg('--result')

async function main() {
  const school = await db.school.findFirst({ where: { subdomain: SUBDOMAIN, deletedAt: null } })
  if (!school) throw new Error(`School "${SUBDOMAIN}" not found.`)

  const logs = await db.attendanceDevicePunchLog.findMany({
    where: {
      schoolId: school.id,
      ...(SERIAL ? { serialNo: SERIAL } : {}),
      ...(RESULT ? { result: RESULT } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: LIMIT,
    include: { device: { select: { name: true, serialNo: true } } },
  })

  if (logs.length === 0) {
    console.log(`No punch logs found${SERIAL ? ` for serial ${SERIAL}` : ''}.`)
    return
  }

  console.log(`Latest ${logs.length} punch log(s) for ${school.name}:`)
  console.log('')
  for (const log of logs) {
    const who = log.personType && log.personId ? `${log.personType} ${log.personId}` : '(no mapping)'
    console.log(`  ${log.punchTime.toISOString()}`)
    console.log(`    device   = ${log.device?.name ?? log.serialNo} (${log.device?.serialNo ?? log.serialNo})`)
    console.log(`    user     = ${log.deviceUserId}  verify=${log.verifyMode || '-'}  status=${log.punchStatus || '-'}`)
    console.log(`    person   = ${who}`)
    console.log(`    result   = ${log.result}${log.errorDetail ? `  (${log.errorDetail})` : ''}`)
    console.log('')
  }
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