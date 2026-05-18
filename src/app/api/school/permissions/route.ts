import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'

// GET /api/school/permissions - Get all permissions available to this school
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    // SUPER_ADMIN sees all permissions
    if (user.role === 'SUPER_ADMIN') {
      const allPermissions = await db.permission.findMany({
        where: { isActive: true },
        orderBy: [{ module: 'asc' }, { action: 'asc' }],
      })

      const modules: Record<string, typeof allPermissions> = {}
      for (const perm of allPermissions) {
        if (!modules[perm.module]) {
          modules[perm.module] = []
        }
        modules[perm.module].push(perm)
      }

      return NextResponse.json({ modules })
    }

    // SCHOOL_ADMIN: only sees permissions assigned via SchoolPermission
    const schoolPermissions = await db.schoolPermission.findMany({
      where: { schoolId: user.schoolId },
      include: {
        permission: true,
      },
      orderBy: { permission: { module: 'asc' } },
    })

    // Group by module
    const modules: Record<string, typeof schoolPermissions[number]['permission'][]> = {}
    for (const sp of schoolPermissions) {
      const perm = sp.permission
      if (!modules[perm.module]) {
        modules[perm.module] = []
      }
      modules[perm.module].push(perm)
    }

    return NextResponse.json({ modules })
  } catch (error) {
    console.error('Get school permissions error:', error)
    return internalError('loading school permissions')
  }
}
