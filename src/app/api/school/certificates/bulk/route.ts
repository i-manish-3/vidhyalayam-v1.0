import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'
import { CERTIFICATE_TYPE_VALUES, allocateCertificateNumbers } from '@/features/certificates/lib/certificate-types'
import { buildCertificateSnapshots } from '@/features/certificates/lib/certificate-snapshot'

const MAX_BULK_STUDENTS = 500

// POST /api/school/certificates/bulk
// Issue one certificate per selected student in a single atomic operation.
// Record-only: student rows are READ, never written — no status change, no
// withdrawal, no fee cascades, regardless of certificate type.
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'certificate:issue')
    if (!user?.schoolId) return unauthorizedError()

    let body: {
      studentIds?: unknown
      type?: unknown
      templateId?: unknown
      isTemporary?: unknown
      effectiveDate?: unknown
      purpose?: unknown
      remarks?: unknown
    }
    try {
      body = await request.json()
    } catch {
      return apiError(400, 'Invalid request body.')
    }

    const rawIds = body.studentIds
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return apiError(422, 'Select at least one student.')
    }
    const studentIds = [...new Set(rawIds.filter((x): x is string => typeof x === 'string' && x.length > 0))]
    if (studentIds.length === 0) return apiError(422, 'Select at least one student.')
    if (studentIds.length > MAX_BULK_STUDENTS) {
      return apiError(422, `Bulk issue supports up to ${MAX_BULK_STUDENTS} students at a time.`)
    }

    const type = body.type
    if (typeof type !== 'string' || !CERTIFICATE_TYPE_VALUES.includes(type)) {
      return apiError(422, 'Please select a valid certificate type.')
    }

    const isTemporary = body.isTemporary !== false

    let effectiveDate: Date | null = null
    if (typeof body.effectiveDate === 'string' && body.effectiveDate.trim()) {
      const d = new Date(body.effectiveDate)
      if (Number.isNaN(d.getTime())) return apiError(422, 'Invalid effective date.')
      effectiveDate = d
    }

    const purpose = typeof body.purpose === 'string' ? body.purpose.trim().slice(0, 200) : ''
    const remarks = typeof body.remarks === 'string' ? body.remarks.trim().slice(0, 500) : ''

    // Optional template — must belong to this school and match the chosen type.
    let template: { id: string; numberPrefix: string } | null = null
    if (typeof body.templateId === 'string' && body.templateId) {
      template = await db.certificateTemplate.findFirst({
        where: { id: body.templateId, schoolId: user.schoolId, type, deletedAt: null, isActive: true },
        select: { id: true, numberPrefix: true },
      })
      if (!template) return apiError(404, 'Certificate template not found for the selected type.')
    }

    // Tenant-scoped student check — READ-ONLY lookup, nothing is changed on
    // any student record regardless of certificate type.
    const students = await db.student.findMany({
      where: { id: { in: studentIds }, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (students.length !== studentIds.length) {
      return apiError(404, 'One or more selected students were not found in this school.')
    }

    // Snapshot all students in one round-trip (read-only).
    const snapshots = await buildCertificateSnapshots(user.schoolId, studentIds)
    const missing = studentIds.filter((id) => !snapshots.has(id))
    if (missing.length > 0) return apiError(404, 'Student data could not be loaded for some students.')

    const prefix = template?.numberPrefix || 'CERT'
    const now = new Date()

    const result = await db.$transaction(async (tx) => {
      const numbers = await allocateCertificateNumbers(tx, user.schoolId!, prefix, studentIds.length)
      const rows = studentIds.map((studentId, i) => ({
        schoolId: user.schoolId!,
        studentId,
        templateId: template?.id || null,
        certificateNumber: numbers[i],
        type,
        issueDate: now,
        effectiveDate,
        purpose: purpose || null,
        remarks: remarks || null,
        isTemporary,
        studentSnapshotJson: JSON.stringify(snapshots.get(studentId)!),
        issuedBy: user.userId,
      }))
      return tx.certificate.createManyAndReturn({ data: rows })
    })

    return NextResponse.json(
      {
        count: result.length,
        certificates: result.map((c) => ({
          id: c.id,
          certificateNumber: c.certificateNumber,
          studentId: c.studentId,
          type: c.type,
        })),
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('Bulk issue certificates error:', error)
    return internalError('issuing certificates')
  }
}