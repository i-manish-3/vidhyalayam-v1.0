import { NextRequest } from 'next/server'
import { ingestAttendanceDevicePunch } from '@/lib/attendance-device-punch-service'
import { parseZktecoAttLogBody, zktecoOk, ZKTECO_PROVIDER } from '@/lib/zkteco-adms'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const serialNo = searchParams.get('SN')?.trim() || ''

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

  if (!serialNo) return zktecoOk('ERROR: Missing SN')

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
