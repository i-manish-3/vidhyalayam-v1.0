import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { verifyCommKey } from '@/lib/device-comm-key'
import { ingestAttendanceDevicePunch } from '@/lib/attendance-device-punch-service'
import { parseZktecoAttLogBody, zktecoOk, ZKTECO_PROVIDER } from '@/lib/zkteco-adms'

export const runtime = 'nodejs'

function zktecoError(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  })
}

// ZKTeco devices send the comm key as a query parameter (commkey/passwd) when a
// communication key is configured. A custom header is also accepted so tooling
// (curl, the simulator) can authenticate without touching the device.
function extractCommKey(request: NextRequest): string {
  const { searchParams } = new URL(request.url)
  return (
    searchParams.get('commkey')?.trim() ||
    searchParams.get('passwd')?.trim() ||
    request.headers.get('x-zk-commkey')?.trim() ||
    ''
  )
}

async function authorizeDevice(serialNo: string, request: NextRequest): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (!serialNo) return { ok: false, response: zktecoError('ERROR: Missing SN', 400) }

  const device = await db.attendanceDevice.findUnique({
    where: { serialNo },
    select: { id: true, isActive: true, deletedAt: true, commKeyHash: true },
  })

  if (!device || !device.isActive || device.deletedAt) {
    return { ok: false, response: zktecoError('ERROR: Unknown device', 404) }
  }

  const commKey = extractCommKey(request)
  if (!verifyCommKey(commKey, device.commKeyHash)) {
    return { ok: false, response: zktecoError('ERROR: Invalid comm key', 401) }
  }

  return { ok: true }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const serialNo = searchParams.get('SN')?.trim() || ''

  const auth = await authorizeDevice(serialNo, request)
  if (!auth.ok) return auth.response

  return zktecoOk(
    [
      `GET OPTION FROM: ${serialNo}`,
      'Stamp=9999',
      'OpStamp=9999',
      'ErrorDelay=60',
      'Delay=30',
      'TransTimes=00:00;14:05',
      'TransInterval=1',
      'TransFlag=1111000000',
      'Realtime=1',
      'Encrypt=0',
      '',
    ].join('\n'),
  )
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const serialNo = searchParams.get('SN')?.trim() || ''
  const table = (searchParams.get('table') || '').toUpperCase()

  const auth = await authorizeDevice(serialNo, request)
  if (!auth.ok) return auth.response

  const rawBody = await request.text()
  if (table !== 'ATTLOG') return zktecoOk('OK')

  const remoteIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const logs = parseZktecoAttLogBody(rawBody)

  for (const log of logs) {
    await ingestAttendanceDevicePunch({
      provider: ZKTECO_PROVIDER,
      serialNo,
      deviceUserId: log.deviceUserId,
      punchTime: log.punchTime,
      verifyMode: log.verifyMode,
      punchStatus: log.punchStatus,
      workCode: log.workCode,
      rawLine: log.rawLine,
      remoteIp,
    })
  }

  return zktecoOk(`OK: ${logs.length}`)
}