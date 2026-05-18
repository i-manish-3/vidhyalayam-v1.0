import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/admissions/[id]/documents - List documents for an admission
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params

    // Verify admission belongs to this school
    const admission = await db.admission.findFirst({
      where: { id, schoolId: user.schoolId },
      select: { id: true },
    })

    if (!admission) {
      return apiError(404, 'We couldn\'t find this admission record. It may have been removed.')
    }

    const documents = await db.admissionDocument.findMany({
      where: { admissionId: id },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ documents })
  } catch (error) {
    console.error('List admission documents error:', error)
    return internalError('listing admission documents')
  }
}

// POST /api/school/admissions/[id]/documents - Upload/create a document record
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params

    // Verify admission belongs to this school
    const admission = await db.admission.findFirst({
      where: { id, schoolId: user.schoolId },
      select: { id: true },
    })

    if (!admission) {
      return apiError(404, 'We couldn\'t find this admission record. It may have been removed.')
    }

    const body = await request.json()
    const { documentType, documentName, fileUrl, fileSize, fileType, isRequired } = body

    if (!documentType || !documentName) {
      return apiError(400, 'Please select a document type and enter the document name.')
    }

    // Upsert the document (update if exists, create if not)
    const existing = await db.admissionDocument.findFirst({
      where: { admissionId: id, documentType },
    })

    let document
    if (existing) {
      document = await db.admissionDocument.update({
        where: { id: existing.id },
        data: {
          documentName,
          fileUrl: fileUrl || existing.fileUrl,
          fileSize: fileSize ?? existing.fileSize,
          fileType: fileType ?? existing.fileType,
          uploadedAt: new Date(),
          verificationStatus: 'pending',
          isRequired: isRequired ?? existing.isRequired,
        },
      })
    } else {
      document = await db.admissionDocument.create({
        data: {
          admissionId: id,
          documentType,
          documentName,
          fileUrl: fileUrl || null,
          fileSize: fileSize || null,
          fileType: fileType || null,
          isRequired: isRequired ?? true,
          verificationStatus: 'pending',
        },
      })
    }

    return NextResponse.json({ document })
  } catch (error) {
    console.error('Create admission document error:', error)
    return internalError('creating admission document')
  }
}
