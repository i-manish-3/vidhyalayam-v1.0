import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'
import { uploadIfDataUrl, deleteFile, IMAGE_MIME_TYPES, DOCUMENT_MIME_TYPES } from '@/lib/storage'

function normName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed ? trimmed.toUpperCase() : null
}

function normDigits(v: unknown, maxLen?: number): string | null {
  if (typeof v !== 'string') return null
  const digits = v.replace(/\D/g, '')
  if (!digits) return null
  return maxLen ? digits.slice(0, maxLen) : digits
}

function optionalString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function optionalNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  const parsed = Number(v)
  return Number.isFinite(parsed) ? parsed : null
}

async function syncParentLogin(parentId: string, schoolId: string, phone: string | null, name: string | null) {
  const cleanPhone = normDigits(phone, 10)
  if (!cleanPhone) return

  const parent = await db.parent.findUnique({
    where: { id: parentId },
    select: { userId: true },
  })
  if (!parent) return

  const parentEmail = `${cleanPhone}@parent.local`
  const existingUser = await db.user.findFirst({
    where: {
      OR: [
        { phone: cleanPhone, schoolId, deletedAt: null },
        { email: parentEmail, deletedAt: null },
      ],
    },
  })

  if (existingUser && existingUser.role === 'PARENT') {
    await db.parent.update({
      where: { id: parentId },
      data: { userId: existingUser.id },
    })
    if (name && existingUser.name !== name) {
      await db.user.update({
        where: { id: existingUser.id },
        data: { name },
      })
    }
    return
  }

  if (existingUser && existingUser.id !== parent.userId) return

  if (parent.userId) {
    await db.user.update({
      where: { id: parent.userId },
      data: {
        email: parentEmail,
        phone: cleanPhone,
        ...(name ? { name } : {}),
      },
    })
  }
}

async function syncStudentParentContacts(
  studentId: string,
  schoolId: string,
  admissionData: Record<string, unknown>
) {
  const fatherName = normName(admissionData.fatherName)
  const fatherPhone = normDigits(admissionData.fatherPhone, 10)
  const motherName = normName(admissionData.motherName)
  const motherPhone = normDigits(admissionData.motherPhone, 10)
  const fatherEmail = optionalString(admissionData.fatherEmail)?.trim() || null
  const motherEmail = optionalString(admissionData.motherEmail)?.trim() || null
  const address = optionalString(admissionData.address)?.trim() || null

  const syncRelation = async (
    relation: 'Father' | 'Mother',
    parentData: {
      fatherName?: string | null
      motherName?: string | null
      phone?: string | null
      alternatePhone?: string | null
      email?: string | null
      occupation?: string | null
      address?: string | null
      annualIncome?: number | null
    },
    shouldCreate = Object.values(parentData).some((value) => value !== undefined && value !== null && value !== '')
  ) => {
    const link = await db.studentParent.findFirst({
      where: { studentId, relation },
      include: { parent: { select: { id: true } } },
    })

    if (link) {
      await db.parent.update({
        where: { id: link.parent.id },
        data: parentData,
      })
      return link.parent.id
    }

    if (!shouldCreate) return null

    const parent = await db.parent.create({
      data: {
        schoolId,
        ...parentData,
      },
    })
    await db.studentParent.create({
      data: {
        studentId,
        parentId: parent.id,
        relation,
        isPrimary: relation === 'Father',
      },
    })
    return parent.id
  }

  const fatherParentId = await syncRelation('Father', {
    fatherName,
    motherName: null,
    phone: fatherPhone,
    alternatePhone: motherPhone,
    email: fatherEmail || motherEmail,
    occupation: optionalString(admissionData.fatherOccupation)?.trim() || null,
    address,
    annualIncome: optionalNumber(admissionData.fatherIncome) ?? null,
  })

  const motherParentId = await syncRelation('Mother', {
    fatherName: null,
    motherName,
    phone: motherPhone || fatherPhone,
    alternatePhone: null,
    email: motherEmail || fatherEmail,
    occupation: optionalString(admissionData.motherOccupation)?.trim() || null,
    address,
    annualIncome: optionalNumber(admissionData.motherIncome) ?? null,
  }, !!(motherName || motherPhone || motherEmail || optionalString(admissionData.motherOccupation)?.trim() || optionalNumber(admissionData.motherIncome)))

  if (fatherParentId && fatherPhone) {
    await syncParentLogin(fatherParentId, schoolId, fatherPhone, fatherName || motherName || null)
  } else if (motherParentId && motherPhone) {
    await syncParentLogin(motherParentId, schoolId, motherPhone, motherName || fatherName || null)
  }
}

