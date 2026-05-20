import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'
import { hashPassword } from '@/lib/auth'
import { assignStudentFeesFromStructure, createFeeDebitLedgerEntry } from '@/lib/fees'
import { generateSchoolNumber } from '@/lib/admission-numbering'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

async function resolveAcademicYear(schoolId: string, value: string | null, requireActive = false) {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const academicYear = (value || school?.academicYear || '').trim()

  if (!ACADEMIC_YEAR_PATTERN.test(academicYear)) return null

  if (requireActive) {
    const exists = await db.academicYear.findFirst({
      where: { schoolId, name: academicYear, isActive: true, deletedAt: null },
      select: { id: true },
    })
    if (!exists) return null
  }

  return academicYear
}

async function resolveTransportFare(
  schoolId: string,
  routeId: string | null | undefined,
  stopName: string | null | undefined,
  academicYear: string
) {
  if (!routeId || !stopName) return null

  const stopFare = await db.transportStopFare.findFirst({
    where: {
      schoolId,
      routeId,
      academicYear,
      stopName,
      isActive: true,
    },
    select: {
      fare: true,
      feeMonths: true,
    },
  })

  if (stopFare) return stopFare

  const route = await db.transportRoute.findFirst({
    where: {
      id: routeId,
      schoolId,
      academicYear,
      deletedAt: null,
      isActive: true,
    },
    select: {
      stops: true,
      feeMonths: true,
    },
  })

  if (!route?.stops) return null

  try {
    const stops = JSON.parse(route.stops)
    if (!Array.isArray(stops)) return null
    const legacyStop = stops.find((stop) => {
      if (typeof stop === 'string') return stop === stopName
      return stop && typeof stop === 'object' && stop.name === stopName
    })
    if (!legacyStop) return null
    return {
      fare: typeof legacyStop === 'object' && typeof legacyStop.fare === 'number' ? legacyStop.fare : 0,
      feeMonths: route.feeMonths,
    }
  } catch {
    return null
  }
}

function parseFeeMonths(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((month): month is string => typeof month === 'string' && !!month.trim()) : []
  } catch {
    return value.split(',').map((month) => month.trim()).filter(Boolean)
  }
}

