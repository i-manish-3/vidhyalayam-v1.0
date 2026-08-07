import { db } from '../../src/lib/db'
import { hashPassword } from '../../src/lib/auth'

type FamilySeed = {
  father: {
    name: string
    phone: string
    email: string
    occupation: string
    aadhaar: string
    education: string
    income: number
  }
  mother: {
    name: string
    phone: string
    email: string
    occupation: string
    aadhaar: string
    education: string
    income: number
  }
  address: {
    address: string
    village: string
    postOffice: string
    policeStation: string
    wardNo: string
    city: string
    state: string
    pincode: string
  }
  children: Array<{
    admissionNumber: string
    firstName: string
    lastName: string
    gender: string
    dateOfBirth: Date
    classIndex: number
    sectionIndex: number
    bloodGroup: string
    category: string
    religion: string
    previousSchool?: string
    previousClass?: string
  }>
}

const families: FamilySeed[] = [
  {
    father: {
      name: 'Amit Verma',
      phone: '9891001101',
      email: 'amit.verma@example.com',
      occupation: 'Software Engineer',
      aadhaar: '123412341234',
      education: 'B.Tech',
      income: 1200000,
    },
    mother: {
      name: 'Neha Verma',
      phone: '9891001102',
      email: 'neha.verma@example.com',
      occupation: 'Teacher',
      aadhaar: '223422342234',
      education: 'M.A.',
      income: 650000,
    },
    address: {
      address: 'A-21, Green Park Extension',
      village: 'Green Park',
      postOffice: 'Green Park',
      policeStation: 'Hauz Khas',
      wardNo: '44',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110016',
    },
    children: [
      {
        admissionNumber: 'ADM-SEED-2026-001',
        firstName: 'Ira',
        lastName: 'Verma',
        gender: 'Female',
        dateOfBirth: new Date('2017-08-14'),
        classIndex: 1,
        sectionIndex: 0,
        bloodGroup: 'B+',
        category: 'General',
        religion: 'Hindu',
        previousSchool: 'Little Scholars Academy',
        previousClass: 'Class 1',
      },
      {
        admissionNumber: 'ADM-SEED-2026-002',
        firstName: 'Kabir',
        lastName: 'Verma',
        gender: 'Male',
        dateOfBirth: new Date('2015-03-22'),
        classIndex: 3,
        sectionIndex: 1,
        bloodGroup: 'O+',
        category: 'General',
        religion: 'Hindu',
        previousSchool: 'Little Scholars Academy',
        previousClass: 'Class 3',
      },
    ],
  },
  {
    father: {
      name: 'Farhan Khan',
      phone: '9891002201',
      email: 'farhan.khan@example.com',
      occupation: 'Architect',
      aadhaar: '323432343234',
      education: 'B.Arch',
      income: 980000,
    },
    mother: {
      name: 'Sana Khan',
      phone: '9891002202',
      email: 'sana.khan@example.com',
      occupation: 'Designer',
      aadhaar: '423442344234',
      education: 'B.Des',
      income: 720000,
    },
    address: {
      address: 'D-88, Jamia Nagar',
      village: 'Okhla',
      postOffice: 'Jamia Nagar',
      policeStation: 'Okhla',
      wardNo: '101',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110025',
    },
    children: [
      {
        admissionNumber: 'ADM-SEED-2026-003',
        firstName: 'Ayaan',
        lastName: 'Khan',
        gender: 'Male',
        dateOfBirth: new Date('2016-11-09'),
        classIndex: 2,
        sectionIndex: 0,
        bloodGroup: 'A+',
        category: 'General',
        religion: 'Muslim',
        previousSchool: 'Sunrise Public School',
        previousClass: 'Class 2',
      },
      {
        admissionNumber: 'ADM-SEED-2026-004',
        firstName: 'Zoya',
        lastName: 'Khan',
        gender: 'Female',
        dateOfBirth: new Date('2018-01-18'),
        classIndex: 1,
        sectionIndex: 1,
        bloodGroup: 'A-',
        category: 'General',
        religion: 'Muslim',
        previousSchool: 'Sunrise Public School',
        previousClass: 'Class 1',
      },
    ],
  },
  {
    father: {
      name: 'Raghav Iyer',
      phone: '9891003301',
      email: 'raghav.iyer@example.com',
      occupation: 'Bank Manager',
      aadhaar: '523452345234',
      education: 'MBA',
      income: 1100000,
    },
    mother: {
      name: 'Meera Iyer',
      phone: '9891003302',
      email: 'meera.iyer@example.com',
      occupation: 'Doctor',
      aadhaar: '623462346234',
      education: 'MBBS',
      income: 1400000,
    },
    address: {
      address: 'C-14, Lajpat Nagar II',
      village: 'Lajpat Nagar',
      postOffice: 'Lajpat Nagar',
      policeStation: 'Lajpat Nagar',
      wardNo: '57',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110024',
    },
    children: [
      {
        admissionNumber: 'ADM-SEED-2026-005',
        firstName: 'Anika',
        lastName: 'Iyer',
        gender: 'Female',
        dateOfBirth: new Date('2014-06-30'),
        classIndex: 5,
        sectionIndex: 0,
        bloodGroup: 'AB+',
        category: 'General',
        religion: 'Hindu',
        previousSchool: 'Modern Junior School',
        previousClass: 'Class 5',
      },
    ],
  },
]

