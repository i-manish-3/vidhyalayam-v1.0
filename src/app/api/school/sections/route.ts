import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/sections - List sections
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId') || ''

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }
    if (classId) where.classId = classId

    const sections = await db.section.findMany({
      where,
      include: {
        class: { select: { id: true, name: true } },
        _count: {
          select: { students: { where: { deletedAt: null } } },
        },
      },
      orderBy: [{ classId: 'asc' }, { name: 'asc' }],
    })

    return NextResponse.json({ sections })
  } catch (error) {
    console.error('List sections error:', error)
    return internalError('loading sections')
  }
}

// POST /api/school/sections - Create one or more sections for a class
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { classId, sections } = body

    if (!classId) {
      return apiError(400, 'classId is required.')
    }

    // Verify class belongs to this school
    const classRecord = await db.class.findFirst({
      where: { id: classId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!classRecord) {
      return apiError(404, 'Class not found.')
    }

    if (!sections || !Array.isArray(sections) || sections.length === 0) {
      return apiError(400, 'At least one section must be provided.')
    }

    // Validate section names
    const validSections = sections.filter((s: { name: string }) => s.name?.trim())
    if (validSections.length === 0) {
      return apiError(400, 'At least one section must have a name.')
    }

    // Check for duplicate section names within the same class
    const sectionNames = validSections.map((s: { name: string }) => s.name.trim())
    const existingSections = await db.section.findMany({
      where: {
        classId,
        schoolId: user.schoolId,
        deletedAt: null,
        name: { in: sectionNames },
      },
      select: { name: true },
    })
    if (existingSections.length > 0) {
      const dupNames = existingSections.map(s => s.name).join(', ')
      return apiError(400, `Sections already exist: ${dupNames}. Please use different names.`)
    }

    // Create sections
    const created = await db.section.createMany({
      data: validSections.map((s: { name: string; capacity?: number }) => ({
        schoolId: user.schoolId!,
        classId,
        name: s.name.trim(),
        capacity: s.capacity || 40,
      })),
    })

    return NextResponse.json({
      message: `${created.count} section${created.count !== 1 ? 's' : ''} created successfully.`,
      count: created.count,
    }, { status: 201 })
  } catch (error) {
    console.error('Create sections error:', error)
    return internalError('creating sections')
  }
}
