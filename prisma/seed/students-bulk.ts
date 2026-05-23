import { db } from '../../src/lib/db'
import { hashPassword } from '../../src/lib/auth'

const ACADEMIC_YEAR = '2025-2026'
const STUDENTS_PER_SECTION = 10

// Realistic Indian name pools — deterministic so re-runs produce identical data.
const FIRST_NAMES_MALE = ['Aarav', 'Vihaan', 'Aditya', 'Vivaan', 'Arjun', 'Reyansh', 'Sai', 'Krishna', 'Ishaan', 'Shaurya', 'Atharv', 'Aryan', 'Rohan', 'Aniket', 'Karan', 'Manav', 'Dev', 'Yash', 'Harsh', 'Rudra']
const FIRST_NAMES_FEMALE = ['Aadhya', 'Saanvi', 'Aanya', 'Diya', 'Anika', 'Myra', 'Pari', 'Riya', 'Kiara', 'Avni', 'Sara', 'Tara', 'Ira', 'Mira', 'Nisha', 'Priya', 'Shreya', 'Tanvi', 'Neha', 'Sneha']
const LAST_NAMES = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Yadav', 'Mishra', 'Pandey', 'Tiwari', 'Joshi', 'Patel', 'Reddy', 'Iyer', 'Nair', 'Menon', 'Khan', 'Rao', 'Bose', 'Chatterjee', 'Mukherjee']
const FATHER_FIRSTS = ['Rakesh', 'Rajesh', 'Suresh', 'Mahesh', 'Ramesh', 'Anil', 'Sunil', 'Vinod', 'Manoj', 'Ashok', 'Sanjay', 'Vijay', 'Arun', 'Mukesh', 'Pawan', 'Deepak', 'Rajiv', 'Naveen']
const MOTHER_FIRSTS = ['Sunita', 'Geeta', 'Meena', 'Rekha', 'Pooja', 'Anita', 'Kavita', 'Neelam', 'Sushma', 'Renu', 'Seema', 'Radha', 'Shobha', 'Usha', 'Mamta', 'Asha', 'Lata', 'Sangeeta']
const OCCUPATIONS = ['Business', 'Engineer', 'Doctor', 'Teacher', 'Government Service', 'Accountant', 'Shopkeeper', 'Architect', 'Bank Manager', 'IT Professional']
const EDUCATIONS = ['B.A.', 'B.Com.', 'B.Sc.', 'B.Tech', 'M.A.', 'M.Com.', 'M.Sc.', 'MBA', 'B.Ed', '12th Pass']
const RELIGIONS = ['Hindu', 'Muslim', 'Sikh', 'Christian', 'Jain']
const CATEGORIES = ['General', 'OBC', 'SC', 'ST', 'EWS']
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']

const AREAS = [
  { area: 'Karol Bagh', postOffice: 'Karol Bagh', policeStation: 'Karol Bagh', wardNo: '74', pincode: '110005' },
  { area: 'Saket', postOffice: 'Saket', policeStation: 'Saket', wardNo: '163', pincode: '110017' },
  { area: 'Dwarka', postOffice: 'Dwarka Sector 6', policeStation: 'Dwarka', wardNo: '125', pincode: '110075' },
  { area: 'Vasant Kunj', postOffice: 'Vasant Kunj', policeStation: 'Vasant Kunj', wardNo: '162', pincode: '110070' },
  { area: 'Rohini', postOffice: 'Rohini Sector 7', policeStation: 'Rohini', wardNo: '15', pincode: '110085' },
  { area: 'Janakpuri', postOffice: 'Janakpuri B-Block', policeStation: 'Janakpuri', wardNo: '113', pincode: '110058' },
  { area: 'Mayur Vihar', postOffice: 'Mayur Vihar Phase 1', policeStation: 'Mayur Vihar', wardNo: '212', pincode: '110091' },
  { area: 'Pitampura', postOffice: 'Pitampura', policeStation: 'Pitampura', wardNo: '60', pincode: '110034' },
]

