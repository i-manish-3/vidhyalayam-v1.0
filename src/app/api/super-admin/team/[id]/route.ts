import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError, forbiddenError } from '@/lib/api-errors'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getAuthUser(request)
    if (!user) return unauthorizedError()
    if (user.role !== 'SUPER_ADMIN') return forbiddenError()

    const { id } = await params

    const member = await db.teamMember.findFirst({
      where: { id, deletedAt: null },
    })

    if (!member) {
      return apiError(404, 'We couldn\'t find this team member. They may have been removed.')
    }

    return NextResponse.json({ member })
  } catch (error) {
    console.error('Fetch team member error:', error)
    return internalError('loading the team member')
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getAuthUser(request)
    if (!user) return unauthorizedError()
    if (user.role !== 'SUPER_ADMIN') return forbiddenError()

    const { id } = await params

    const existing = await db.teamMember.findFirst({
      where: { id, deletedAt: null },
    })

    if (!existing) {
      return apiError(404, 'We couldn\'t find this team member. They may have been removed.')
    }

    const body = await request.json()
    const { name, role, bio, image, phone, email, linkedin, twitter, github, instagram, facebook, website, isActive, sortOrder } = body

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (role !== undefined) updateData.role = role
    if (bio !== undefined) updateData.bio = bio
    if (image !== undefined) updateData.image = image
    if (phone !== undefined) updateData.phone = phone
    if (email !== undefined) updateData.email = email
    if (linkedin !== undefined) updateData.linkedin = linkedin
    if (twitter !== undefined) updateData.twitter = twitter
    if (github !== undefined) updateData.github = github
    if (instagram !== undefined) updateData.instagram = instagram
    if (facebook !== undefined) updateData.facebook = facebook
    if (website !== undefined) updateData.website = website
    if (isActive !== undefined) updateData.isActive = isActive
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder

    const member = await db.teamMember.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ member })
  } catch (error) {
    console.error('Update team member error:', error)
    return internalError('saving the team member')
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getAuthUser(request)
    if (!user) return unauthorizedError()
    if (user.role !== 'SUPER_ADMIN') return forbiddenError()

    const { id } = await params

    const existing = await db.teamMember.findFirst({
      where: { id, deletedAt: null },
    })

    if (!existing) {
      return apiError(404, 'We couldn\'t find this team member. They may have been removed.')
    }

    const member = await db.teamMember.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ member })
  } catch (error) {
    console.error('Delete team member error:', error)
    return internalError('deleting the team member')
  }
}
