import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
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
    const user = await requirePermission(request, 'class:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to create sections.")
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

    // Unique trimmed names requested (drop exact-duplicate names in the payload).
    const requestedNames = Array.from(new Set(validSections.map((s: { name: string }) => s.name.trim())))

    // Look up existing sections by name INCLUDING soft-deleted ones. The unique
    // key (schoolId, classId, name) ignores deletedAt, so a soft-deleted section
    // still occupies its name — a plain insert would trip the constraint and 500.
    // Active matches are real duplicates (reject); soft-deleted matches are
    // revived instead of re-created.
    const existingSections = await db.section.findMany({
      where: {
        classId,
        schoolId: user.schoolId,
        name: { in: requestedNames },
      },
      select: { id: true, name: true, deletedAt: true },
    })

    const activeDup = existingSections.filter((s) => !s.deletedAt)
    if (activeDup.length > 0) {
      const dupNames = activeDup.map((s) => s.name).join(', ')
      return apiError(400, `Sections already exist: ${dupNames}. Please use different names.`)
    }

    const deletedByName = new Map(existingSections.map((s) => [s.name, s.id]))
    const reviveIds = requestedNames
      .map((name) => deletedByName.get(name))
      .filter((id): id is string => !!id)
    const toCreate = requestedNames.filter((name) => !deletedByName.has(name))

    const count = await db.$transaction(async (tx) => {
      let n = 0
      if (reviveIds.length > 0) {
        const revived = await tx.section.updateMany({
          where: { id: { in: reviveIds } },
          data: { deletedAt: null },
        })
        n += revived.count
      }
      if (toCreate.length > 0) {
        const created = await tx.section.createMany({
          data: toCreate.map((name) => ({
            schoolId: user.schoolId!,
            classId,
            name,
          })),
        })
        n += created.count
      }
      return n
    })

    return NextResponse.json({
      message: `${count} section${count !== 1 ? 's' : ''} created successfully.`,
      count,
    }, { status: 201 })
  } catch (error) {
    console.error('Create sections error:', error)
    return internalError('creating sections')
  }
}