// GET /api/school/students/[id] - Get full student details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'PARENT', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SUPER_ADMIN' && user.role !== 'TEACHER' && user.role !== 'PARENT') {
      const authorized = await requirePermission(request, 'student:read')
      if (!authorized) return forbiddenError("You don't have permission to view student details.")
    }

    const { id } = await params

    // Optional academicYear context: when provided we overlay class / section /
    // rollNumber / enrollment status from that year's StudentAcademicEnrollment
    // snapshot, instead of the (current) values stored on Student. Personal
    // info, parents, admission record stay the same — those are year-independent.
    const { searchParams } = new URL(request.url)
    const requestedAcademicYear = (searchParams.get('academicYear') || '').trim() || null

    // If PARENT role, verify this student belongs to the parent
    if (user.role === 'PARENT') {
      const parentRecords = await db.parent.findMany({
        where: { userId: user.userId, schoolId: user.schoolId },
        select: { id: true },
      })
      const parentIds = parentRecords.map(p => p.id)
      const studentLink = await db.studentParent.findFirst({
        where: { studentId: id, parentId: { in: parentIds } },
      })
      if (!studentLink) {
        return apiError(403, 'You can only view details of students linked to your account. If you think this is a mistake, please contact the school.')
      }
    }

    // Fetch student with parent links
    const student = await db.student.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: {
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        houseMembership: { select: { id: true, name: true, color: true } },
        parentLinks: {
          include: {
            parent: true,
          },
        },
        admission: {
          select: {
            id: true,
            admissionNumber: true,
            academicYear: true,
            status: true,
            dateOfAdmission: true,
            admittedAt: true,
            // Personal
            nationality: true,
            religion: true,
            category: true,
            caste: true,
            motherTongue: true,
            aadhaarNumber: true,
            bloodGroup: true,
            medicalConditions: true,
            profileImage: true,
            registrationNumber: true,
            penNumber: true,
            samagraId: true,
            apaarId: true,
            udiseId: true,
            heightCm: true,
            weightKg: true,
            // Contact / Address
            address: true,
            city: true,
            state: true,
            pincode: true,
            country: true,
            village: true,
            postOffice: true,
            policeStation: true,
            wardNo: true,
            localAddress: true,
            localVillage: true,
            localPostOffice: true,
            localPoliceStation: true,
            localWardNo: true,
            localCity: true,
            localState: true,
            localPincode: true,
            localCountry: true,
            sameAsPermanent: true,
            // Father
            fatherName: true,
            fatherPhone: true,
            fatherEmail: true,
            fatherOccupation: true,
            fatherAadhaar: true,
            fatherEducation: true,
            fatherIncome: true,
            // Mother
            motherName: true,
            motherPhone: true,
            motherEmail: true,
            motherOccupation: true,
            motherAadhaar: true,
            motherEducation: true,
            motherIncome: true,
            // Other
            belongsToEws: true,
            isSingleGirlChild: true,
            isDivyangian: true,
            // General
            mediumOfInstruction: true,
            area: true,
            // Previous School
            previousSchool: true,
            previousSchoolAddress: true,
            previousClass: true,
            previousResult: true,
            affiliatedTo: true,
            previousSchoolTC: true,
            tcDate: true,
            // Transport & Hostel
            transportRouteId: true,
            transportStop: true,
            hostelName: true,
            hostelRoomNo: true,
            hostelBedNo: true,
            // Accounts
            bankAccountNumber: true,
            ifscCode: true,
            feesGroupId: true,
            // Sibling
            siblingId: true,
            // Dates
            appliedDate: true,
            remarks: true,
            documents: {
              select: {
                id: true,
                documentType: true,
                documentName: true,
                fileUrl: true,
                fileSize: true,
                fileType: true,
                uploadedAt: true,
                verificationStatus: true,
                isRequired: true,
                verifiedAt: true,
                verifiedBy: true,
                rejectionReason: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        academicEnrollments: {
          where: { deletedAt: null },
          include: {
            class: { select: { id: true, name: true } },
            section: { select: { id: true, name: true } },
          },
          orderBy: { academicYear: 'desc' },
        },
      },
    })

    if (!student) {
      return apiError(404, 'Student not found.')
    }

    // Surface active transport allocations (per academic year) so the UI can
    // conditionally show transport-related actions (e.g. carry forward on
    // promotion) without an extra round-trip.
    const transportAllocations = await db.transportAllocation.findMany({
      where: {
        schoolId: user.schoolId,
        studentId: student.id,
        isActive: true,
      },
      include: {
        route: { select: { id: true, routeName: true, routeNumber: true, startPoint: true, endPoint: true } },
      },
      orderBy: { academicYear: 'desc' },
    })

    const hostelAllocations = await db.hostelAllocation.findMany({
      where: {
        schoolId: user.schoolId,
        studentId: student.id,
        isActive: true,
      },
      include: {
        hostel: { select: { id: true, name: true, type: true } },
        room: { select: { id: true, roomNumber: true, roomType: true } },
        bed: { select: { id: true, bedNumber: true } },
      },
      orderBy: { academicYear: 'desc' },
    })

    // If PARENT role and student is disabled, block access
    if (user.role === 'PARENT' && !student.isActive) {
      return apiError(403, 'This student\'s account has been disabled by the school. Please contact the school administration for more information.')
    }

    // Fetch siblings via shared familyId. We fall back to the legacy
    // siblingId pointer only when familyId is missing (pre-backfill data),
    // so existing single-pointer links don't silently disappear.
    type SiblingInfo = { id: string; firstName: string; lastName: string | null; admissionNumber: string | null; className: string | null }
    let siblings: SiblingInfo[] = []
    if (student.familyId) {
      const rows = await db.student.findMany({
        where: {
          familyId: student.familyId,
          id: { not: student.id },
          deletedAt: null,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          class: { select: { name: true } },
        },
        orderBy: { admissionNumber: 'asc' },
      })
      siblings = rows.map(r => ({
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        admissionNumber: r.admissionNumber,
        className: r.class?.name || null,
      }))
    } else {
      const sibId = student.admission?.siblingId || student.siblingId
      if (sibId) {
        const sib = await db.student.findUnique({
          where: { id: sibId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            class: { select: { name: true } },
          },
        })
        if (sib) {
          siblings = [{
            id: sib.id,
            firstName: sib.firstName,
            lastName: sib.lastName,
            admissionNumber: sib.admissionNumber,
            className: sib.class?.name || null,
          }]
        }
      }
    }

    // Resolve the academic-year overlay. If the caller asked for a specific
    // year, find that enrollment row and surface its class/section/roll/status
    // so the UI can show the student's state *in that year* instead of today.
    type EnrollmentRow = (typeof student.academicEnrollments)[number]
    const enrollments: EnrollmentRow[] = student.academicEnrollments || []
    let activeEnrollment: EnrollmentRow | undefined
    if (requestedAcademicYear) {
      activeEnrollment = enrollments.find((enrollment) => enrollment.academicYear === requestedAcademicYear)
    }

    const academicYearContext = {
      requestedAcademicYear,
      resolvedAcademicYear: activeEnrollment?.academicYear || null,
      availableYears: Array.from(new Set(enrollments.map((enrollment) => enrollment.academicYear))).sort().reverse(),
      hasEnrollmentForRequestedYear: !!activeEnrollment,
      yearScoped: activeEnrollment
        ? {
            classId: activeEnrollment.class?.id || null,
            className: activeEnrollment.class?.name || null,
            sectionId: activeEnrollment.section?.id || null,
            sectionName: activeEnrollment.section?.name || null,
            rollNumber: activeEnrollment.rollNumber || null,
            status: activeEnrollment.status,
            effectiveFrom: activeEnrollment.effectiveFrom,
            effectiveTo: activeEnrollment.effectiveTo,
          }
        : null,
    }

    const sessionClass = activeEnrollment?.class || student.class
    const sessionSection = activeEnrollment?.section || student.section
    const sessionRollNumber = activeEnrollment ? (activeEnrollment.rollNumber ?? null) : student.rollNumber

    // Resolve fees group for the session being viewed. StudentFeeAssignment
    // is per-academic-year, so we prefer the active assignment for the
    // resolved year and fall back to the admission's static feesGroupId only
    // when no per-session assignment exists.
    let feesGroup: { id: string; name: string } | null = null
    const viewYear = requestedAcademicYear || activeEnrollment?.academicYear || null
    const sessionAssignment = await db.studentFeeAssignment.findFirst({
      where: {
        studentId: student.id,
        schoolId: user.schoolId,
        deletedAt: null,
        status: 'active',
        ...(viewYear ? { academicYear: viewYear } : {}),
      },
      orderBy: viewYear ? undefined : { academicYear: 'desc' },
      select: { feesGroup: { select: { id: true, name: true } } },
    })
    if (sessionAssignment?.feesGroup) {
      feesGroup = sessionAssignment.feesGroup
    } else if (student.admission?.feesGroupId) {
      feesGroup = await db.feesGroup.findUnique({
        where: { id: student.admission.feesGroupId },
        select: { id: true, name: true },
      })
    }

    return NextResponse.json({
      ...student,
      class: sessionClass,
      section: sessionSection,
      rollNumber: sessionRollNumber,
      admission: student.admission ? { ...student.admission, feesGroup } : null,
      assignedHouse: student.houseMembership,
      siblings,
      sibling: siblings[0] || null, // legacy field for any frontend not yet updated
      transportAllocations,
      hostelAllocations,
      academicYearContext,
    })
  } catch (error) {
    console.error('Get student error:', error)
    return internalError('loading student details')
  }
}