async function ensureParentUser(family: FamilySeed, schoolId: string, assignedBy: string) {
  const cleanPhone = family.father.phone.replace(/\D/g, '').slice(-10)
  const email = `${cleanPhone}@parent.local`

  let user = await db.user.findFirst({
    where: { email, schoolId, deletedAt: null },
  })

  if (!user) {
    user = await db.user.create({
      data: {
        email,
        password: await hashPassword('parent123'),
        name: family.father.name,
        phone: cleanPhone,
        role: 'PARENT',
        schoolId,
        isActive: true,
      },
    })
  }

  const parentRole = await db.role.findFirst({
    where: { schoolId, name: 'Parent', isActive: true, deletedAt: null },
  })

  if (parentRole) {
    const existingRole = await db.userRole.findFirst({
      where: { userId: user.id, roleId: parentRole.id },
    })

    if (!existingRole) {
      await db.userRole.create({
        data: {
          userId: user.id,
          roleId: parentRole.id,
          assignedBy,
        },
      })
    }
  }

  return user
}

async function ensureFamilyParents(family: FamilySeed, schoolId: string, userId: string) {
  let fatherParent = await db.parent.findFirst({
    where: {
      schoolId,
      userId,
      fatherName: family.father.name,
      deletedAt: null,
    },
  })

  if (!fatherParent) {
    fatherParent = await db.parent.create({
      data: {
        schoolId,
        userId,
        fatherName: family.father.name,
        phone: family.father.phone,
        alternatePhone: family.mother.phone,
        email: family.father.email,
        occupation: family.father.occupation,
        address: family.address.address,
        annualIncome: family.father.income,
      },
    })
  }

  let motherParent = await db.parent.findFirst({
    where: {
      schoolId,
      motherName: family.mother.name,
      phone: family.mother.phone,
      deletedAt: null,
    },
  })

  if (!motherParent) {
    motherParent = await db.parent.create({
      data: {
        schoolId,
        motherName: family.mother.name,
        phone: family.mother.phone,
        alternatePhone: family.father.phone,
        email: family.mother.email,
        occupation: family.mother.occupation,
        address: family.address.address,
        annualIncome: family.mother.income,
      },
    })
  }

  return { fatherParent, motherParent }
}

async function ensureStudentParentLink(
  studentId: string,
  parentId: string,
  relation: string,
  isPrimary: boolean
) {
  const existing = await db.studentParent.findFirst({
    where: { studentId, parentId },
  })

  if (!existing) {
    await db.studentParent.create({
      data: { studentId, parentId, relation, isPrimary },
    })
  }
}

