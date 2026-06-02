import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { apiError, internalError, notFoundError, unauthorizedError } from '@/lib/api-errors'
import { layoutSchema } from '@/lib/id-card-types'
import { buildStudentQrPayload } from '@/lib/id-card-qr'

const VALID_ACTIONS = new Set(['preview', 'print', 'download'])
const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

function parseLayout(json: string | null): unknown[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return layoutSchema.parse(parsed)
  } catch {
    return []
  }
}

function fullName(first?: string | null, last?: string | null): string {
  return [first, last].filter(Boolean).join(' ').trim()
}

// POST /api/school/id-cards/generate
// body: { templateId, studentIds[], academicYear?, action? }
// Returns: { template, school, cards: [{ studentId, fields, qrPayload, photo }] }
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()
    const allowed = await requirePermission(request, 'idcard:generate')
    if (!allowed) return apiError(403, "You don't have permission to generate ID cards.")

    const body = await request.json().catch(() => ({}))
    const templateId = typeof body?.templateId === 'string' ? body.templateId : ''
    const studentIdsInput: unknown = body?.studentIds
    const academicYearInput = typeof body?.academicYear === 'string' ? body.academicYear.trim() : ''
    const action = VALID_ACTIONS.has(body?.action) ? (body.action as string) : 'preview'

    if (!templateId) return apiError(400, 'Please choose an ID card template.')
    if (!Array.isArray(studentIdsInput) || studentIdsInput.length === 0) {
      return apiError(400, 'Please select at least one student.')
    }
    const studentIds = studentIdsInput
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
      .slice(0, 500)
    if (!studentIds.length) return apiError(400, 'Please select at least one valid student.')

    const academicYear = ACADEMIC_YEAR_PATTERN.test(academicYearInput) ? academicYearInput : null

    const [template, school, students] = await Promise.all([
      db.idCardTemplate.findFirst({
        where: { id: templateId, schoolId: user.schoolId, deletedAt: null },
      }),
      db.school.findUnique({
        where: { id: user.schoolId },
        select: {
          id: true,
          name: true,
          logo: true,
          address: true,
          city: true,
          state: true,
          pincode: true,
          country: true,
          contactPhone: true,
          contactEmail: true,
          website: true,
          registrationNumber: true,
          udiseNumber: true,
          affiliationNumber: true,
          establishedYear: true,
          principalSignature: true,
          academicYear: true,
        },
      }),
      db.student.findMany({
        where: { id: { in: studentIds }, schoolId: user.schoolId, deletedAt: null },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          rollNumber: true,
          dateOfBirth: true,
          gender: true,
          bloodGroup: true,
          profileImage: true,
          address: true,
          city: true,
          state: true,
          pincode: true,
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          admission: {
            select: {
              registrationNumber: true,
              udiseId: true,
            },
          },
          academicEnrollments: {
            where: academicYear ? { academicYear } : undefined,
            select: {
              academicYear: true,
              rollNumber: true,
              class: { select: { id: true, name: true } },
              section: { select: { id: true, name: true } },
            },
            orderBy: { academicYear: 'desc' },
            take: 1,
          },
          parentLinks: {
            select: {
              isPrimary: true,
              relation: true,
              parent: {
                select: {
                  fatherName: true,
                  motherName: true,
                  phone: true,
                  alternatePhone: true,
                },
              },
            },
          },
        },
      }),
    ])

    if (!template) return notFoundError('Template')
    if (!school) return notFoundError('School')

    const resolvedYear = academicYear || school.academicYear || ''
    const schoolAddress = [school.address, school.city, school.state, school.pincode]
      .filter(Boolean)
      .join(', ')

    // Preserve user-selected order so the print sheet matches what they picked.
    const studentMap = new Map(students.map((s) => [s.id, s]))

    const cards = studentIds
      .map((sid) => studentMap.get(sid))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => {
        const enrollment = s.academicEnrollments[0]
        const cls = enrollment?.class?.name || s.class?.name || ''
        const sec = enrollment?.section?.name || s.section?.name || ''
        const rollNo = enrollment?.rollNumber || s.rollNumber || ''
        const primaryParent = s.parentLinks.find((l) => l.isPrimary) || s.parentLinks[0]
        const fatherName = primaryParent?.parent.fatherName || ''
        const motherName = primaryParent?.parent.motherName || ''
        const parentName = fatherName || motherName || ''
        const parentPhone = primaryParent?.parent.phone || primaryParent?.parent.alternatePhone || ''
        const studentAddress = [s.address, s.city, s.state, s.pincode].filter(Boolean).join(', ')

        const qrPayload = buildStudentQrPayload({
          studentId: s.id,
          admissionNumber: s.admissionNumber,
          schoolId: school.id,
          academicYear: resolvedYear,
        })

        return {
          studentId: s.id,
          photo: s.profileImage || null,
          qrPayload,
          fields: {
            'student.name': fullName(s.firstName, s.lastName),
            'student.admissionNumber': s.admissionNumber || '',
            'student.rollNumber': rollNo,
            'student.class': cls,
            'student.section': sec,
            'student.classSection': [cls, sec].filter(Boolean).join(' - '),
            'student.dateOfBirth': s.dateOfBirth
              ? new Date(s.dateOfBirth).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : '',
            'student.bloodGroup': s.bloodGroup || '',
            'student.gender': s.gender || '',
            'student.address': studentAddress,
            'student.parentName': parentName,
            'student.fatherName': fatherName,
            'student.motherName': motherName,
            'student.parentPhone': parentPhone,
            'student.academicYear': resolvedYear,
            'student.registrationNumber': s.admission?.registrationNumber || '',
            'student.udiseId': s.admission?.udiseId || '',
            'school.name': school.name || '',
            'school.address': schoolAddress,
            'school.phone': school.contactPhone || '',
            'school.email': school.contactEmail || '',
            'school.website': school.website || '',
            'school.registrationNumber': school.registrationNumber || '',
            'school.udiseNumber': school.udiseNumber || '',
            'school.affiliationNumber': school.affiliationNumber || '',
            'school.establishedYear': school.establishedYear || '',
            'school.principalSignature': school.principalSignature || '',
          },
        }
      })

    // Best-effort audit log — failure here must not break the generation flow.
    db.idCardGenerationLog
      .create({
        data: {
          schoolId: user.schoolId,
          templateId: template.id,
          generatedBy: user.userId,
          studentCount: cards.length,
          studentIds: JSON.stringify(cards.map((c) => c.studentId)),
          academicYear: resolvedYear || null,
          action,
        },
      })
      .catch((e) => console.error('ID card audit log failed:', e))

    return NextResponse.json({
      template: {
        id: template.id,
        name: template.name,
        templateMode: template.templateMode,
        orientation: template.orientation,
        widthMm: template.widthMm,
        heightMm: template.heightMm,
        backgroundColor: template.backgroundColor,
        frontBackground: template.frontBackground,
        backBackground: template.backBackground,
        hasBackSide: template.hasBackSide,
        frontHtml: template.frontHtml,
        backHtml: template.hasBackSide ? template.backHtml : null,
        frontCss: template.frontCss,
        backCss: template.hasBackSide ? template.backCss : null,
        frontLayout: parseLayout(template.frontLayout),
        backLayout: template.hasBackSide ? parseLayout(template.backLayout) : null,
      },
      school: {
        id: school.id,
        name: school.name,
        logo: school.logo,
        address: schoolAddress,
        phone: school.contactPhone,
        email: school.contactEmail,
        website: school.website,
        registrationNumber: school.registrationNumber,
        udiseNumber: school.udiseNumber,
        affiliationNumber: school.affiliationNumber,
        establishedYear: school.establishedYear,
        principalSignature: school.principalSignature,
        academicYear: resolvedYear,
      },
      cards,
    })
  } catch (error) {
    console.error('Generate id-cards error:', error)
    return internalError('generating ID cards')
  }
}