// PATCH /api/school/students/[id] - Update student
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params
    const body = await request.json()

    // If isActive is being toggled, the user needs student:enable_disable.
    // Any other field updates require student:update. We allow both at once
    // (e.g., disable + edit) as long as the user has both permissions.
    if (user.role !== 'SUPER_ADMIN') {
      const isTogglingActive = body && typeof body === 'object' && 'isActive' in body
      const hasOtherFields = body && typeof body === 'object' && Object.keys(body).some(k => k !== 'isActive')

      if (isTogglingActive) {
        const authorized = await requirePermission(request, 'student:enable_disable')
        if (!authorized) return forbiddenError("You don't have permission to enable or disable students.")
      }
      if (hasOtherFields) {
        const authorized = await requirePermission(request, 'student:update')
        if (!authorized) return forbiddenError("You don't have permission to edit students.")
      }
    }

    // Verify student belongs to this school
    const student = await db.student.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!student) {
      return apiError(404, 'We couldn\'t find this student\'s record. It may have been removed or the link may be incorrect.')
    }

    // Reject transport mutations on this endpoint. Transport changes are
    // billing events that must go through the dedicated endpoints
    // (POST /transport, POST /transport/withdraw) so fee ledgers,
    // TransportAllocation history, and TransportEvent timeline stay
    // consistent. Editing transport via this PATCH would silently update
    // the Admission snapshot only — fees and allocation history would
    // diverge from the live billing state.
    //
    // We allow no-op writes (same value as currently stored) so a generic
    // re-save of a student that happens to include unchanged transport
    // fields doesn't fail.
    if (
      body &&
      typeof body === 'object' &&
      body.admission &&
      typeof body.admission === 'object'
    ) {
      const incoming = body.admission as Record<string, unknown>
      const touchesTransport =
        'transportRouteId' in incoming || 'transportStop' in incoming
      if (touchesTransport) {
        const currentAdm = await db.admission.findFirst({
          where: { studentId: id, schoolId: user.schoolId },
          select: { transportRouteId: true, transportStop: true },
        })
        const currentRoute = currentAdm?.transportRouteId ?? null
        const currentStop = currentAdm?.transportStop ?? null
        const proposedRoute =
          'transportRouteId' in incoming
            ? (incoming.transportRouteId as string | null) || null
            : currentRoute
        const proposedStop =
          'transportStop' in incoming
            ? (incoming.transportStop as string | null) || null
            : currentStop
        if (proposedRoute !== currentRoute || proposedStop !== currentStop) {
          return apiError(
            400,
            'Transport changes are not allowed on this endpoint. Use the Add Transport / Discontinue Transport actions on the student profile so fee ledgers and allocation history stay consistent.',
          )
        }
      }
    }

    const {
      firstName,
      lastName,
      classId,
      sectionId,
      rollNumber,
      dateOfBirth,
      gender,
      address,
      city,
      state,
      pincode,
      aadhaarNumber,
      bloodGroup,
      admissionDate,
      previousSchool,
      profileImage,
      isActive,
      siblingId,
      // Admission fields
      admission: admissionData,
    } = body

    // Student model updates
    const studentFields: Record<string, unknown> = {}
    if (firstName !== undefined) studentFields.firstName = normName(firstName)
    if (lastName !== undefined) studentFields.lastName = normName(lastName)
    if (classId !== undefined) studentFields.classId = classId || null
    if (sectionId !== undefined) studentFields.sectionId = sectionId || null
    if (rollNumber !== undefined) studentFields.rollNumber = rollNumber || null
    if (dateOfBirth !== undefined) studentFields.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null
    if (gender !== undefined) studentFields.gender = gender || null
    if (address !== undefined) studentFields.address = address || null
    if (city !== undefined) studentFields.city = city || null
    if (state !== undefined) studentFields.state = state || null
    if (pincode !== undefined) studentFields.pincode = normDigits(pincode, 6)
    if (aadhaarNumber !== undefined) studentFields.aadhaarNumber = normDigits(aadhaarNumber, 12)
    if (bloodGroup !== undefined) studentFields.bloodGroup = bloodGroup || null
    if (admissionDate !== undefined) studentFields.admissionDate = admissionDate ? new Date(admissionDate) : null
    if (previousSchool !== undefined) studentFields.previousSchool = previousSchool || null
    if (profileImage !== undefined) {
      // The student photo is independent from the admission's frozen photo.
      // If the student is still pointing at the admission's URL (initial state
      // right after admission creation), do NOT pass it as previousUrl — that
      // file backs the printable admission form and must never be deleted.
      const linkedAdmission = await db.admission.findFirst({
        where: { studentId: id, schoolId: user.schoolId, deletedAt: null },
        select: { profileImage: true },
      })
      const sharedWithAdmission =
        !!student.profileImage &&
        !!linkedAdmission?.profileImage &&
        student.profileImage === linkedAdmission.profileImage

      const upload = await uploadIfDataUrl(profileImage, {
        folder: `schools/${user.schoolId}/students`,
        maxBytes: 2 * 1024 * 1024,
        allowedMimeTypes: IMAGE_MIME_TYPES,
        previousUrl: sharedWithAdmission ? null : student.profileImage,
      })
      if (upload.error) {
        return apiError(400, `Profile image: ${upload.error}`)
      }
      studentFields.profileImage = upload.url
    }
    if (isActive !== undefined) studentFields.isActive = isActive
    if (siblingId !== undefined) studentFields.siblingId = siblingId || null

    const updated = await db.student.update({
      where: { id },
      data: studentFields,
    })

    // Update admission record if admissionData provided
    if (admissionData && typeof admissionData === 'object') {
      const adm: Record<string, unknown> = {}
      // Personal
      if (admissionData.firstName !== undefined) adm.firstName = normName(admissionData.firstName)
      if (admissionData.lastName !== undefined) adm.lastName = normName(admissionData.lastName)
      if (admissionData.dateOfBirth !== undefined) adm.dateOfBirth = admissionData.dateOfBirth ? new Date(admissionData.dateOfBirth) : null
      if (admissionData.gender !== undefined) adm.gender = admissionData.gender || null
      if (admissionData.nationality !== undefined) adm.nationality = admissionData.nationality || null
      if (admissionData.religion !== undefined) adm.religion = admissionData.religion || null
      if (admissionData.category !== undefined) adm.category = admissionData.category || null
      if (admissionData.caste !== undefined) adm.caste = admissionData.caste || null
      if (admissionData.motherTongue !== undefined) adm.motherTongue = admissionData.motherTongue || null
      if (admissionData.aadhaarNumber !== undefined) adm.aadhaarNumber = normDigits(admissionData.aadhaarNumber, 12)
      if (admissionData.bloodGroup !== undefined) adm.bloodGroup = admissionData.bloodGroup || null
      if (admissionData.medicalConditions !== undefined) adm.medicalConditions = admissionData.medicalConditions || null
      if (admissionData.registrationNumber !== undefined) adm.registrationNumber = admissionData.registrationNumber || null
      if (admissionData.penNumber !== undefined) adm.penNumber = admissionData.penNumber || null
      if (admissionData.samagraId !== undefined) adm.samagraId = admissionData.samagraId || null
      if (admissionData.apaarId !== undefined) adm.apaarId = admissionData.apaarId || null
      if (admissionData.udiseId !== undefined) adm.udiseId = admissionData.udiseId || null
      if (admissionData.heightCm !== undefined) adm.heightCm = admissionData.heightCm ? parseFloat(admissionData.heightCm) : null
      if (admissionData.weightKg !== undefined) adm.weightKg = admissionData.weightKg ? parseFloat(admissionData.weightKg) : null
      // Address
      if (admissionData.address !== undefined) adm.address = admissionData.address || null
      if (admissionData.city !== undefined) adm.city = admissionData.city || null
      if (admissionData.state !== undefined) adm.state = admissionData.state || null
      if (admissionData.pincode !== undefined) adm.pincode = normDigits(admissionData.pincode, 6)
      if (admissionData.country !== undefined) adm.country = admissionData.country || null
      if (admissionData.village !== undefined) adm.village = admissionData.village || null
      if (admissionData.postOffice !== undefined) adm.postOffice = admissionData.postOffice || null
      if (admissionData.policeStation !== undefined) adm.policeStation = admissionData.policeStation || null
      if (admissionData.wardNo !== undefined) adm.wardNo = normDigits(admissionData.wardNo, 3)
      if (admissionData.localAddress !== undefined) adm.localAddress = admissionData.localAddress || null
      if (admissionData.localVillage !== undefined) adm.localVillage = admissionData.localVillage || null
      if (admissionData.localPostOffice !== undefined) adm.localPostOffice = admissionData.localPostOffice || null
      if (admissionData.localPoliceStation !== undefined) adm.localPoliceStation = admissionData.localPoliceStation || null
      if (admissionData.localWardNo !== undefined) adm.localWardNo = normDigits(admissionData.localWardNo, 3)
      if (admissionData.localCity !== undefined) adm.localCity = admissionData.localCity || null
      if (admissionData.localState !== undefined) adm.localState = admissionData.localState || null
      if (admissionData.localPincode !== undefined) adm.localPincode = normDigits(admissionData.localPincode, 6)
      if (admissionData.localCountry !== undefined) adm.localCountry = admissionData.localCountry || null
      if (admissionData.sameAsPermanent !== undefined) adm.sameAsPermanent = admissionData.sameAsPermanent
      // Father
      if (admissionData.fatherName !== undefined) adm.fatherName = normName(admissionData.fatherName)
      if (admissionData.fatherPhone !== undefined) adm.fatherPhone = admissionData.fatherPhone || null
      if (admissionData.fatherEmail !== undefined) adm.fatherEmail = admissionData.fatherEmail || null
      if (admissionData.fatherOccupation !== undefined) adm.fatherOccupation = admissionData.fatherOccupation || null
      if (admissionData.fatherAadhaar !== undefined) adm.fatherAadhaar = normDigits(admissionData.fatherAadhaar, 12)
      if (admissionData.fatherEducation !== undefined) adm.fatherEducation = admissionData.fatherEducation || null
      if (admissionData.fatherIncome !== undefined) adm.fatherIncome = admissionData.fatherIncome ? parseFloat(admissionData.fatherIncome) : null
      // Mother
      if (admissionData.motherName !== undefined) adm.motherName = normName(admissionData.motherName)
      if (admissionData.motherPhone !== undefined) adm.motherPhone = admissionData.motherPhone || null
      if (admissionData.motherEmail !== undefined) adm.motherEmail = admissionData.motherEmail || null
      if (admissionData.motherOccupation !== undefined) adm.motherOccupation = admissionData.motherOccupation || null
      if (admissionData.motherAadhaar !== undefined) adm.motherAadhaar = normDigits(admissionData.motherAadhaar, 12)
      if (admissionData.motherEducation !== undefined) adm.motherEducation = admissionData.motherEducation || null
      if (admissionData.motherIncome !== undefined) adm.motherIncome = admissionData.motherIncome ? parseFloat(admissionData.motherIncome) : null
      // Flags
      if (admissionData.belongsToEws !== undefined) adm.belongsToEws = admissionData.belongsToEws
      if (admissionData.isSingleGirlChild !== undefined) adm.isSingleGirlChild = admissionData.isSingleGirlChild
      if (admissionData.isDivyangian !== undefined) adm.isDivyangian = admissionData.isDivyangian
      // General
      if (admissionData.mediumOfInstruction !== undefined) adm.mediumOfInstruction = admissionData.mediumOfInstruction || null
      if (admissionData.area !== undefined) adm.area = admissionData.area || null
      if (admissionData.classId !== undefined) adm.classId = admissionData.classId || null
      if (admissionData.sectionId !== undefined) adm.sectionId = admissionData.sectionId || null
      // Previous School
      if (admissionData.previousSchool !== undefined) adm.previousSchool = admissionData.previousSchool || null
      if (admissionData.previousSchoolAddress !== undefined) adm.previousSchoolAddress = admissionData.previousSchoolAddress || null
      if (admissionData.previousClass !== undefined) adm.previousClass = admissionData.previousClass || null
      if (admissionData.previousResult !== undefined) adm.previousResult = admissionData.previousResult || null
      if (admissionData.affiliatedTo !== undefined) adm.affiliatedTo = admissionData.affiliatedTo || null
      if (admissionData.previousSchoolTC !== undefined) adm.previousSchoolTC = admissionData.previousSchoolTC || null
      if (admissionData.tcDate !== undefined) adm.tcDate = admissionData.tcDate ? new Date(admissionData.tcDate) : null
      // Transport (transportRouteId / transportStop) deliberately NOT handled
      // here. Mutations to those fields are rejected at the top of the PATCH
      // handler — they must go through POST /students/[id]/transport or
      // POST /students/[id]/transport/withdraw.
      // Hostel
      if (admissionData.hostelName !== undefined) adm.hostelName = admissionData.hostelName || null
      if (admissionData.hostelRoomNo !== undefined) adm.hostelRoomNo = admissionData.hostelRoomNo || null
      if (admissionData.hostelBedNo !== undefined) adm.hostelBedNo = admissionData.hostelBedNo || null
      // Accounts
      if (admissionData.bankAccountNumber !== undefined) adm.bankAccountNumber = admissionData.bankAccountNumber || null
      if (admissionData.ifscCode !== undefined) adm.ifscCode = admissionData.ifscCode || null
      if (admissionData.feesGroupId !== undefined) adm.feesGroupId = admissionData.feesGroupId || null
      if (admissionData.siblingId !== undefined) adm.siblingId = admissionData.siblingId || null
      // Remarks
      if (admissionData.remarks !== undefined) adm.remarks = admissionData.remarks || null

      if (Object.keys(adm).length > 0) {
        await db.admission.updateMany({
          where: { studentId: id, schoolId: user.schoolId, deletedAt: null },
          data: adm,
        })
        await syncStudentParentContacts(id, user.schoolId, admissionData as Record<string, unknown>)
      }

      // Handle documents if provided. Each doc may carry a fileUrl as a data URL
      // (new upload), an https URL (already-uploaded — leave file as-is), or no
      // file (metadata-only update). 200 KB per file matches the wizard / detail
      // page UI, and we delete the previous file when a new one is uploaded so
      // storage doesn't accumulate orphans.
      if (admissionData.documents && Array.isArray(admissionData.documents)) {
        const admissionRecord = await db.admission.findFirst({
          where: { studentId: id, schoolId: user.schoolId, deletedAt: null },
          select: { id: true },
        })

        if (admissionRecord) {
          const newlyUploadedUrls: string[] = []
          try {
            for (const doc of admissionData.documents) {
              if (!doc.documentType || !doc.documentName) continue

              const existing = await db.admissionDocument.findFirst({
                where: { admissionId: admissionRecord.id, documentType: doc.documentType },
              })

              const incomingFileUrl = typeof doc.fileUrl === 'string' ? doc.fileUrl : null
              const isDataUrl = incomingFileUrl?.startsWith('data:') ?? false
              const upload = isDataUrl
                ? await uploadIfDataUrl(incomingFileUrl, {
                    folder: `schools/${user.schoolId}/admissions/${admissionRecord.id}/documents`,
                    maxBytes: 200 * 1024,
                    allowedMimeTypes: DOCUMENT_MIME_TYPES,
                    previousUrl: existing?.fileUrl ?? undefined,
                  })
                : { url: undefined, uploaded: false, error: undefined as string | undefined }

              if (upload.error) {
                return apiError(400, `Document "${doc.documentName}": ${upload.error}`)
              }
              if (upload.uploaded && upload.url) {
                newlyUploadedUrls.push(upload.url)
              }

              const fileSize = typeof doc.fileSize === 'number' && doc.fileSize >= 0 ? Math.round(doc.fileSize) : null
              const fileType = typeof doc.fileType === 'string' && doc.fileType ? doc.fileType : null

              if (existing) {
                await db.admissionDocument.update({
                  where: { id: existing.id },
                  data: {
                    documentName: doc.documentName,
                    ...(upload.uploaded
                      ? {
                          fileUrl: upload.url ?? null,
                          fileSize: fileSize ?? existing.fileSize,
                          fileType: fileType ?? existing.fileType,
                          uploadedAt: new Date(),
                          // Re-upload resets verification — admin must re-verify the new file.
                          verificationStatus: 'pending',
                          verifiedBy: null,
                          verifiedAt: null,
                          rejectionReason: null,
                        }
                      : {
                          uploadedAt: existing.uploadedAt || new Date(),
                        }),
                  },
                })
                if (upload.uploaded) {
                  await db.admissionActivity.create({
                    data: {
                      admissionId: admissionRecord.id,
                      action: 'document_uploaded',
                      fromValue: existing.verificationStatus,
                      toValue: 'pending',
                      performedBy: user.userId!,
                      description: `Document re-uploaded: ${doc.documentName}`,
                    },
                  })
                }
              } else {
                const created = await db.admissionDocument.create({
                  data: {
                    admissionId: admissionRecord.id,
                    documentType: doc.documentType,
                    documentName: doc.documentName,
                    fileUrl: upload.url ?? null,
                    fileSize,
                    fileType,
                    uploadedAt: upload.uploaded ? new Date() : null,
                    isRequired: doc.isRequired !== false,
                    verificationStatus: 'pending',
                  },
                })
                await db.admissionActivity.create({
                  data: {
                    admissionId: admissionRecord.id,
                    action: 'document_uploaded',
                    toValue: 'pending',
                    performedBy: user.userId!,
                    description: `Document uploaded: ${created.documentName}`,
                  },
                })
              }
            }
          } catch (docErr) {
            // A document write failed mid-loop. Clean up any files we uploaded
            // in this request so storage doesn't accumulate orphans.
            for (const url of newlyUploadedUrls) {
              try { await deleteFile(url) } catch (cleanupErr) {
                console.warn('Document cleanup failed:', cleanupErr)
              }
            }
            throw docErr
          }
        }
      }
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update student error:', error)
    return internalError('updating the student record')
  }
}

// DELETE /api/school/students/[id] - Soft delete student
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'student:delete')
      if (!authorized) return forbiddenError("You don't have permission to delete students.")
    }

    const { id } = await params

    // Verify student belongs to this school
    const student = await db.student.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!student) {
      return apiError(404, 'We couldn\'t find this student\'s record. It may have been removed or the link may be incorrect.')
    }

    await db.student.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    })

    return NextResponse.json({ message: 'Student record has been deleted successfully.' })
  } catch (error) {
    console.error('Delete student error:', error)
    return internalError('deleting the student record')
  }
}