async function ensureAdmissionForChild(args: {
  family: FamilySeed
  child: FamilySeed['children'][number]
  schoolId: string
  createdBy: string
  classId: string | null
  sectionId: string | null
  siblingId: string | null
  feesGroupId: string | null
}) {
  const { family, child, schoolId, createdBy, classId, sectionId, siblingId, feesGroupId } = args

  const existingStudent = await db.student.findFirst({
    where: { admissionNumber: child.admissionNumber, schoolId },
  })

  if (existingStudent) {
    if (siblingId && !existingStudent.siblingId) {
      await db.student.update({
        where: { id: existingStudent.id },
        data: { siblingId },
      })
      await db.admission.updateMany({
        where: { studentId: existingStudent.id, schoolId },
        data: { siblingId },
      })
    }
    // Backfill enrollment for partial-seed scenarios
    if (classId) {
      const enrollment = await db.studentAcademicEnrollment.findFirst({
        where: { studentId: existingStudent.id, academicYear: '2026-2027' },
      })
      if (!enrollment) {
        const rollSuffix = child.admissionNumber.match(/(\d+)$/)?.[1] || '01'
        await db.studentAcademicEnrollment.create({
          data: {
            schoolId,
            studentId: existingStudent.id,
            academicYear: '2026-2027',
            classId,
            sectionId,
            rollNumber: rollSuffix,
            status: 'active',
            source: 'admission',
            effectiveFrom: new Date('2026-04-01'),
            createdBy,
          },
        })
      }
    }
    return existingStudent
  }

  const result = await db.$transaction(async (tx) => {
    const admission = await tx.admission.create({
      data: {
        schoolId,
        admissionNumber: child.admissionNumber,
        academicYear: '2026-2027',
        admissionType: 'new',
        status: 'admitted',
        firstName: child.firstName,
        lastName: child.lastName,
        dateOfBirth: child.dateOfBirth,
        dateOfAdmission: new Date('2026-04-01'),
        gender: child.gender,
        nationality: 'Indian',
        religion: child.religion,
        category: child.category,
        motherTongue: 'Hindi',
        bloodGroup: child.bloodGroup,
        aadhaarNumber: null,
        registrationNumber: child.admissionNumber,
        address: family.address.address,
        village: family.address.village,
        postOffice: family.address.postOffice,
        policeStation: family.address.policeStation,
        wardNo: family.address.wardNo,
        city: family.address.city,
        state: family.address.state,
        pincode: family.address.pincode,
        country: 'India',
        localAddress: family.address.address,
        localCity: family.address.city,
        localState: family.address.state,
        localPincode: family.address.pincode,
        localCountry: 'India',
        sameAsPermanent: true,
        fatherName: family.father.name,
        fatherPhone: family.father.phone,
        fatherEmail: family.father.email,
        fatherOccupation: family.father.occupation,
        fatherAadhaar: family.father.aadhaar,
        fatherEducation: family.father.education,
        fatherIncome: family.father.income,
        motherName: family.mother.name,
        motherPhone: family.mother.phone,
        motherEmail: family.mother.email,
        motherOccupation: family.mother.occupation,
        motherAadhaar: family.mother.aadhaar,
        motherEducation: family.mother.education,
        motherIncome: family.mother.income,
        classId,
        sectionId,
        admissionSession: '2026-2027',
        mediumOfInstruction: 'English',
        previousSchool: child.previousSchool || null,
        previousClass: child.previousClass || null,
        previousResult: child.previousSchool ? 'Promoted' : null,
        feesGroupId,
        siblingId,
        annualIncome: family.father.income + family.mother.income,
        sourceOfInfo: 'seed_data',
        formNumber: `${child.admissionNumber}-FORM`,
        appliedDate: new Date('2026-03-20'),
        admittedBy: createdBy,
        admittedAt: new Date('2026-04-01'),
        remarks: 'Seeded direct admission with parent and sibling data.',
        createdBy,
      },
    })

    const student = await tx.student.create({
      data: {
        schoolId,
        classId,
        sectionId,
        admissionNumber: child.admissionNumber,
        firstName: child.firstName,
        lastName: child.lastName,
        dateOfBirth: child.dateOfBirth,
        gender: child.gender,
        nationality: 'Indian',
        religion: child.religion,
        category: child.category,
        motherTongue: 'Hindi',
        bloodGroup: child.bloodGroup,
        address: family.address.address,
        city: family.address.city,
        state: family.address.state,
        pincode: family.address.pincode,
        country: 'India',
        admissionDate: new Date('2026-04-01'),
        previousSchool: child.previousSchool || null,
        previousClass: child.previousClass || null,
        previousResult: child.previousSchool ? 'Promoted' : null,
        siblingId,
        admissionStatus: 'admitted',
        isActive: true,
      },
    })

    await tx.admission.update({
      where: { id: admission.id },
      data: { studentId: student.id },
    })

    if (classId) {
      const rollSuffix = child.admissionNumber.match(/(\d+)$/)?.[1] || '01'
      await tx.studentAcademicEnrollment.create({
        data: {
          schoolId,
          studentId: student.id,
          academicYear: '2026-2027',
          classId,
          sectionId,
          rollNumber: rollSuffix,
          status: 'active',
          source: 'admission',
          effectiveFrom: new Date('2026-04-01'),
          createdBy: createdBy,
        },
      })
    }

    await tx.admissionNote.create({
      data: {
        admissionId: admission.id,
        note: `${child.firstName} admitted to ${child.previousClass ? 'continuing' : 'new'} academic session 2026-2027. Parent contact and sibling links verified.`,
        noteType: 'general',
        createdBy,
      },
    })

    await tx.admissionDocument.createMany({
      data: [
        {
          admissionId: admission.id,
          documentType: 'birth_certificate',
          documentName: 'Birth Certificate',
          fileUrl: `/seed-documents/${child.admissionNumber}/birth-certificate.pdf`,
          fileType: 'application/pdf',
          fileSize: 240,
          uploadedAt: new Date('2026-03-21'),
          verificationStatus: 'verified',
          isRequired: true,
        },
        {
          admissionId: admission.id,
          documentType: 'aadhaar',
          documentName: 'Aadhaar Card',
          fileUrl: `/seed-documents/${child.admissionNumber}/aadhaar.pdf`,
          fileType: 'application/pdf',
          fileSize: 180,
          uploadedAt: new Date('2026-03-21'),
          verificationStatus: 'pending',
          isRequired: true,
        },
      ],
    })

    await tx.admissionActivity.createMany({
      data: [
        {
          admissionId: admission.id,
          action: 'created',
          toValue: 'admitted',
          performedBy: createdBy,
          description: `Seed admission created with number ${child.admissionNumber}.`,
        },
        {
          admissionId: admission.id,
          action: 'document_uploaded',
          toValue: '2 documents',
          performedBy: createdBy,
          description: 'Seeded document metadata for admission.',
        },
        {
          admissionId: admission.id,
          action: 'admitted',
          toValue: 'admitted',
          performedBy: createdBy,
          description: `Student admitted directly. Student ID: ${student.id}`,
        },
      ],
    })

    return student
  })

  return result
}

