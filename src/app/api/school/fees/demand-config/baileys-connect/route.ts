import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { forbiddenError, internalError, unauthorizedError } from '@/lib/api-errors'
import { connectBaileys, disconnectBaileys } from '@/lib/whatsapp/baileys'

export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user?.schoolId) return unauthorizedError()

    const status = await connectBaileys(user.schoolId)
    return NextResponse.json(status)
  } catch (err) {
    if (err instanceof Error && err.message === 'unauthorized') return unauthorizedError()
    if (err instanceof Error && err.message === 'forbidden') return forbiddenError()
    console.error('[baileys-connect] POST error', err)
    return internalError('starting Baileys connection')
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user?.schoolId) return unauthorizedError()

    await disconnectBaileys(user.schoolId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Error && err.message === 'unauthorized') return unauthorizedError()
    if (err instanceof Error && err.message === 'forbidden') return forbiddenError()
    console.error('[baileys-connect] DELETE error', err)
    return internalError('disconnecting Baileys')
  }
}

export const dynamic = 'force-dynamic'
