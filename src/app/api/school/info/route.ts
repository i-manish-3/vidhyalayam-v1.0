import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'

// Public endpoint — no auth required
// Fetches school info by subdomain for the login page
export async function GET(req: NextRequest) {
  const subdomain = req.nextUrl.searchParams.get('subdomain')

  if (!subdomain) {
    return apiError(400, 'Please provide a school subdomain.')
  }

  const school = await db.school.findUnique({
    where: { subdomain },
    select: {
      id: true,
      name: true,
      logo: true,
      subdomain: true,
      status: true,
      primaryColor: true,
      dashboardFont: true,
      address: true,
      city: true,
      state: true,
      board: true,
      contactPhone: true,
      contactEmail: true,
    },
  })

  if (!school) {
    return apiError(404, 'We couldn\'t find a school with this subdomain. Please check the URL and try again.')
  }

  return NextResponse.json({ school })
}

export async function PATCH(req: NextRequest) {
  try {
    const user = requireRole(req, ['SCHOOL_ADMIN'])
    if (!user) {
      return unauthorizedError()
    }
    if (!user.schoolId) {
      return apiError(400, 'No school is linked with your account.')
    }

    const body = await req.json()
    const primaryColor = typeof body.primaryColor === 'string' ? body.primaryColor.trim() : undefined
    const dashboardFont = typeof body.dashboardFont === 'string' ? body.dashboardFont.trim() : undefined

    if (primaryColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
      return apiError(400, 'Please select a valid theme color.')
    }
    if (dashboardFont !== undefined && !['system', 'segoe', 'arial', 'verdana', 'trebuchet', 'georgia'].includes(dashboardFont)) {
      return apiError(400, 'Please select a valid dashboard font.')
    }
    if (primaryColor === undefined && dashboardFont === undefined) {
      return apiError(400, 'Please select a color palette or dashboard font.')
    }

    const school = await db.school.update({
      where: { id: user.schoolId },
      data: {
        ...(primaryColor !== undefined ? { primaryColor } : {}),
        ...(dashboardFont !== undefined ? { dashboardFont } : {}),
      },
      select: {
        id: true,
        name: true,
        logo: true,
        subdomain: true,
        status: true,
        primaryColor: true,
        dashboardFont: true,
        academicYear: true,
        board: true,
        address: true,
        city: true,
        state: true,
      },
    })

    return NextResponse.json({ school })
  } catch (error) {
    console.error('Update school theme error:', error)
    return internalError('updating school theme')
  }
}
