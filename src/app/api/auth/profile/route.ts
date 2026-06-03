import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/api-auth'
import { internalError, apiError } from '@/lib/api-errors'

const MAX_AVATAR_BYTES = 250 * 1024

function approximateBase64Bytes(dataUrl: string) {
  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

export async function PATCH(request: NextRequest) {
  try {
    const user = requireAuth(request)
    if (!user) {
      return apiError(401, 'Authentication required.')
    }

    const body = await request.json().catch(() => ({}))
    const hasAvatar = Object.prototype.hasOwnProperty.call(body, 'avatar')
    const avatar = hasAvatar ? body.avatar : undefined
    const hasName = Object.prototype.hasOwnProperty.call(body, 'name')
    const name = hasName ? body.name : undefined

    if (hasAvatar && avatar !== null && typeof avatar !== 'string') {
      return apiError(400, 'Avatar must be a string or null.')
    }

    if (typeof avatar === 'string' && avatar.length > 0) {
      if (!avatar.startsWith('data:image/')) {
        return apiError(400, 'Avatar must be an image data URL.')
      }
      if (approximateBase64Bytes(avatar) > MAX_AVATAR_BYTES) {
        return apiError(400, 'Profile photo is too large. Please use an image under 200 KB.')
      }
    }

    if (hasName && typeof name !== 'string') {
      return apiError(400, 'Name must be a string.')
    }

    const trimmedName = typeof name === 'string' ? name.trim() : ''
    if (hasName) {
      if (trimmedName.length < 2) {
        return apiError(400, 'Name must be at least 2 characters long.')
      }
      if (trimmedName.length > 80) {
        return apiError(400, 'Name must be 80 characters or fewer.')
      }
    }

    const updateData: { avatar?: string | null; name?: string } = {}
    if (hasAvatar) {
      updateData.avatar = avatar === null || avatar === '' ? null : avatar
    }
    if (hasName) {
      updateData.name = trimmedName
    }

    if (Object.keys(updateData).length === 0) {
      return apiError(400, 'No profile fields provided.')
    }

    const updated = await db.user.update({
      where: { id: user.userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        avatar: true,
        mustChangePassword: true,
        schoolId: true,
        isActive: true,
        lastLoginAt: true,
      },
    })

    return NextResponse.json({ user: updated })
  } catch (error) {
    console.error('Update profile error:', error)
    return internalError('updating your profile')
  }
}
