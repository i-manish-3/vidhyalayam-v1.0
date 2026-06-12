export const ZKTECO_PROVIDER = 'zkteco_adms'

export interface ZktecoAttLog {
  deviceUserId: string
  punchTime: Date
  verifyMode: string
  punchStatus: string
  workCode: string | null
  rawLine: string
}

const ATTLOG_DATE_PATTERN =
  /^(\S+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\s+(\S+))?(?:\s+(\S+))?(?:\s+(\S+))?/

export function parseZktecoAttLogBody(body: string): ZktecoAttLog[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseZktecoAttLogLine)
    .filter((log): log is ZktecoAttLog => log !== null)
}

export function parseZktecoAttLogLine(line: string): ZktecoAttLog | null {
  const tabParts = line.split('\t').map((part) => part.trim())
  if (tabParts.length >= 2) {
    const punchTime = parseDeviceLocalDate(tabParts[1])
    if (punchTime) {
      return {
        deviceUserId: tabParts[0],
        punchTime,
        punchStatus: tabParts[2] ?? '',
        verifyMode: tabParts[3] ?? '',
        workCode: tabParts[4] || null,
        rawLine: line,
      }
    }
  }

  const match = ATTLOG_DATE_PATTERN.exec(line)
  if (!match) return null
  const punchTime = parseDeviceLocalDate(`${match[2]} ${match[3]}`)
  if (!punchTime) return null

  return {
    deviceUserId: match[1],
    punchTime,
    punchStatus: match[4] ?? '',
    verifyMode: match[5] ?? '',
    workCode: match[6] || null,
    rawLine: line,
  }
}

export function parseDeviceLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const [, y, m, d, hh, mm, ss] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss))
  return Number.isNaN(date.getTime()) ? null : date
}

export function zktecoOk(body = 'OK'): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  })
}
