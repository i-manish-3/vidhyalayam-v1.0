import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/api-auth'
import { validationError, internalError, unauthorizedError, forbiddenError } from '@/lib/api-errors'

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUser(request)
    if (!user) return unauthorizedError()
    if (user.role !== 'SUPER_ADMIN') return forbiddenError()

    const searchParams = request.nextUrl.searchParams
    const search = (searchParams.get('search') || '').trim()

    const where: Record<string, unknown> = {
      deletedAt: null,
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { role: { contains: search, mode: 'insensitive' } },
        { bio: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [members, total] = await Promise.all([
      db.teamMember.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      db.teamMember.count({ where }),
    ])

    return NextResponse.json({ members, total })
  } catch (error) {
    console.error('Fetch team members error:', error)
    return internalError('loading team members')
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUser(request)
    if (!user) return unauthorizedError()
    if (user.role !== 'SUPER_ADMIN') return forbiddenError()

    const body = await request.json()

    const { name, role, bio, image, phone, email, linkedin, twitter, github, instagram, facebook, website, isActive, sortOrder } = body

    if (!name || !role || !bio) {
      return validationError("Please enter the team member's name, role, and bio.")
    }

    const member = await db.teamMember.create({
      data: {
        name,
        role,
        bio,
        image: image ?? null,
        phone: phone ?? null,
        email: email ?? null,
        linkedin: linkedin ?? null,
        twitter: twitter ?? null,
        github: github ?? null,
        instagram: instagram ?? null,
        facebook: facebook ?? null,
        website: website ?? null,
        isActive: isActive ?? true,
        sortOrder: sortOrder ?? 0,
      },
    })

    return NextResponse.json({ member }, { status: 201 })
  } catch (error) {
    console.error('Create team member error:', error)
    return internalError('creating the team member')
  }
}