// GET /api/school/admissions - List all admissions for the school
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    // Check admission:read permission for non-SUPER_ADMIN
    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:read')
      if (!authorized) {
        return forbiddenError("You don't have access to the Admissions section. Please contact your school administrator if you need access.")
      }
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || ''
    const classId = searchParams.get('classId') || ''
    const search = searchParams.get('search') || ''
    const admissionType = searchParams.get('admissionType') || ''
    const academicYear = await resolveAcademicYear(user.schoolId, searchParams.get('academicYear'))
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }
    if (academicYear) {
      where.academicYear = academicYear
    }

    if (status) {
      where.status = status
    }

    if (classId) {
      where.classId = classId
    }

    if (admissionType) {
      where.admissionType = admissionType
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { admissionNumber: { contains: search } },
        { aadhaarNumber: { contains: search } },
        { fatherName: { contains: search } },
        { motherName: { contains: search } },
        { formNumber: { contains: search } },
      ]
    }

    const [admissions, total] = await Promise.all([
      db.admission.findMany({
        where,
        include: {
          student: {
            select: { id: true, admissionNumber: true, firstName: true, lastName: true, isActive: true },
          },
          _count: {
            select: { documents: true, notes: true, activities: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.admission.count({ where }),
    ])

    // Fetch class and section names separately since they aren't relations on Admission
    const classIds = [...new Set(admissions.map(a => a.classId).filter(Boolean))] as string[]
    const sectionIds = [...new Set(admissions.map(a => a.sectionId).filter(Boolean))] as string[]

    const [classList, sectionList] = await Promise.all([
      classIds.length > 0 ? db.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }) : [],
      sectionIds.length > 0 ? db.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true } }) : [],
    ])

    const classMap = new Map<string, string | null>(classList.map(c => [c.id, c.name] as const))
    const sectionMap = new Map<string, string | null>(sectionList.map(s => [s.id, s.name] as const))

    const formattedAdmissions = admissions.map((a) => ({
      id: a.id,
      admissionNumber: a.admissionNumber,
      academicYear: a.academicYear,
      admissionType: a.admissionType,
      status: a.status,
      firstName: a.firstName,
      lastName: a.lastName,
      fullName: `${a.firstName} ${a.lastName}`,
      dateOfBirth: a.dateOfBirth,
      dateOfAdmission: a.dateOfAdmission,
      gender: a.gender,
      category: a.category,
      caste: a.caste,
      nationality: a.nationality,
      religion: a.religion,
      motherTongue: a.motherTongue,
      aadhaarNumber: a.aadhaarNumber,
      bloodGroup: a.bloodGroup,
      medicalConditions: a.medicalConditions,
      profileImage: a.profileImage,
      registrationNumber: a.registrationNumber,
      penNumber: a.penNumber,
      samagraId: a.samagraId,
      apaarId: a.apaarId,
      udiseId: a.udiseId,
      heightCm: a.heightCm,
      weightKg: a.weightKg,
      address: a.address,
      city: a.city,
      state: a.state,
      pincode: a.pincode,
      country: a.country,
      village: a.village,
      postOffice: a.postOffice,
      policeStation: a.policeStation,
      wardNo: a.wardNo,
      localAddress: a.localAddress,
      localCity: a.localCity,
      localState: a.localState,
      localPincode: a.localPincode,
      localCountry: a.localCountry,
      sameAsPermanent: a.sameAsPermanent,
      classId: a.classId,
      className: a.classId ? classMap.get(a.classId) || null : null,
      sectionId: a.sectionId,
      sectionName: a.sectionId ? sectionMap.get(a.sectionId) || null : null,
      studentId: a.studentId,
      studentIsActive: a.student?.isActive ?? true,
      student: a.student,
      appliedDate: a.appliedDate,
      fatherName: a.fatherName,
      fatherPhone: a.fatherPhone,
      fatherEmail: a.fatherEmail,
      fatherOccupation: a.fatherOccupation,
      fatherAadhaar: a.fatherAadhaar,
      fatherEducation: a.fatherEducation,
      fatherIncome: a.fatherIncome,
      motherName: a.motherName,
      motherPhone: a.motherPhone,
      motherEmail: a.motherEmail,
      motherOccupation: a.motherOccupation,
      motherAadhaar: a.motherAadhaar,
      motherEducation: a.motherEducation,
      motherIncome: a.motherIncome,
      belongsToEws: a.belongsToEws,
      isSingleGirlChild: a.isSingleGirlChild,
      isDivyangian: a.isDivyangian,
      admissionSession: a.admissionSession,
      mediumOfInstruction: a.mediumOfInstruction,
      area: a.area,
      previousSchool: a.previousSchool,
      previousSchoolAddress: a.previousSchoolAddress,
      previousClass: a.previousClass,
      previousResult: a.previousResult,
      affiliatedTo: a.affiliatedTo,
      previousSchoolTC: a.previousSchoolTC,
      tcDate: a.tcDate,
      transportRouteId: a.transportRouteId,
      transportStop: a.transportStop,
      hostelName: a.hostelName,
      hostelRoomNo: a.hostelRoomNo,
      hostelBedNo: a.hostelBedNo,
      bankAccountNumber: a.bankAccountNumber,
      ifscCode: a.ifscCode,

      feesGroupId: a.feesGroupId,
      concessionType: a.concessionType,
      sourceOfInfo: a.sourceOfInfo,
      formNumber: a.formNumber,
      siblingId: a.siblingId,
      documentsCount: a._count?.documents || 0,
      notesCount: a._count?.notes || 0,
      activitiesCount: a._count?.activities || 0,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }))

    // Fetch sibling details for admissions that have a siblingId
    const siblingIds = [...new Set(admissions.map(a => a.siblingId).filter(Boolean))] as string[]
    const siblingMap = new Map<string, { id: string; firstName: string; lastName: string; admissionNumber: string | null; className: string | null }>()
    if (siblingIds.length > 0) {
      const siblings = await db.student.findMany({
        where: { id: { in: siblingIds } },
        select: { id: true, firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true } } },
      })
      for (const s of siblings) {
        siblingMap.set(s.id, { id: s.id, firstName: s.firstName, lastName: s.lastName, admissionNumber: s.admissionNumber, className: s.class?.name || null })
      }
    }

    // Attach sibling details to formatted admissions
    const admissionsWithSiblings = formattedAdmissions.map(a => ({
      ...a,
      sibling: a.siblingId ? siblingMap.get(a.siblingId) || null : null,
    }))

    return NextResponse.json({
      admissions: admissionsWithSiblings,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('List admissions error:', error)
    return internalError('listing admissions')
  }
}

