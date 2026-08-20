import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'
import { CERTIFICATE_TYPE_VALUES, allocateCertificateNumber } from '@/features/certificates/lib/certificate-types'
import { buildCertificateSnapshot } from '@/features/certificates/lib/certificate-snapshot'

const VALID_STATUSES = ['active', 'void']

// GET /api/school/certificates
//   ?type=tc|bonafide|...
//   ?status=active|void
//   ?search=name|admission|number
//   ?from=YYYY-MM-DD &to=YYYY-MM-DD
//   ?studentId=...
//   ?page=1&pageSize=25
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'certificate:read')
    if (!user?.schoolId) return unauthorizedError()

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')?.trim() || ''
    const status = searchParams.get('status')?.trim() || ''
    const search = searchParams.get('search')?.trim() || ''
    const from = searchParams.get('from')?.trim() || ''
    const to = searchParams.get('to')?.trim() || ''
    const studentId = searchParams.get('studentId')?.trim() || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '25', 10) || 25), 100)

    const where: Prisma.CertificateWhereInput = {
      schoolId: user.schoolId,
      deletedAt: null,
    }
    if (type && CERTIFICATE_TYPE_VALUES.includes(type)) where.type = type
    if (status && VALID_STATUSES.includes(status)) where.status = status
    if (studentId) where.studentId = studentId
    if (from || to) {
      where.issueDate = {}
      if (from) where.issueDate.gte = new Date(`${from}T00:00:00.000Z`)
      if (to) where.issueDate.lte = new Date(`${to}T23:59:59.999Z`)
    }
    if (search) {
      where.OR = [
        { certificateNumber: { contains: search, mode: 'insensitive' } },
        { student: { firstName: { contains: search, mode: 'insensitive' } } },
        { student: { lastName: { contains: search, mode: 'insensitive' } } },
        { student: { admissionNumber: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [total, records] = await Promise.all([
      db.certificate.count({ where }),
      db.certificate.findMany({
        where,
        orderBy: { issueDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          certificateNumber: true,
          type: true,
          issueDate: true,
          effectiveDate: true,
          purpose: true,
          remarks: true,
          isTemporary: true,
          status: true,
          voidedAt: true,
          voidReason: true,
          createdAt: true,
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNumber: true,
              admissionStatus: true,
              class: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
          template: { select: { id: true, name: true } },
          issuedByUser: { select: { id: true, name: true } },
        },
      }),
    ])

    return NextResponse.json({ records, total, page, pageSize })
  } catch (error) {
    console.error('List certificates error:', error)
    return internalError('loading certificates')
  }
}

// POST /api/school/certificates — issue a certificate
//
// ⚠️ DELIBERATE DESIGN: issuing a certificate NEVER mutates the Student row.
// No admissionStatus flip, no isActive=false, no StudentWithdrawal row, no
// fee/transport/hostel cascade. A certificate — including a TC — is a pure
// auditable record. The "temporary TC" flow (isTemporary=true) is the norm:
// the student stays fully on the rolls. The permanent withdrawal flow at
// /api/school/students/[id]/withdraw is the ONLY path that changes a
// student's standing, and it is a separate explicit action.
//
// Body shape:
//   {
//     studentId: string,
//     type: 'tc' | ...,
//     templateId?: string,
//     isTemporary?: boolean,
//     effectiveDate?: string (YYYY-MM-DD) — TC leaving date (informational only),
//     purpose?: string,
//     remarks?: string,
//   }
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'certificate:issue')
    if (!user?.schoolId) return apiError(403, "You don't have permission to issue certificates.")

    const body = await request.json().catch(() => ({}))
    const studentId = typeof body.studentId === 'string' ? body.studentId : ''
    const type = typeof body.type === 'string' ? body.type : ''
    const templateId = typeof body.templateId === 'string' && body.templateId ? body.templateId : null
    const isTemporary = body.isTemporary === true
    const purpose = typeof body.purpose === 'string' ? body.purpose.trim() : ''
    const remarks = typeof body.remarks === 'string' ? body.remarks.trim() : ''

    if (!studentId) return apiError(422, 'Please select a student.')
    if (!CERTIFICATE_TYPE_VALUES.includes(type)) {
      return apiError(422, 'Please select a valid certificate type.')
    }

    let effectiveDate: Date | null = null
    if (typeof body.effectiveDate === 'string' && body.effectiveDate.trim()) {
      const d = new Date(body.effectiveDate)
      if (Number.isNaN(d.getTime())) return apiError(422, 'Invalid effective date.')
      effectiveDate = d
    }

    // Tenant-scoped student check — this is a READ-ONLY lookup, nothing is
    // changed on the student record regardless of certificate type.
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, 'Student not found')

    // Optional template — must belong to this school and match the chosen type.
    let template: { id: string; numberPrefix: string } | null = null
    if (templateId) {
      template = await db.certificateTemplate.findFirst({
        where: { id: templateId, schoolId: user.schoolId, type, deletedAt: null, isActive: true },
        select: { id: true, numberPrefix: true },
      })
      if (!template) return apiError(404, 'Certificate template not found for the selected type.')
    }

    // Snapshot the student + school data at issue time (read-only).
    const snapshot = await buildCertificateSnapshot(user.schoolId, studentId)
    if (!snapshot) return apiError(404, 'Student data could not be loaded.')

    const result = await db.$transaction(async (tx) => {
      const certificateNumber = await allocateCertificateNumber(
        tx,
        user.schoolId!,
        template?.numberPrefix || 'CERT',
      )
      return tx.certificate.create({
        data: {
          schoolId: user.schoolId!,
          studentId,
          templateId: template?.id || null,
          certificateNumber,
          type,
          issueDate: new Date(),
          effectiveDate,
          purpose: purpose || null,
          remarks: remarks || null,
          isTemporary,
          studentSnapshotJson: JSON.stringify(snapshot),
          issuedBy: user.userId,
        },
      })
    })

    return NextResponse.json({ certificate: result }, { status: 201 })
  } catch (error) {
    console.error('Issue certificate error:', error)
    return internalError('issuing certificate')
  }
}