import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'
import { uploadIfDataUrl, deleteFile, DOCUMENT_MIME_TYPES } from '@/lib/storage'

type RouteParams = { params: Promise<{ id: string; docId: string }> }

const DOC_MAX_BYTES = 200 * 1024 // 200 KB — matches admission wizard / edit-student UI

async function loadDocument(admissionId: string, docId: string, schoolId: string) {
  const admission = await db.admission.findFirst({
    where: { id: admissionId, schoolId },
    select: { id: true },
  })
  if (!admission) return { error: 'admission' as const }

  const doc = await db.admissionDocument.findFirst({
    where: { id: docId, admissionId },
  })
  if (!doc) return { error: 'document' as const }

  return { admission, doc }
}

// PATCH — verify or reject a document. Body: { action: 'verify' | 'reject', reason?: string }
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:approve')
      if (!authorized) {
        return forbiddenError("You don't have permission to verify documents.")
      }
    }

    const { id, docId } = await params
    const body = await request.json().catch(() => ({}))
    const action = body?.action

    if (action !== 'verify' && action !== 'reject') {
      return apiError(400, "Action must be 'verify' or 'reject'.")
    }

    const loaded = await loadDocument(id, docId, user.schoolId)
    if ('error' in loaded) {
      return apiError(404, loaded.error === 'admission'
        ? "We couldn't find this admission record. It may have been removed."
        : "We couldn't find this document. It may have been removed.")
    }

    if (action === 'verify') {
      const updated = await db.$transaction(async (tx) => {
        const next = await tx.admissionDocument.update({
          where: { id: docId },
          data: {
            verificationStatus: 'verified',
            verifiedBy: user.userId!,
            verifiedAt: new Date(),
            rejectionReason: null,
          },
        })
        await tx.admissionActivity.create({
          data: {
            admissionId: id,
            action: 'document_verified',
            fromValue: loaded.doc.verificationStatus,
            toValue: 'verified',
            performedBy: user.userId!,
            description: `Document verified: ${loaded.doc.documentName}`,
          },
        })
        return next
      })
      return NextResponse.json({ document: updated })
    }

    // action === 'reject'
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if (!reason) {
      return apiError(400, 'Please provide a reason for rejecting this document.')
    }
    if (reason.length > 500) {
      return apiError(400, 'Rejection reason must be 500 characters or fewer.')
    }

    const updated = await db.$transaction(async (tx) => {
      const next = await tx.admissionDocument.update({
        where: { id: docId },
        data: {
          verificationStatus: 'rejected',
          verifiedBy: user.userId!,
          verifiedAt: new Date(),
          rejectionReason: reason,
        },
      })
      await tx.admissionActivity.create({
        data: {
          admissionId: id,
          action: 'document_rejected',
          fromValue: loaded.doc.verificationStatus,
          toValue: 'rejected',
          performedBy: user.userId!,
          description: `Document rejected: ${loaded.doc.documentName}. Reason: ${reason}`,
        },
      })
      return next
    })
    return NextResponse.json({ document: updated })
  } catch (error) {
    console.error('Update admission document error:', error)
    return internalError('updating the document')
  }
}

// PUT — re-upload the file for a document. Body: { fileUrl: dataURL, fileSize?: KB, fileType?: string, documentName?: string }
export async function PUT(request: NextRequest, { params }: RouteParams) {
  let uploadedUrlForCleanup: string | null = null
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:update')
      if (!authorized) {
        return forbiddenError("You don't have permission to update documents.")
      }
    }

    const { id, docId } = await params
    const loaded = await loadDocument(id, docId, user.schoolId)
    if ('error' in loaded) {
      return apiError(404, loaded.error === 'admission'
        ? "We couldn't find this admission record. It may have been removed."
        : "We couldn't find this document. It may have been removed.")
    }

    const body = await request.json()
    const upload = await uploadIfDataUrl(body?.fileUrl, {
      folder: `schools/${user.schoolId}/admissions/${id}/documents`,
      maxBytes: DOC_MAX_BYTES,
      allowedMimeTypes: DOCUMENT_MIME_TYPES,
      previousUrl: loaded.doc.fileUrl ?? undefined,
    })
    if (upload.error) {
      return apiError(400, `Document file: ${upload.error}`)
    }
    if (!upload.uploaded || !upload.url) {
      return apiError(400, 'A file is required for re-upload.')
    }
    uploadedUrlForCleanup = upload.url

    const documentName = typeof body?.documentName === 'string' && body.documentName.trim()
      ? body.documentName.trim()
      : loaded.doc.documentName

    const updated = await db.$transaction(async (tx) => {
      const next = await tx.admissionDocument.update({
        where: { id: docId },
        data: {
          documentName,
          fileUrl: upload.url,
          fileSize: typeof body?.fileSize === 'number' && body.fileSize >= 0 ? Math.round(body.fileSize) : null,
          fileType: typeof body?.fileType === 'string' && body.fileType ? body.fileType : null,
          uploadedAt: new Date(),
          verificationStatus: 'pending',
          verifiedBy: null,
          verifiedAt: null,
          rejectionReason: null,
        },
      })
      await tx.admissionActivity.create({
        data: {
          admissionId: id,
          action: 'document_uploaded',
          fromValue: loaded.doc.verificationStatus,
          toValue: 'pending',
          performedBy: user.userId!,
          description: `Document re-uploaded: ${next.documentName}`,
        },
      })
      return next
    })
    // Transaction succeeded — uploadIfDataUrl already deleted the previous file
    // because we passed previousUrl. The new one stays.
    uploadedUrlForCleanup = null
    return NextResponse.json({ document: updated })
  } catch (error) {
    if (uploadedUrlForCleanup) {
      try { await deleteFile(uploadedUrlForCleanup) } catch (cleanupErr) {
        console.warn('Document re-upload cleanup failed:', cleanupErr)
      }
    }
    console.error('Re-upload admission document error:', error)
    return internalError('re-uploading the document')
  }
}

// DELETE — remove the document row and its file.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:update')
      if (!authorized) {
        return forbiddenError("You don't have permission to delete documents.")
      }
    }

    const { id, docId } = await params
    const loaded = await loadDocument(id, docId, user.schoolId)
    if ('error' in loaded) {
      return apiError(404, loaded.error === 'admission'
        ? "We couldn't find this admission record. It may have been removed."
        : "We couldn't find this document. It may have been removed.")
    }

    await db.$transaction(async (tx) => {
      await tx.admissionDocument.delete({ where: { id: docId } })
      await tx.admissionActivity.create({
        data: {
          admissionId: id,
          action: 'document_deleted',
          fromValue: loaded.doc.verificationStatus,
          performedBy: user.userId!,
          description: `Document deleted: ${loaded.doc.documentName}`,
        },
      })
    })

    if (loaded.doc.fileUrl) {
      try { await deleteFile(loaded.doc.fileUrl) } catch (cleanupErr) {
        console.warn('Document file cleanup failed:', cleanupErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete admission document error:', error)
    return internalError('deleting the document')
  }
}
