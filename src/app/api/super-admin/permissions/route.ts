import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'

// GET /api/super-admin/permissions - Get all permissions grouped by module
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) {
      return unauthorizedError()
    }

    const permissions = await db.permission.findMany({
      where: { isActive: true },
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    })

    // Group by module
    const modules: Record<string, typeof permissions> = {}
    for (const perm of permissions) {
      if (!modules[perm.module]) {
        modules[perm.module] = []
      }
      modules[perm.module].push(perm)
    }

    return NextResponse.json({ modules })
  } catch (error) {
    console.error('Get permissions error:', error)
    return internalError('loading permissions')
  }
}