// POST /api/school/admissions - Create new admission
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    // Check admission:create permission for non-SUPER_ADMIN
    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:create')
      if (!authorized) {
        return forbiddenError("You don't have permission to create new admissions. Please contact your school administrator if you need this access.")
      }
    }

    const body = await request.json()
    const requestedAcademicYear = await resolveAcademicYear(user.schoolId, body.academicYear || null, true)

    if (!requestedAcademicYear) {
      return apiError(400, 'Please choose an active academic year.')
    }

    // Validate required fields with comprehensive rules
    const fieldErrors: Record<string, string> = {}

    // Required: firstName
    if (!body.firstName || typeof body.firstName !== 'string' || !body.firstName.trim()) {
      fieldErrors.firstName = 'First name is required'
    } else if (body.firstName.trim().length < 2) {
      fieldErrors.firstName = 'Must be at least 2 characters'
    } else if (!/^[a-zA-Z\s]+$/.test(body.firstName.trim())) {
      fieldErrors.firstName = 'Only letters and spaces allowed'
    }

    // Required: lastName
    if (!body.lastName || typeof body.lastName !== 'string' || !body.lastName.trim()) {
      fieldErrors.lastName = 'Last name is required'
    } else if (body.lastName.trim().length < 2) {
      fieldErrors.lastName = 'Must be at least 2 characters'
    } else if (!/^[a-zA-Z\s]+$/.test(body.lastName.trim())) {
      fieldErrors.lastName = 'Only letters and spaces allowed'
    }

    // Required: dateOfBirth
    if (!body.dateOfBirth) {
      fieldErrors.dateOfBirth = 'Date of birth is required'
    } else {
      const dob = new Date(body.dateOfBirth)
      if (isNaN(dob.getTime())) {
        fieldErrors.dateOfBirth = 'Invalid date'
      } else if (dob > new Date()) {
        fieldErrors.dateOfBirth = 'Date cannot be in the future'
      }
    }

    // Required: gender
    if (!body.gender) {
      fieldErrors.gender = 'Gender is required'
    }

    // Optional: aadhaarNumber — must be 12 digits if provided
    if (body.aadhaarNumber) {
      const digits = String(body.aadhaarNumber).replace(/\D/g, '')
      if (digits.length !== 12) {
        fieldErrors.aadhaarNumber = 'Aadhaar must be exactly 12 digits'
      }
    }

    // Optional: udiseId — must be 11 digits if provided
    if (body.udiseId) {
      if (!/^\d+$/.test(String(body.udiseId))) {
        fieldErrors.udiseId = 'Udise ID must be numeric'
      } else if (String(body.udiseId).length !== 11) {
        fieldErrors.udiseId = 'Udise ID must be exactly 11 digits'
      }
    }

    // Optional: samagraId — must be numeric, min 8 digits
    if (body.samagraId) {
      if (!/^\d+$/.test(String(body.samagraId))) {
        fieldErrors.samagraId = 'Samagra ID must be numeric'
      } else if (String(body.samagraId).length < 8) {
        fieldErrors.samagraId = 'Must be at least 8 digits'
      }
    }

    // Required: fatherName
    if (!body.fatherName || typeof body.fatherName !== 'string' || !body.fatherName.trim()) {
      fieldErrors.fatherName = "Father's name is required"
    } else if (body.fatherName.trim().length < 2) {
      fieldErrors.fatherName = 'Must be at least 2 characters'
    } else if (!/^[a-zA-Z\s]+$/.test(body.fatherName.trim())) {
      fieldErrors.fatherName = 'Only letters and spaces allowed'
    }

    // Required: fatherPhone
    if (!body.fatherPhone || typeof body.fatherPhone !== 'string' || !body.fatherPhone.trim()) {
      fieldErrors.fatherPhone = "Father's phone is required"
    } else if (!/^[6-9]\d{9}$/.test(body.fatherPhone.trim())) {
      fieldErrors.fatherPhone = 'Must be a valid 10-digit Indian phone number'
    }

    // Optional: fatherEmail
    if (body.fatherEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.fatherEmail))) {
      fieldErrors.fatherEmail = 'Invalid email format'
    }

    // Optional: motherEmail
    if (body.motherEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.motherEmail))) {
      fieldErrors.motherEmail = 'Invalid email format'
    }

    // Optional: motherPhone
    if (body.motherPhone && !/^[6-9]\d{9}$/.test(String(body.motherPhone).trim())) {
      fieldErrors.motherPhone = 'Must be a valid 10-digit Indian phone number'
    }

    // Optional: fatherAadhaar
    if (body.fatherAadhaar) {
      const fDigits = String(body.fatherAadhaar).replace(/\D/g, '')
      if (fDigits.length !== 12) {
        fieldErrors.fatherAadhaar = 'Aadhaar must be exactly 12 digits'
      }
    }

    // Optional: motherAadhaar
    if (body.motherAadhaar) {
      const mDigits = String(body.motherAadhaar).replace(/\D/g, '')
      if (mDigits.length !== 12) {
        fieldErrors.motherAadhaar = 'Aadhaar must be exactly 12 digits'
      }
    }

    // Optional: pincode
    if (body.pincode && !/^\d{6}$/.test(String(body.pincode))) {
      fieldErrors.pincode = 'Pincode must be exactly 6 digits'
    }

    // Optional: bankAccountNumber
    if (body.bankAccountNumber && !/^\d{8,18}$/.test(String(body.bankAccountNumber))) {
      fieldErrors.bankAccountNumber = 'Must be 8-18 digits'
    }

    // Optional: ifscCode
    if (body.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(body.ifscCode))) {
      fieldErrors.ifscCode = 'Invalid IFSC format (e.g., SBIN0001234)'
    }

    // Return validation errors if any
    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json({ message: 'Some information is missing or incorrect. Please fix the highlighted fields and try again.', fieldErrors }, { status: 400 })
    }

    // Validate required fields (legacy check for backward compatibility)
    if (!body.firstName || !body.lastName) {
      return apiError(400, "Please enter the student's first name and last name.")
    }

    // Validate class if provided
    if (body.classId) {
      const classRecord = await db.class.findFirst({
        where: { id: body.classId, schoolId: user.schoolId, deletedAt: null },
      })
      if (!classRecord) {
        return apiError(400, "The class you selected doesn't exist anymore. It may have been removed. Please refresh and try again.")
      }
    }

    // Validate section if provided
    if (body.sectionId) {
      const sectionRecord = await db.section.findFirst({
        where: {
          id: body.sectionId,
          schoolId: user.schoolId,
          classId: body.classId || undefined,
          deletedAt: null,
        },
      })
      if (!sectionRecord) {
        return apiError(400, "The section you selected doesn't exist anymore. It may have been removed. Please refresh and try again.")
      }
    }

    const requestedTransportFare = await resolveTransportFare(
      user.schoolId,
      body.transportRouteId || null,
      body.transportStop || null,
      requestedAcademicYear
    )

    if (body.transportRouteId || body.transportStop) {
      if (!body.transportRouteId || !body.transportStop) {
        return apiError(400, 'Please select both transport route and stop, or leave transport blank.')
      }

      if (!requestedTransportFare) {
        return apiError(400, 'The selected stop does not have a fare for this academic year. Please update transport stop fare details first.')
      }
    }

    // Check admission window if settings exist
    const settings = await db.admissionSetting.findUnique({
      where: { schoolId: user.schoolId },
    })

    if (settings?.admissionOpenDate && settings?.admissionCloseDate) {
      const now = new Date()
      if (now < new Date(settings.admissionOpenDate) || now > new Date(settings.admissionCloseDate)) {
        return apiError(400, 'Admissions are currently closed. Please check the admission schedule or contact the school office.')
      }
    }

    // Check max applications per class if configured
    if (body.classId && settings?.maxApplicationsPerClass) {
      const currentCount = await db.admission.count({
        where: {
          schoolId: user.schoolId,
          classId: body.classId,
          academicYear: requestedAcademicYear,
          deletedAt: null,
        },
      })

      if (currentCount >= settings.maxApplicationsPerClass) {
        return apiError(400, `This class has reached the maximum number of applications (${settings.maxApplicationsPerClass}). Please contact the school office for assistance.`)
      }
    }

    // Generate school-controlled numbers in serial order.
    const [admissionNumber, registrationNumber] = await Promise.all([
      generateSchoolNumber(user.schoolId, 'admission', body.classId),
      typeof body.registrationNumber === 'string' && body.registrationNumber.trim()
        ? Promise.resolve(String(body.registrationNumber).trim())
        : generateSchoolNumber(user.schoolId, 'registration', body.classId),
    ])

    // Use transaction for atomicity — all records created or none
    const admission = await db.$transaction(async (tx) => {
      // 1. Create Admission record
      const adm = await tx.admission.create({
        data: {
          schoolId: user.schoolId!,
          admissionNumber,
          academicYear: requestedAcademicYear,
          admissionType: 'new',
          status: 'admitted',
          // Personal info
          firstName: body.firstName,
          lastName: body.lastName,
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
          dateOfAdmission: new Date(),
          gender: body.gender || null,
          nationality: body.nationality || 'Indian',
          religion: body.religion || null,
          category: body.category || null,
          caste: body.caste || null,
          motherTongue: body.motherTongue || null,
          aadhaarNumber: body.aadhaarNumber || null,
          bloodGroup: body.bloodGroup || null,
          medicalConditions: body.medicalConditions || null,
          profileImage: body.profileImage || null,
          registrationNumber: registrationNumber || null,
          penNumber: body.penNumber || null,
          samagraId: body.samagraId || null,
          apaarId: body.apaarId || null,
          udiseId: body.udiseId || null,
          heightCm: body.heightCm || null,
          weightKg: body.weightKg || null,
          // Contact / Address
          address: body.address || null,
          city: body.city || null,
          state: body.state || null,
          pincode: body.pincode || null,
          country: body.country || null,
          village: body.village || null,
          postOffice: body.postOffice || null,
          policeStation: body.policeStation || null,
          wardNo: body.wardNo || null,
          localAddress: body.localAddress || null,
          localCity: body.localCity || null,
          localState: body.localState || null,
          localPincode: body.localPincode || null,
          localCountry: body.localCountry || null,
          sameAsPermanent: body.sameAsPermanent !== undefined ? body.sameAsPermanent : true,
          // Mother's info
          motherName: body.motherName || null,
          motherPhone: body.motherPhone || null,
          motherEmail: body.motherEmail || null,
          motherOccupation: body.motherOccupation || null,
          motherAadhaar: body.motherAadhaar || null,
          motherEducation: body.motherEducation || null,
          motherIncome: body.motherIncome || null,
          // Father's info
          fatherName: body.fatherName || null,
          fatherPhone: body.fatherPhone || null,
          fatherEmail: body.fatherEmail || null,
          fatherOccupation: body.fatherOccupation || null,
          fatherAadhaar: body.fatherAadhaar || null,
          fatherEducation: body.fatherEducation || null,
          fatherIncome: body.fatherIncome || null,
          // Other details
          belongsToEws: body.belongsToEws || false,
          isSingleGirlChild: body.isSingleGirlChild || false,
          isDivyangian: body.isDivyangian || false,
          // General Details
          classId: body.classId || null,
          sectionId: body.sectionId || null,
          admissionSession: requestedAcademicYear,
          mediumOfInstruction: body.mediumOfInstruction || null,
          area: body.area || null,
          // Last Institution
          previousSchool: body.previousSchool || null,
          previousSchoolAddress: body.previousSchoolAddress || null,
          previousClass: body.previousClass || null,
          previousResult: body.previousResult || null,
          affiliatedTo: body.affiliatedTo || null,
          previousSchoolTC: body.previousSchoolTC || null,
          tcDate: body.tcDate ? new Date(body.tcDate) : null,
          // Transport
          transportRouteId: body.transportRouteId || null,
          transportStop: body.transportStop || null,
          // Hostel
          hostelName: body.hostelName || null,
          hostelRoomNo: body.hostelRoomNo || null,
          hostelBedNo: body.hostelBedNo || null,
          // Accounts Info
          bankAccountNumber: body.bankAccountNumber || null,
          ifscCode: body.ifscCode || null,
          feesGroupId: body.feesGroupId || null,
          annualIncome: body.annualIncome || null,
          siblingId: body.siblingId || null,
          // Parent address (compatibility)
          sameAddressAsStudent: body.sameAddressAsStudent !== undefined ? body.sameAddressAsStudent : true,
          fatherAddress: body.fatherAddress || null,
          motherAddress: body.motherAddress || null,
          // Concession & Source
          concessionType: body.concessionType || null,
          concessionReason: body.concessionReason || null,
          sourceOfInfo: body.sourceOfInfo || null,
          formNumber: body.formNumber || null,
          // Workflow
          appliedDate: new Date(),
          admittedBy: user.userId,
          admittedAt: new Date(),
          remarks: body.remarks || null,
          createdBy: user.userId,
        },
      })

      // 2. Create Student record directly (direct admission)
      const student = await tx.student.create({
        data: {
          schoolId: user.schoolId!,
          admissionNumber: adm.admissionNumber,
          firstName: adm.firstName,
          lastName: adm.lastName,
          dateOfBirth: adm.dateOfBirth,
          gender: adm.gender,
          nationality: adm.nationality,
          religion: adm.religion,
          category: adm.category,
          motherTongue: adm.motherTongue,
          aadhaarNumber: adm.aadhaarNumber,
          bloodGroup: adm.bloodGroup,
          medicalConditions: adm.medicalConditions,
          address: adm.address,
          city: adm.city,
          state: adm.state,
          pincode: adm.pincode,
          country: 'India',
          profileImage: adm.profileImage,
          admissionDate: new Date(),
          previousSchool: adm.previousSchool,
          previousSchoolTC: adm.previousSchoolTC,
          previousClass: adm.previousClass,
          previousResult: adm.previousResult,
          transferCertNo: adm.previousSchoolTC,
          siblingId: adm.siblingId,
          admissionStatus: 'admitted',
          classId: adm.classId,
          sectionId: adm.sectionId,
        },
      })

      // 3. Link student to admission
      await tx.admission.update({
        where: { id: adm.id },
        data: { studentId: student.id },
      })

      await tx.studentAcademicEnrollment.create({
        data: {
          schoolId: user.schoolId!,
          studentId: student.id,
          academicYear: requestedAcademicYear,
          classId: adm.classId!,
          sectionId: adm.sectionId,
          rollNumber: student.rollNumber,
          status: 'active',
          source: 'admission',
          effectiveFrom: adm.dateOfAdmission || new Date(),
          createdBy: user.userId,
        },
      })

      if (body.feesGroupId) {
        await assignStudentFeesFromStructure({
          tx,
          schoolId: user.schoolId!,
          studentId: student.id,
          classId: adm.classId,
          sectionId: adm.sectionId,
          feesGroupId: body.feesGroupId,
          academicYear: requestedAcademicYear,
          assignedBy: user.userId,
          source: 'admission',
          effectiveFrom: adm.dateOfAdmission || new Date(),
        })
      }

      if (body.transportRouteId && body.transportStop) {
        const feeMonths = parseFeeMonths(requestedTransportFare?.feeMonths)
        await tx.transportAllocation.create({
          data: {
            schoolId: user.schoolId!,
            studentId: student.id,
            routeId: body.transportRouteId,
            academicYear: requestedAcademicYear,
            pickupPoint: body.transportStop,
            dropPoint: null,
            stopName: body.transportStop,
            fareAmount: requestedTransportFare?.fare || 0,
            feeMonths: JSON.stringify(feeMonths),
            isActive: true,
          },
        })

        if (requestedTransportFare && requestedTransportFare.fare > 0 && feeMonths.length > 0) {
          for (const month of feeMonths) {
            const transportCollection = await tx.feeCollection.create({
              data: {
                schoolId: user.schoolId!,
                studentId: student.id,
                amount: requestedTransportFare.fare,
                paidAmount: 0,
                discount: 0,
                concession: 0,
                scholarship: 0,
                fine: 0,
                paymentStatus: 'unpaid',
                installmentName: month,
                feeHeadName: 'Transport Fee',
                notes: `Transport fee for ${body.transportStop} (${requestedAcademicYear})`,
              },
            })
            await createFeeDebitLedgerEntry({
              tx,
              schoolId: user.schoolId!,
              studentId: student.id,
              academicYear: requestedAcademicYear,
              feeCollectionId: transportCollection.id,
              sourceType: 'transport',
              sourceId: transportCollection.id,
              feeHeadName: 'Transport Fee',
              installmentName: month,
              description: `Transport Fee - ${month}`,
              amount: requestedTransportFare.fare,
              notes: `Transport fee for ${body.transportStop} (${requestedAcademicYear})`,
              createdBy: user.userId,
            })
          }
        }
      }

      // 4. Create Parent record(s) and StudentParent links
      // Since StudentParent has a unique constraint on [studentId, parentId],
      // we need separate Parent records for father and mother if both exist.
      
      // Create Father's parent record if father info exists
      if (adm.fatherName) {
        const fatherParent = await tx.parent.create({
          data: {
            schoolId: user.schoolId!,
            fatherName: adm.fatherName,
            motherName: null,
            phone: adm.fatherPhone || null,
            alternatePhone: adm.motherPhone || null,
            email: adm.fatherEmail || adm.motherEmail || null,
            occupation: adm.fatherOccupation || null,
            address: adm.address,
            annualIncome: adm.fatherIncome || adm.annualIncome,
          },
        })
        await tx.studentParent.create({
          data: {
            studentId: student.id,
            parentId: fatherParent.id,
            relation: 'Father',
            isPrimary: true,
          },
        })
      }

      // Create Mother's parent record if mother info exists (separate from father)
      if (adm.motherName) {
        const motherParent = await tx.parent.create({
          data: {
            schoolId: user.schoolId!,
            fatherName: null,
            motherName: adm.motherName,
            phone: adm.motherPhone || adm.fatherPhone || null,
            alternatePhone: null,
            email: adm.motherEmail || adm.fatherEmail || null,
            occupation: adm.motherOccupation || null,
            address: adm.address,
            annualIncome: adm.motherIncome || adm.annualIncome,
          },
        })
        await tx.studentParent.create({
          data: {
            studentId: student.id,
            parentId: motherParent.id,
            relation: 'Mother',
            isPrimary: !adm.fatherName,
          },
        })
      }

      // If neither father nor mother exists, create a basic parent record
      if (!adm.fatherName && !adm.motherName) {
        const basicParent = await tx.parent.create({
          data: {
            schoolId: user.schoolId!,
            phone: null,
            address: adm.address,
          },
        })
        await tx.studentParent.create({
          data: {
            studentId: student.id,
            parentId: basicParent.id,
            relation: 'Parent',
            isPrimary: true,
          },
        })
      }

      // 5. Create parent User account for login access
      // Use father's phone as primary, fallback to mother's phone
      const parentPhone = adm.fatherPhone || adm.motherPhone
      const parentName = adm.fatherName || adm.motherName || `Parent of ${adm.firstName}`

      if (parentPhone) {
        const cleanPhone = parentPhone.trim().replace(/\D/g, '').slice(-10)
        const parentEmail = `${cleanPhone}@parent.local`

        // Check if a user with this phone already exists
        const existingUser = await tx.user.findFirst({
          where: { phone: cleanPhone, schoolId: user.schoolId!, deletedAt: null },
        })

        if (existingUser) {
          if (existingUser.role !== 'PARENT') {
            throw new Error('PARENT_ACCOUNT_CONFLICT')
          }

          // Link existing user to the father's parent record
          const fatherLink = await tx.studentParent.findFirst({
            where: { studentId: student.id, relation: 'Father' },
            include: { parent: true },
          })
          if (fatherLink && !fatherLink.parent.userId) {
            await tx.parent.update({
              where: { id: fatherLink.parent.id },
              data: { userId: existingUser.id },
            })
          }

          // Auto-assign "Parent" role if not already assigned
          const existingRole = await tx.userRole.findFirst({
            where: { userId: existingUser.id, role: { name: 'Parent', schoolId: user.schoolId! } },
          })
          if (!existingRole) {
            const parentRole = await tx.role.findFirst({
              where: { name: 'Parent', schoolId: user.schoolId!, deletedAt: null, isActive: true },
            })
            if (parentRole) {
              await tx.userRole.create({
                data: {
                  userId: existingUser.id,
                  roleId: parentRole.id,
                  assignedBy: user.userId!,
                },
              })
            }
          }
        } else {
          // Create new parent User account
          const hashedPwd = await hashPassword('parent123')
          const parentUser = await tx.user.create({
            data: {
              email: parentEmail,
              password: hashedPwd,
              name: parentName,
              phone: cleanPhone,
              role: 'PARENT',
              schoolId: user.schoolId!,
              isActive: true,
            },
          })

          // Auto-assign "Parent" role to the new user
          const parentRole = await tx.role.findFirst({
            where: { name: 'Parent', schoolId: user.schoolId!, deletedAt: null, isActive: true },
          })
          if (parentRole) {
            await tx.userRole.create({
              data: {
                userId: parentUser.id,
                roleId: parentRole.id,
                assignedBy: user.userId!,
              },
            })
          }

          // Link the user to the father's parent record
          const fatherLink = await tx.studentParent.findFirst({
            where: { studentId: student.id, relation: 'Father' },
          })
          if (fatherLink) {
            await tx.parent.update({
              where: { id: fatherLink.parentId },
              data: { userId: parentUser.id },
            })
          } else {
            // Link to whatever parent record exists
            const anyLink = await tx.studentParent.findFirst({
              where: { studentId: student.id },
            })
            if (anyLink) {
              await tx.parent.update({
                where: { id: anyLink.parentId },
                data: { userId: parentUser.id },
              })
            }
          }
        }
      }

      // 6. Create activity records
      await tx.admissionActivity.createMany({
        data: [
          {
            admissionId: adm.id,
            action: 'created',
            toValue: 'admitted',
            performedBy: user.userId!,
            description: `Admission created with number ${admissionNumber}. Student directly admitted.`,
          },
          {
            admissionId: adm.id,
            action: 'admitted',
            toValue: 'admitted',
            performedBy: user.userId!,
            description: `Student admitted directly. Student ID: ${student.id}`,
          },
        ],
      })

      return adm
    })

    return NextResponse.json(admission, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'PARENT_ACCOUNT_CONFLICT') {
      return apiError(
        400,
        'This parent phone number already belongs to a non-parent user. Please use a separate parent account, or change the existing user profile type first.'
      )
    }
    console.error('Create admission error:', error)
    return internalError('creating the admission')
  }
}
