import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/students/[id] - Get full student details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'PARENT'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params

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

    // If PARENT role and student is disabled, block access
    if (user.role === 'PARENT' && !student.isActive) {
      return apiError(403, 'This student\'s account has been disabled by the school. Please contact the school administration for more information.')
    }

    // Fetch siblings via shared familyId. We fall back to the legacy
    // siblingId pointer only when familyId is missing (pre-backfill data),
    // so existing single-pointer links don't silently disappear.
    type SiblingInfo = { id: string; firstName: string; lastName: string; admissionNumber: string | null; className: string | null }
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

    return NextResponse.json({
      ...student,
      siblings,
      sibling: siblings[0] || null, // legacy field for any frontend not yet updated
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
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params
    const body = await request.json()

    // Verify student belongs to this school
    const student = await db.student.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!student) {
      return apiError(404, 'We couldn\'t find this student\'s record. It may have been removed or the link may be incorrect.')
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
    if (firstName !== undefined) studentFields.firstName = firstName
    if (lastName !== undefined) studentFields.lastName = lastName
    if (classId !== undefined) studentFields.classId = classId || null
    if (sectionId !== undefined) studentFields.sectionId = sectionId || null
    if (rollNumber !== undefined) studentFields.rollNumber = rollNumber || null
    if (dateOfBirth !== undefined) studentFields.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null
    if (gender !== undefined) studentFields.gender = gender || null
    if (address !== undefined) studentFields.address = address || null
    if (city !== undefined) studentFields.city = city || null
    if (state !== undefined) studentFields.state = state || null
    if (pincode !== undefined) studentFields.pincode = pincode || null
    if (aadhaarNumber !== undefined) studentFields.aadhaarNumber = aadhaarNumber || null
    if (bloodGroup !== undefined) studentFields.bloodGroup = bloodGroup || null
    if (admissionDate !== undefined) studentFields.admissionDate = admissionDate ? new Date(admissionDate) : null
    if (previousSchool !== undefined) studentFields.previousSchool = previousSchool || null
    if (profileImage !== undefined) studentFields.profileImage = profileImage || null
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
      if (admissionData.firstName !== undefined) adm.firstName = admissionData.firstName
      if (admissionData.lastName !== undefined) adm.lastName = admissionData.lastName
      if (admissionData.dateOfBirth !== undefined) adm.dateOfBirth = admissionData.dateOfBirth ? new Date(admissionData.dateOfBirth) : null
      if (admissionData.gender !== undefined) adm.gender = admissionData.gender || null
      if (admissionData.nationality !== undefined) adm.nationality = admissionData.nationality || null
      if (admissionData.religion !== undefined) adm.religion = admissionData.religion || null
      if (admissionData.category !== undefined) adm.category = admissionData.category || null
      if (admissionData.caste !== undefined) adm.caste = admissionData.caste || null
      if (admissionData.motherTongue !== undefined) adm.motherTongue = admissionData.motherTongue || null
      if (admissionData.aadhaarNumber !== undefined) adm.aadhaarNumber = admissionData.aadhaarNumber || null
      if (admissionData.bloodGroup !== undefined) adm.bloodGroup = admissionData.bloodGroup || null
      if (admissionData.medicalConditions !== undefined) adm.medicalConditions = admissionData.medicalConditions || null
      if (admissionData.profileImage !== undefined) adm.profileImage = admissionData.profileImage || null
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
      if (admissionData.pincode !== undefined) adm.pincode = admissionData.pincode || null
      if (admissionData.country !== undefined) adm.country = admissionData.country || null
      if (admissionData.village !== undefined) adm.village = admissionData.village || null
      if (admissionData.postOffice !== undefined) adm.postOffice = admissionData.postOffice || null
      if (admissionData.policeStation !== undefined) adm.policeStation = admissionData.policeStation || null
      if (admissionData.wardNo !== undefined) adm.wardNo = admissionData.wardNo || null
      if (admissionData.localAddress !== undefined) adm.localAddress = admissionData.localAddress || null
      if (admissionData.localCity !== undefined) adm.localCity = admissionData.localCity || null
      if (admissionData.localState !== undefined) adm.localState = admissionData.localState || null
      if (admissionData.localPincode !== undefined) adm.localPincode = admissionData.localPincode || null
      if (admissionData.localCountry !== undefined) adm.localCountry = admissionData.localCountry || null
      if (admissionData.sameAsPermanent !== undefined) adm.sameAsPermanent = admissionData.sameAsPermanent
      // Father
      if (admissionData.fatherName !== undefined) adm.fatherName = admissionData.fatherName || null
      if (admissionData.fatherPhone !== undefined) adm.fatherPhone = admissionData.fatherPhone || null
      if (admissionData.fatherEmail !== undefined) adm.fatherEmail = admissionData.fatherEmail || null
      if (admissionData.fatherOccupation !== undefined) adm.fatherOccupation = admissionData.fatherOccupation || null
      if (admissionData.fatherAadhaar !== undefined) adm.fatherAadhaar = admissionData.fatherAadhaar || null
      if (admissionData.fatherEducation !== undefined) adm.fatherEducation = admissionData.fatherEducation || null
      if (admissionData.fatherIncome !== undefined) adm.fatherIncome = admissionData.fatherIncome ? parseFloat(admissionData.fatherIncome) : null
      // Mother
      if (admissionData.motherName !== undefined) adm.motherName = admissionData.motherName || null
      if (admissionData.motherPhone !== undefined) adm.motherPhone = admissionData.motherPhone || null
      if (admissionData.motherEmail !== undefined) adm.motherEmail = admissionData.motherEmail || null
      if (admissionData.motherOccupation !== undefined) adm.motherOccupation = admissionData.motherOccupation || null
      if (admissionData.motherAadhaar !== undefined) adm.motherAadhaar = admissionData.motherAadhaar || null
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
      // Transport & Hostel
      if (admissionData.transportRouteId !== undefined) adm.transportRouteId = admissionData.transportRouteId || null
      if (admissionData.transportStop !== undefined) adm.transportStop = admissionData.transportStop || null
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
      }

      // Handle documents if provided
      if (admissionData.documents && Array.isArray(admissionData.documents)) {
        const admissionRecord = await db.admission.findFirst({
          where: { studentId: id, schoolId: user.schoolId, deletedAt: null },
          select: { id: true },
        })

        if (admissionRecord) {
          for (const doc of admissionData.documents) {
            if (!doc.documentType || !doc.documentName) continue

            const existing = await db.admissionDocument.findFirst({
              where: { admissionId: admissionRecord.id, documentType: doc.documentType },
            })

            if (existing) {
              await db.admissionDocument.update({
                where: { id: existing.id },
                data: {
                  documentName: doc.documentName,
                  uploadedAt: existing.uploadedAt || new Date(),
                },
              })
            } else {
              await db.admissionDocument.create({
                data: {
                  admissionId: admissionRecord.id,
                  documentType: doc.documentType,
                  documentName: doc.documentName,
                  isRequired: true,
                  verificationStatus: 'pending',
                },
              })
            }
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
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
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
