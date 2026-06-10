import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, validationError } from '@/lib/api-errors'
import { uploadIfDataUrl, IMAGE_MIME_TYPES } from '@/lib/storage'

const SINGLETON_ID = 'singleton'

async function getBranding() {
  return db.platformBranding.findUnique({ where: { id: SINGLETON_ID } })
}

// GET /api/super-admin/platform-branding — current branding.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) return unauthorizedError()

    const branding = await getBranding()
    return NextResponse.json({ logo: branding?.logo ?? null })
  } catch (error) {
    console.error('Get platform branding error:', error)
    return internalError('loading platform branding')
  }
}

// PATCH /api/super-admin/platform-branding — set/clear the platform logo.
// Body: { logo: <data-url | stored-url | null | ''> }
export async function PATCH(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) return unauthorizedError()

    const body = await request.json()
    const existing = await getBranding()

    const upload = await uploadIfDataUrl(body.logo, {
      folder: 'platform',
      maxBytes: 1024 * 1024, // 1 MB
      allowedMimeTypes: IMAGE_MIME_TYPES,
      previousUrl: existing?.logo ?? null,
    })
    if (upload.error) return validationError(`Logo: ${upload.error}`)

    // upload.url: string (new/unchanged), null (cleared), or undefined (no key sent).
    const logo = upload.url === undefined ? (existing?.logo ?? null) : upload.url

    const branding = await db.platformBranding.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, logo },
      update: { logo },
    })

    return NextResponse.json({ logo: branding.logo })
  } catch (error) {
    console.error('Update platform branding error:', error)
    return internalError('updating platform branding')
  }
}
