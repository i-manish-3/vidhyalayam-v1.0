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
      favicon: true,
      printHeader: true,
      subdomain: true,
      status: true,
      primaryColor: true,
      dashboardFont: true,
      address: true,
      city: true,
      state: true,
      pincode: true,
      country: true,
      board: true,
      contactPhone: true,
      contactEmail: true,
      website: true,
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
    const name = typeof body.name === 'string' ? body.name.trim() : undefined
    const logo = typeof body.logo === 'string' ? body.logo.trim() : undefined
    const favicon = typeof body.favicon === 'string' ? body.favicon.trim() : undefined
    const printHeader = typeof body.printHeader === 'string' ? body.printHeader.trim() : undefined
    const primaryColor = typeof body.primaryColor === 'string' ? body.primaryColor.trim() : undefined
    const dashboardFont = typeof body.dashboardFont === 'string' ? body.dashboardFont.trim() : undefined

    if (name !== undefined && !name) {
      return apiError(400, 'Please enter a school name.')
    }
    if (logo !== undefined && logo && !/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(logo)) {
      return apiError(400, 'Please upload a valid school logo image.')
    }
    if (favicon !== undefined && favicon && !/^data:image\/(png|jpeg|jpg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/.test(favicon)) {
      return apiError(400, 'Please upload a valid favicon image.')
    }
    if (printHeader !== undefined && printHeader && !/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(printHeader)) {
      return apiError(400, 'Please upload a valid print header banner image.')
    }
    // 3 MB raw ≈ 4 MB base64 payload. Reject anything obviously larger.
    if (printHeader && printHeader.length > 4 * 1024 * 1024) {
      return apiError(400, 'Print header banner is too large. Please keep it under 3 MB.')
    }
    if (primaryColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
      return apiError(400, 'Please select a valid theme color.')
    }
    if (dashboardFont !== undefined && !['system', 'segoe', 'arial', 'verdana', 'trebuchet', 'georgia'].includes(dashboardFont)) {
      return apiError(400, 'Please select a valid dashboard font.')
    }
    if (name === undefined && logo === undefined && favicon === undefined && printHeader === undefined && primaryColor === undefined && dashboardFont === undefined) {
      return apiError(400, 'Please provide at least one branding update.')
    }

    const school = await db.school.update({
      where: { id: user.schoolId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(logo !== undefined ? { logo: logo || null } : {}),
        ...(favicon !== undefined ? { favicon: favicon || null } : {}),
        ...(printHeader !== undefined ? { printHeader: printHeader || null } : {}),
        ...(primaryColor !== undefined ? { primaryColor } : {}),
        ...(dashboardFont !== undefined ? { dashboardFont } : {}),
      },
      select: {
        id: true,
        name: true,
        logo: true,
        favicon: true,
        printHeader: true,
        subdomain: true,
        status: true,
        primaryColor: true,
        dashboardFont: true,
        academicYear: true,
        board: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        country: true,
        contactPhone: true,
        contactEmail: true,
        website: true,
      },
    })

    return NextResponse.json({ school })
  } catch (error) {
    console.error('Update school theme error:', error)
    return internalError('updating school theme')
  }
}
