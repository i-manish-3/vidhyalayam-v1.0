import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/api-auth'
import { internalError, unauthorizedError } from '@/lib/api-errors'
import { ID_CARD_PRESETS } from '@/features/id-cards/presets'

// GET /api/school/id-cards/presets — return the starter template gallery.
//
// Presets are bundled with the app code (see [features/id-cards/presets.ts]),
// not per-tenant rows, so every school sees the same library. The endpoint
// just gates access on a valid session.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    return NextResponse.json({ presets: ID_CARD_PRESETS })
  } catch (error) {
    console.error('List id-card presets error:', error)
    return internalError('loading ID card presets')
  }
}
