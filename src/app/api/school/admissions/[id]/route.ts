import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError, forbiddenError } from '@/lib/api-errors'

// GET /api/school/admissions/[id] - Get single admission with all details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    // Check admission:read permission for non-SUPER_ADMIN
    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:read')
      if (!authorized) {
        return forbiddenError("You don't have access to the Admissions section. Please contact your school administrator.")
      }
    }

    const { id } = await params

    const admission = await db.admission.findFirst({
      where: {
        id,
        schoolId: user.schoolId,
        deletedAt: null,
      },
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
            rollNumber: true,
          },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    })

    if (!admission) {
      return apiError(404, "We couldn't find this admission record. It may have been removed or the link may be incorrect.")
    }

    // Fetch class and section names separately
    const [classData, sectionData, siblingData] = await Promise.all([
      admission.classId ? db.class.findFirst({ where: { id: admission.classId }, select: { id: true, name: true } }) : null,
      admission.sectionId ? db.section.findFirst({ where: { id: admission.sectionId }, select: { id: true, name: true } }) : null,
      admission.siblingId ? db.student.findUnique({ where: { id: admission.siblingId }, select: { id: true, firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true } } } }) : null,
    ])

    return NextResponse.json({
      ...admission,
      class: classData,
      section: sectionData,
      sibling: admission.siblingId && siblingData ? { id: siblingData.id, firstName: siblingData.firstName, lastName: siblingData.lastName, admissionNumber: siblingData.admissionNumber, className: siblingData.class?.name || null } : null,
    })
  } catch (error) {
    console.error('Get admission error:', error)
    return internalError('fetching the admission')
  }
}