// Group rotation: ~70% New Admission, 10% each of others. 10 students per section.
const GROUP_ROTATION = [
  'New Admission', 'New Admission', 'New Admission', 'New Admission',
  'New Admission', 'New Admission', 'New Admission',
  'Staff Ward', 'RTE', '3rd Ward',
]

function pick<T>(arr: T[], idx: number): T {
  return arr[Math.abs(idx) % arr.length]
}

function pad(n: number, width: number) {
  return String(n).padStart(width, '0')
}

function dobForClass(classNumber: number, idx: number): Date {
  // Children aged ~ (5 + classNumber) years. Spread DoB across 2018, 2017, etc.
  const targetAge = 5 + classNumber
  const birthYear = 2025 - targetAge
  // spread within year using idx
  const month = (idx * 5) % 12
  const day = ((idx * 7) % 27) + 1
  return new Date(birthYear, month, day)
}

function phoneFromIdx(idx: number, prefix = 98) {
  // Generate a 10-digit Indian-style phone, deterministic by index.
  const n = 1000000 + (idx * 1009) % 8000000
  return `${prefix}${pad(n, 8)}`
}

async function main() {
  console.log('🌱 Seeding bulk students (10 per section)...')

  const school = await db.school.findFirst({ where: { subdomain: 'dps-delhi', deletedAt: null } })
  if (!school) throw new Error('Seed school "dps-delhi" not found. Run the core seed first.')

  const schoolAdmin = await db.user.findFirst({ where: { schoolId: school.id, role: 'SCHOOL_ADMIN', deletedAt: null } })
  if (!schoolAdmin) throw new Error('School admin not found. Run the core seed first.')

  const classes = await db.class.findMany({ where: { schoolId: school.id, deletedAt: null }, orderBy: { name: 'asc' } })
  const sections = await db.section.findMany({ where: { schoolId: school.id, deletedAt: null }, orderBy: [{ classId: 'asc' }, { name: 'asc' }] })
  const feeGroups = await db.feesGroup.findMany({ where: { schoolId: school.id, deletedAt: null } })
  const feeGroupByName = new Map(feeGroups.map(g => [g.name, g]))
  const parentRole = await db.role.findFirst({ where: { schoolId: school.id, name: 'Parent', deletedAt: null, isActive: true } })

  // Backfill: ensure any pre-existing bulk student has a matching enrollment row
  // for 2025-2026. Earlier runs of this seed (before the enrollment block was
  // added) left some students without one — the student detail page then shows
  // "wasn't enrolled in 2025-2026" even though the student is in the active session.
  const existingBulkStudents = await db.student.findMany({
    where: { schoolId: school.id, admissionNumber: { startsWith: 'STD-2025-' } },
    select: { id: true, classId: true, sectionId: true, rollNumber: true, admissionDate: true },
  })
  let backfilled = 0
  for (const stu of existingBulkStudents) {
    if (!stu.classId) continue
    const has = await db.studentAcademicEnrollment.findFirst({
      where: { studentId: stu.id, academicYear: ACADEMIC_YEAR, deletedAt: null },
      select: { id: true },
    })
    if (has) continue
    await db.studentAcademicEnrollment.create({
      data: {
        schoolId: school.id,
        studentId: stu.id,
        academicYear: ACADEMIC_YEAR,
        classId: stu.classId,
        sectionId: stu.sectionId,
        rollNumber: stu.rollNumber,
        status: 'active',
        source: 'admission',
        effectiveFrom: stu.admissionDate || new Date('2025-04-01'),
        createdBy: schoolAdmin.id,
      },
    })
    backfilled++
  }
  if (backfilled > 0) {
    console.log(`✅ Backfilled ${backfilled} missing 2025-2026 enrollments for existing bulk students`)
  }

  // Idempotency: skip new creation if bulk students already present.
  if (existingBulkStudents.length > 0) {
    console.log(`↺ Bulk students already seeded (${existingBulkStudents.length} found). Skipping new creation.`)
    return
  }

  let nextSeq = 1
  let studentsCreated = 0
  let parentsCreated = 0

  for (const cls of classes) {
    const classNumber = parseInt(cls.name.replace(/\D/g, ''), 10) || 1
    const classSections = sections.filter(s => s.classId === cls.id)

    for (const section of classSections) {
      for (let s = 0; s < STUDENTS_PER_SECTION; s++) {
        const idx = nextSeq // deterministic seed-stable index
        const isMale = idx % 2 === 0
        const firstName = isMale ? pick(FIRST_NAMES_MALE, idx) : pick(FIRST_NAMES_FEMALE, idx + 3)
        const lastName = pick(LAST_NAMES, idx + 1)
        const fatherFirst = pick(FATHER_FIRSTS, idx)
        const motherFirst = pick(MOTHER_FIRSTS, idx + 2)
        const occupationFather = pick(OCCUPATIONS, idx)
        const occupationMother = pick(OCCUPATIONS, idx + 3)
        const educationFather = pick(EDUCATIONS, idx)
        const educationMother = pick(EDUCATIONS, idx + 4)
        const religion = pick(RELIGIONS, idx)
        const category = pick(CATEGORIES, idx + 1)
        const bloodGroup = pick(BLOOD_GROUPS, idx + 2)
        const area = pick(AREAS, idx)
        const groupName = pick(GROUP_ROTATION, s)
        const feesGroup = feeGroupByName.get(groupName) || feeGroupByName.get('New Admission')

        const admissionNumber = `STD-2025-${pad(nextSeq, 3)}`
        const fatherPhone = phoneFromIdx(idx * 2, 98)
        const motherPhone = phoneFromIdx(idx * 2 + 1, 97)
        const fatherIncome = 400000 + (idx % 12) * 75000
        const motherIncome = 250000 + (idx % 10) * 50000

        // -- Parent user (phone-keyed local email)
        const parentEmail = `${fatherPhone}@parent.local`
        let parentUser = await db.user.findUnique({ where: { email: parentEmail } })
        if (!parentUser) {
          parentUser = await db.user.create({
            data: {
              schoolId: school.id,
              email: parentEmail,
              password: await hashPassword('parent123'),
              name: `${fatherFirst} ${lastName}`,
              phone: fatherPhone,
              role: 'PARENT',
              isActive: true,
            },
          })
          parentsCreated++
          if (parentRole) {
            await db.userRole.create({
              data: { userId: parentUser.id, roleId: parentRole.id, assignedBy: schoolAdmin.id },
            })
          }
        }

        // -- Parent record (father)
        const fatherParent = await db.parent.create({
          data: {
            schoolId: school.id,
            userId: parentUser.id,
            fatherName: `${fatherFirst} ${lastName}`,
            phone: fatherPhone,
            alternatePhone: motherPhone,
            email: `${fatherFirst.toLowerCase()}.${lastName.toLowerCase()}${idx}@example.com`,
            occupation: occupationFather,
            address: `H-${idx}, ${area.area}, New Delhi`,
            annualIncome: fatherIncome,
          },
        })

        const motherParent = await db.parent.create({
          data: {
            schoolId: school.id,
            motherName: `${motherFirst} ${lastName}`,
            phone: motherPhone,
            alternatePhone: fatherPhone,
            email: `${motherFirst.toLowerCase()}.${lastName.toLowerCase()}${idx}@example.com`,
            occupation: occupationMother,
            address: `H-${idx}, ${area.area}, New Delhi`,
            annualIncome: motherIncome,
          },
        })

        const dob = dobForClass(classNumber, idx)
        const familyId = `FAM-2025-${pad(nextSeq, 3)}`

        await db.$transaction(async (tx) => {
          const admission = await tx.admission.create({
            data: {
              schoolId: school.id,
              admissionNumber,
              academicYear: ACADEMIC_YEAR,
              admissionType: 'new',
              status: 'admitted',
              firstName,
              lastName,
              dateOfBirth: dob,
              dateOfAdmission: new Date('2025-04-01'),
              gender: isMale ? 'Male' : 'Female',
              nationality: 'Indian',
              religion,
              category,
              motherTongue: 'Hindi',
              bloodGroup,
              registrationNumber: `REG-2025-${pad(nextSeq, 3)}`,
              address: `H-${idx}, ${area.area}, New Delhi`,
              village: area.area,
              postOffice: area.postOffice,
              policeStation: area.policeStation,
              wardNo: area.wardNo,
              city: 'New Delhi',
              state: 'Delhi',
              pincode: area.pincode,
              country: 'India',
              sameAsPermanent: true,
              fatherName: `${fatherFirst} ${lastName}`,
              fatherPhone,
              fatherEmail: `${fatherFirst.toLowerCase()}.${lastName.toLowerCase()}${idx}@example.com`,
              fatherOccupation: occupationFather,
              fatherEducation: educationFather,
              fatherIncome,
              motherName: `${motherFirst} ${lastName}`,
              motherPhone,
              motherEmail: `${motherFirst.toLowerCase()}.${lastName.toLowerCase()}${idx}@example.com`,
              motherOccupation: occupationMother,
              motherEducation: educationMother,
              motherIncome,
              classId: cls.id,
              sectionId: section.id,
              admissionSession: ACADEMIC_YEAR,
              mediumOfInstruction: 'English',
              feesGroupId: feesGroup?.id || null,
              familyId,
              annualIncome: fatherIncome + motherIncome,
              sourceOfInfo: 'walk_in',
              appliedDate: new Date('2025-03-20'),
              admittedBy: schoolAdmin.id,
              admittedAt: new Date('2025-04-01'),
              createdBy: schoolAdmin.id,
            },
          })

          const student = await tx.student.create({
            data: {
              schoolId: school.id,
              classId: cls.id,
              sectionId: section.id,
              admissionNumber,
              rollNumber: pad(s + 1, 2),
              firstName,
              lastName,
              dateOfBirth: dob,
              gender: isMale ? 'Male' : 'Female',
              nationality: 'Indian',
              religion,
              category,
              motherTongue: 'Hindi',
              bloodGroup,
              address: `H-${idx}, ${area.area}, New Delhi`,
              city: 'New Delhi',
              state: 'Delhi',
              pincode: area.pincode,
              country: 'India',
              admissionDate: new Date('2025-04-01'),
              familyId,
              admissionStatus: 'admitted',
              isActive: true,
            },
          })

          await tx.admission.update({ where: { id: admission.id }, data: { studentId: student.id } })

          await tx.studentAcademicEnrollment.create({
            data: {
              schoolId: school.id,
              studentId: student.id,
              academicYear: ACADEMIC_YEAR,
              classId: cls.id,
              sectionId: section.id,
              rollNumber: pad(s + 1, 2),
              status: 'active',
              source: 'admission',
              effectiveFrom: new Date('2025-04-01'),
              createdBy: schoolAdmin.id,
            },
          })

          await tx.studentParent.create({ data: { studentId: student.id, parentId: fatherParent.id, relation: 'Father', isPrimary: true } })
          await tx.studentParent.create({ data: { studentId: student.id, parentId: motherParent.id, relation: 'Mother', isPrimary: false } })

          await tx.admissionActivity.create({
            data: {
              admissionId: admission.id,
              action: 'admitted',
              toValue: 'admitted',
              performedBy: schoolAdmin.id,
              description: `Bulk-seeded admission ${admissionNumber} for ${cls.name}-${section.name}.`,
            },
          })
        })

        studentsCreated++
        nextSeq++
      }
    }
  }

  console.log(`✅ Created ${studentsCreated} bulk students with parents and enrollments (${parentsCreated} new parent users)`)
  console.log('👨‍👩‍👧 Bulk students seed complete.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