async function main() {
  console.log('Seeding direct admissions with parents and siblings...')

  let school = await db.school.findFirst({
    where: { subdomain: 'dps-delhi', deletedAt: null },
  })

  if (!school) {
    school = await db.school.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    })
  }

  if (!school) {
    throw new Error('No active school was found. Run the core seed first.')
  }

  if (school.subdomain !== 'dps-delhi') {
    console.log(`Using fallback school "${school.name}" (${school.subdomain}) for admissions seed.`)
  }

  const createdByUser = await db.user.findFirst({
    where: { schoolId: school.id, role: 'SCHOOL_ADMIN', deletedAt: null },
  })

  if (!createdByUser) {
    throw new Error('School admin user was not found. Run the core seed first.')
  }

  const classes = await db.class.findMany({
    where: { schoolId: school.id, deletedAt: null },
    orderBy: { name: 'asc' },
  })

  const sections = await db.section.findMany({
    where: { schoolId: school.id, deletedAt: null },
    orderBy: { name: 'asc' },
  })

  const newAdmissionGroup = await db.feesGroup.findFirst({
    where: { schoolId: school.id, name: 'New Admission', deletedAt: null },
  })

  let createdOrFound = 0
  let siblingLinks = 0

  for (const family of families) {
    const parentUser = await ensureParentUser(family, school.id, createdByUser.id)
    const { fatherParent, motherParent } = await ensureFamilyParents(family, school.id, parentUser.id)

    let firstSiblingId: string | null = null
    const createdFamilyStudents: string[] = []

    for (const child of family.children) {
      const classRecord = classes[child.classIndex] || classes[0] || null
      const classSections = classRecord
        ? sections.filter((section) => section.classId === classRecord.id)
        : []
      const sectionRecord = classSections[child.sectionIndex] || classSections[0] || null

      const student = await ensureAdmissionForChild({
        family,
        child,
        schoolId: school.id,
        createdBy: createdByUser.id,
        classId: classRecord?.id || null,
        sectionId: sectionRecord?.id || null,
        siblingId: firstSiblingId,
        feesGroupId: newAdmissionGroup?.id || null,
      })

      await ensureStudentParentLink(student.id, fatherParent.id, 'Father', true)
      await ensureStudentParentLink(student.id, motherParent.id, 'Mother', false)

      if (!firstSiblingId) {
        firstSiblingId = student.id
      } else {
        siblingLinks++
      }

      createdFamilyStudents.push(student.id)
      createdOrFound++
    }

    if (createdFamilyStudents.length > 1) {
      const [firstStudentId, secondStudentId] = createdFamilyStudents
      const firstStudent = await db.student.findUnique({ where: { id: firstStudentId } })
      if (firstStudent && !firstStudent.siblingId) {
        await db.student.update({
          where: { id: firstStudentId },
          data: { siblingId: secondStudentId },
        })
        await db.admission.updateMany({
          where: { studentId: firstStudentId, schoolId: school.id },
          data: { siblingId: secondStudentId },
        })
      }
    }
  }

  console.log(`Done. Ensured ${createdOrFound} direct admission students across ${families.length} families.`)
  console.log(`Sibling links attached for ${siblingLinks} younger/newer siblings, plus reciprocal first-child links where needed.`)
  console.log('Parent login password for seeded families: parent123')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