// PUT /api/school/admissions/[id] - Update admission fields and workflow status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    // Check admission:update permission for non-SUPER_ADMIN
    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:update')
      if (!authorized) {
        return forbiddenError("You don't have permission to update admissions. Please contact your school administrator.")
      }
    }

    const { id } = await params
    const body = await request.json()

    // Fetch existing admission
    const admission = await db.admission.findFirst({
      where: {
        id,
        schoolId: user.schoolId,
        deletedAt: null,
      },
    })

    if (!admission) {
      return apiError(404, "We couldn't find this admission record. It may have been removed or the link may be incorrect.")
    }

    const currentStatus = admission.status
    const newStatus = body.status

    // Simplified workflow: only allow rejecting admitted admissions
    // Direct admission means status is already "admitted" on creation
    if (newStatus && newStatus !== currentStatus) {
      if (newStatus === 'rejected' && currentStatus === 'admitted') {
        // Allow rejecting admitted admissions
      } else {
        return NextResponse.json({ message: "This admission can't be changed to that status. Only rejection is allowed at this point.", allowedTransitions: currentStatus === 'admitted' ? ['rejected'] : [] }, { status: 400 })
      }
    }

    const updateData: Record<string, unknown> = {}
    const activityRecords: Array<{
      action: string
      fromValue?: string | null
      toValue?: string | null
      description?: string
    }> = []

    // Handle status change (rejection)
    if (newStatus === 'rejected' && currentStatus === 'admitted') {
      updateData.status = 'rejected'
      updateData.rejectedReason = body.rejectedReason || null
      activityRecords.push({
        action: 'rejected',
        fromValue: currentStatus,
        toValue: 'rejected',
        description: `Rejected${body.rejectedReason ? ': ' + body.rejectedReason : ''}`,
      })
    }

    // Handle regular field updates (including new fields)
    const updatableFields = [
      'academicYear', 'admissionType',
      'firstName', 'lastName', 'dateOfBirth', 'dateOfAdmission', 'gender', 'nationality',
      'religion', 'category', 'caste', 'motherTongue', 'aadhaarNumber', 'bloodGroup',
      'medicalConditions', 'profileImage',
      'registrationNumber', 'penNumber', 'samagraId', 'apaarId', 'udiseId',
      'heightCm', 'weightKg',
      // Contact / Address
      'address', 'city', 'state', 'pincode', 'country',
      'village', 'postOffice', 'policeStation', 'wardNo',
      'localAddress', 'localCity', 'localState', 'localPincode', 'localCountry',
      'sameAsPermanent',
      // Mother
      'motherName', 'motherPhone', 'motherEmail', 'motherOccupation', 'motherAadhaar',
      'motherEducation', 'motherIncome',
      // Father
      'fatherName', 'fatherPhone', 'fatherEmail', 'fatherOccupation', 'fatherAadhaar',
      'fatherEducation', 'fatherIncome',
      // Other
      'belongsToEws', 'isSingleGirlChild', 'isDivyangian',
      // General
      'classId', 'sectionId', 'admissionSession', 'mediumOfInstruction', 'area',
      // Last Institution
      'previousSchool', 'previousSchoolAddress', 'previousClass', 'previousResult',
      'affiliatedTo', 'previousSchoolTC', 'tcDate',
      // Transport & Hostel
      'transportRouteId', 'transportStop',
      'hostelName', 'hostelRoomNo', 'hostelBedNo',
      // Accounts
      'bankAccountNumber', 'ifscCode', 'monthlyFeeDiscount', 'feeId',
      'concessionNo', 'transportDiscount', 'feesGroupId',
      'annualIncome', 'siblingId', 'remarks',
      // Address
      'sameAddressAsStudent', 'fatherAddress', 'motherAddress',
      // Concession & Source
      'concessionType', 'concessionReason', 'sourceOfInfo', 'formNumber',
    ]

    for (const field of updatableFields) {
      if (body[field] !== undefined) {
        const dateFields = ['dateOfBirth', 'dateOfAdmission', 'tcDate']
        const newValue = dateFields.includes(field) && body[field]
          ? new Date(body[field])
          : body[field]

        updateData[field] = newValue

        // Track significant field changes as activities
        const significantFields = [
          'firstName', 'lastName', 'dateOfBirth', 'gender', 'category',
          'classId', 'sectionId',
          'fatherName', 'fatherPhone', 'motherName', 'motherPhone',
          'concessionType', 'concessionReason', 'sourceOfInfo',
        ]

        if (significantFields.includes(field)) {
          const oldValue = admission[field as keyof typeof admission]
          const oldStr = oldValue instanceof Date
            ? oldValue.toISOString()
            : String(oldValue ?? '')
          const newStr = newValue instanceof Date
            ? newValue.toISOString()
            : String(newValue ?? '')

          if (oldStr !== newStr) {
            activityRecords.push({
              action: 'field_updated',
              fromValue: oldStr,
              toValue: newStr,
              description: `Field "${field}" updated`,
            })
          }
        }
      }
    }

    const updatedAdmission = await db.admission.update({
      where: { id },
      data: updateData,
      include: {
        student: {
          select: { id: true, admissionNumber: true, firstName: true, lastName: true },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    // Create activity records for all tracked changes
    if (activityRecords.length > 0) {
      await db.admissionActivity.createMany({
        data: activityRecords.map((activity) => ({
          admissionId: id,
          action: activity.action,
          fromValue: activity.fromValue || null,
          toValue: activity.toValue || null,
          performedBy: user.userId!,
          description: activity.description || null,
        })),
      })
    }

    return NextResponse.json(updatedAdmission)
  } catch (error) {
    console.error('Update admission error:', error)
    return internalError('updating the admission')
  }
}

// DELETE /api/school/admissions/[id] - Soft delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    // Check admission:delete permission for non-SUPER_ADMIN
    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:delete')
      if (!authorized) {
        return forbiddenError("You don't have permission to delete admissions. Please contact your school administrator.")
      }
    }

    const { id } = await params

    const admission = await db.admission.findFirst({
      where: {
        id,
        schoolId: user.schoolId,
        deletedAt: null,
      },
    })

    if (!admission) {
      return apiError(404, "We couldn't find this admission record. It may have been removed or the link may be incorrect.")
    }

    // Soft delete
    await db.admission.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    // Create activity record for deletion
    await db.admissionActivity.create({
      data: {
        admissionId: id,
        action: 'status_changed',
        fromValue: admission.status,
        toValue: 'deleted',
        performedBy: user.userId!,
        description: 'Admission record deleted',
      },
    })

    return NextResponse.json({ message: 'Admission record has been deleted successfully.' })
  } catch (error) {
    console.error('Delete admission error:', error)
    return internalError('deleting the admission')
  }
}
