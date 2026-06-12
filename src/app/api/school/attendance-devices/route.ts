import { Prisma } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError } from '@/lib/api-errors'
import { ZKTECO_PROVIDER } from '@/lib/zkteco-adms'

const PROVIDERS = new Set([ZKTECO_PROVIDER])

export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'rfid:devices:manage')
    if (!user?.schoolId) return apiError(403, "You don't have permission to manage attendance devices.")

    const devices = await db.attendanceDevice.findMany({
      where: { schoolId: user.schoolId, deletedAt: null },
      orderBy: [{ provider: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { credentials: true, punchLogs: true } },
      },
    })

    return NextResponse.json({ devices })
  } catch (error) {
    console.error('List attendance devices error:', error)
    return internalError('loading attendance devices')
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'rfid:devices:manage')
    if (!user?.schoolId) return apiError(403, "You don't have permission to manage attendance devices.")

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError(400, 'Body missing.')

    const provider = normalizeString(body.provider) || ZKTECO_PROVIDER
    const serialNo = normalizeString(body.serialNo)
    const name = normalizeString(body.name)
    const location = normalizeString(body.location)

    if (!PROVIDERS.has(provider)) return apiError(400, 'Unsupported attendance device provider.')
    if (!serialNo) return apiError(400, 'Device serial number is required.')
    if (!name || name.length < 2) return apiError(422, 'Device name is too short.')

    const device = await db.attendanceDevice.create({
      data: {
        schoolId: user.schoolId,
        provider,
        serialNo,
        name,
        location: location || null,
        createdBy: user.userId,
      },
    })

    return NextResponse.json({ device }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError(409, 'A device with this serial number already exists.')
    }
    console.error('Create attendance device error:', error)
    return internalError('creating attendance device')
  }
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
