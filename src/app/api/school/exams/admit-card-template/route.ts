import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'
import {
  parseAdmitCardTemplate,
  normalizeAdmitCardTemplate,
} from '@/features/exams/lib/admit-card-template'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/school/exams/admit-card-template
// Returns the current admit-card visual config + the school branding/instruction
// fields the template uses, so the editor can render a faithful live preview.
export async function GET(req: NextRequest) {
  try {
    const user = requireRole(req, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    const school = await db.school.findUnique({
      where: { id: user.schoolId },
      select: {
        name: true, logo: true, address: true, city: true, state: true, pincode: true,
        contactPhone: true, contactEmail: true, website: true,
        board: true, registrationNumber: true, udiseNumber: true, affiliationNumber: true,
        establishedYear: true, principalSignature: true, principalName: true, trustName: true,
        academicYear: true, admitCardInstructions: true, admitCardTemplate: true,
      },
    })
    if (!school) return apiError(404, 'School not found.')

    return NextResponse.json({
      template: parseAdmitCardTemplate(school.admitCardTemplate),
      branding: {
        name: school.name,
        logo: school.logo,
        address: [school.address, school.city, school.state, school.pincode].filter(Boolean).join(', '),
        board: school.board,
        registrationNumber: school.registrationNumber,
        udiseNumber: school.udiseNumber,
        affiliationNumber: school.affiliationNumber,
        establishedYear: school.establishedYear,
        principalSignature: school.principalSignature,
        principalName: school.principalName,
        trustName: school.trustName,
        academicYear: school.academicYear,
      },
      instructions: parseInstructionsToArray(school.admitCardInstructions),
    })
  } catch (error) {
    console.error('Get admit card template error:', error)
    return internalError('loading the admit card template')
  }
}

// PATCH /api/school/exams/admit-card-template
// body: { template?: AdmitCardTemplateConfig, instructions?: string[],
//         trustName?: string|null, principalName?: string|null }
// Saves the visual config + the admit-card-centric branding fields in one call.
export async function PATCH(req: NextRequest) {
  try {
    const user = requireRole(req, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) return unauthorizedError()

    const body = await req.json().catch(() => ({}))

    const data: Record<string, unknown> = {}

    if (body.template !== undefined) {
      // Normalise through the shared validator so only safe values are stored.
      data.admitCardTemplate = JSON.stringify(normalizeAdmitCardTemplate(body.template))
    }

    if (Array.isArray(body.instructions)) {
      const lines = body.instructions
        .filter((s: unknown): s is string => typeof s === 'string')
        .map((s) => s.trim().slice(0, 500))
        .filter((s) => s.length > 0)
        .slice(0, 12)
      data.admitCardInstructions = lines.length > 0 ? JSON.stringify(lines) : null
    } else if (body.instructions === null) {
      data.admitCardInstructions = null
    }

    if (typeof body.trustName === 'string') data.trustName = body.trustName.trim().slice(0, 200) || null
    else if (body.trustName === null) data.trustName = null

    if (typeof body.principalName === 'string') data.principalName = body.principalName.trim().slice(0, 200) || null
    else if (body.principalName === null) data.principalName = null

    if (Object.keys(data).length === 0) {
      return apiError(400, 'Nothing to update.')
    }

    const school = await db.school.update({
      where: { id: user.schoolId },
      data,
      select: {
        admitCardTemplate: true,
        admitCardInstructions: true,
        trustName: true,
        principalName: true,
      },
    })

    return NextResponse.json({
      template: parseAdmitCardTemplate(school.admitCardTemplate),
      instructions: parseInstructionsToArray(school.admitCardInstructions),
      trustName: school.trustName,
      principalName: school.principalName,
    })
  } catch (error) {
    console.error('Update admit card template error:', error)
    return internalError('saving the admit card template')
  }
}

function parseInstructionsToArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
  } catch {
    return []
  }
}
