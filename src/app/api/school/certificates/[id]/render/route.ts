import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'
import type { CertificateSnapshot } from '@/features/certificates/lib/certificate-types'

// GET /api/school/certificates/[id]/render
// Full payload for the printable certificate page: the record, its template,
// the student/school snapshot captured at issue time, and school branding.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'certificate:read')
    if (!user?.schoolId) return unauthorizedError()
    const { id } = await params

    const certificate = await db.certificate.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
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
        studentSnapshotJson: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            profileImage: true,
          },
        },
        template: {
          select: {
            id: true,
            name: true,
            numberPrefix: true,
            bodyHtml: true,
            description: true,
          },
        },
      },
    })
    if (!certificate) return apiError(404, 'Certificate not found')

    let snapshot: CertificateSnapshot | null = null
    try {
      snapshot = JSON.parse(certificate.studentSnapshotJson) as CertificateSnapshot
    } catch {
      snapshot = null
    }
    if (!snapshot) return apiError(500, 'Certificate snapshot is corrupted.')

    const school = await db.school.findFirst({
      where: { id: user.schoolId },
      select: {
        id: true,
        name: true,
        logo: true,
        printHeader: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        contactPhone: true,
        contactEmail: true,
        website: true,
        board: true,
        principalName: true,
        principalSignature: true,
        trustName: true,
        academicYear: true,
      },
    })

    return NextResponse.json({ certificate, snapshot, school })
  } catch (error) {
    console.error('Render certificate error:', error)
    return internalError('loading certificate')
  }
}