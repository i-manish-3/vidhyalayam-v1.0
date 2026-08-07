import { db } from '../../src/lib/db'
import { hashPassword } from '../../src/lib/auth'

async function seed() {
  // Idempotency guard: if any SUPER_ADMIN already exists, the demo data has
  // been seeded before. We don't pin to a specific email here because the
  // platform owner may have changed the super admin email (e.g. to wire up a
  // real inbox for the /forgot-password flow), and matching by email would
  // miss that case and create a duplicate.
  const existingSuperAdmin = await db.user.findFirst({
    where: { role: 'SUPER_ADMIN', deletedAt: null },
  })
  const existingSchool = await db.school.findFirst({
    where: { deletedAt: null },
  })

  if (existingSuperAdmin && existingSchool) {
    console.log('Core demo data already exists, skipping.')
    return
  }

  console.log('🌱 Seeding database...')

  // Create super admin
  const superAdmin = await db.user.create({
    data: { email: 'sahyog.vidhyalayam@gmail.com', password: await hashPassword('admin123'), name: 'Super Admin', phone: '+91-9999999999', role: 'SUPER_ADMIN', isActive: true },
  })
  console.log('✅ Created super admin')

  // Create demo school
  const school = await db.school.create({
    data: {
      name: 'Delhi Public School', address: 'Mathura Road, New Delhi', city: 'New Delhi', state: 'Delhi', pincode: '110003', country: 'India',
      contactPhone: '+91-11-24362489', contactEmail: 'info@dpsdelhi.in', website: 'https://dpsdelhi.in',
      academicYear: '2026-2027', board: 'CBSE', timezone: 'Asia/Kolkata', currency: 'INR',
      subdomain: 'dps-delhi', status: 'active', onboardingDate: new Date('2024-04-01'),
    },
  })
  console.log('✅ Created demo school')

  // Academic Year — one current session per school
  const allSchoolsForYear = [school]
  for (const sch of allSchoolsForYear) {
    await db.academicYear.create({
      data: {
        schoolId: sch.id,
        name: '2026-2027',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2027-03-31'),
        isCurrent: true,
        isActive: true,
      },
    })
  }
  console.log('✅ Created academic year 2026-2027 (current) for all schools')

  // School admin
  const schoolAdmin = await db.user.create({
    data: { email: 'admin@dpsdelhi.in', password: await hashPassword('admin123'), name: 'Rajesh Kumar', phone: '+91-9876543210', role: 'SCHOOL_ADMIN', schoolId: school.id, isActive: true },
  })

  // Admission settings — one per school, scoped to current year
  for (const sch of allSchoolsForYear) {
    await db.admissionSetting.create({
      data: {
        schoolId: sch.id,
        academicYear: '2026-2027',
        admissionNumberPrefix: 'STD',
        admissionNumberFormat: '{PREFIX}-{YEAR}-{SEQ}',
        sequenceStart: 1,
        sequenceDigits: 3,
        resetSequenceYearly: true,
        registrationNumberPrefix: 'REG',
        registrationNumberFormat: '{PREFIX}-{YEAR}-{SEQ}',
        registrationSequenceStart: 1,
        registrationSequenceDigits: 3,
        registrationResetYearly: true,
        minAge: 3,
        maxAge: 18,
        ageCalculationDate: 'april_1',
        requiredDocuments: JSON.stringify(['birth_certificate', 'aadhaar', 'previous_school_tc']),
        admissionFeeRequired: true,
        enableWaitlist: true,
        requirePhoto: true,
        allowOnlineSubmission: false,
        autoVerifyDocuments: false,
        isActive: true,
      },
    })
  }
  console.log('✅ Created admission settings for all schools')

  // Classes
  const classes: any[] = []
  for (let i = 1; i <= 12; i++) {
    classes.push(await db.class.create({ data: { schoolId: school.id, name: `Class ${i}` } }))
  }

  // Sections
  const sections: any[] = []
  for (const cls of classes) {
    for (const s of ['A', 'B']) {
      sections.push(await db.section.create({ data: { schoolId: school.id, classId: cls.id, name: s } }))
    }
  }
  console.log(`✅ Created ${classes.length} classes and ${sections.length} sections`)

  // Subjects — spread across all four types (primary/optional/extra/special)
  const subjectData = [
    { name: 'Mathematics', code: 'MATH', type: 'primary' },
    { name: 'Physics', code: 'PHY', type: 'primary' },
    { name: 'Chemistry', code: 'CHEM', type: 'primary' },
    { name: 'Biology', code: 'BIO', type: 'primary' },
    { name: 'English', code: 'ENG', type: 'primary' },
    { name: 'Hindi', code: 'HIN', type: 'primary' },
    { name: 'Social Science', code: 'SST', type: 'primary' },
    { name: 'Computer Science', code: 'CS', type: 'optional' },
    { name: 'Physical Education', code: 'PED', type: 'extra' },
    { name: 'Music', code: 'MUS', type: 'special' },
    { name: 'Art & Craft', code: 'ART', type: 'special' },
  ]
  const subjects = await Promise.all(subjectData.map(s => db.subject.create({ data: { schoolId: school.id, name: s.name, code: s.code, type: s.type } })))

  // Map subjects to classes (Class N → subject set appropriate to that level)
  const subjectByCode = new Map(subjects.map(s => [s.code!, s.id]))
  function subjectCodesForClass(classNumber: number): string[] {
    if (classNumber <= 5) return ['MATH', 'ENG', 'HIN', 'SST', 'PED', 'MUS', 'ART']
    if (classNumber <= 8) return ['MATH', 'ENG', 'HIN', 'SST', 'CS', 'PED', 'ART']
    if (classNumber <= 10) return ['MATH', 'PHY', 'CHEM', 'BIO', 'ENG', 'HIN', 'SST', 'CS', 'PED']
    return ['MATH', 'PHY', 'CHEM', 'BIO', 'ENG', 'CS', 'PED']
  }
  for (let i = 0; i < classes.length; i++) {
    const codes = subjectCodesForClass(i + 1)
    for (const code of codes) {
      const subjectId = subjectByCode.get(code)
      if (subjectId) {
        await db.classSubject.create({ data: { classId: classes[i].id, subjectId } })
      }
    }
  }
  console.log('✅ Mapped subjects to classes')

  // ────────────────────────────────────────────────────────────────
  // Exam Module — default paradigm + grade scale + report card template
  // per school. Picked CBSE term pattern as the default because most demo
  // schools are CBSE; school admins can edit or create new paradigms.
  // ────────────────────────────────────────────────────────────────
  for (const sch of allSchoolsForYear) {
    const paradigm = await db.examParadigm.create({
      data: {
        schoolId: sch.id,
        academicYear: '2026-2027',
        name: 'CBSE Term Pattern 2026-2027',
        description: 'Default CBSE-style two-term framework with weighted aggregation.',
        // Term 1 + Term 2, equal weight.
        aggregationRule: JSON.stringify({
          type: 'weighted',
          components: [
            { groupShortCode: 'T1', weight: 50 },
            { groupShortCode: 'T2', weight: 50 },
          ],
        }),
        passingRule: JSON.stringify({
          perSubject: 33,
          overall: 33,
          allowGrace: true,
          graceMax: 5,
        }),
        isActive: true,
        isDefault: true,
      },
    })

    // Two terms; each will hold its own exams once Phase 2 ships.
    await db.examGroup.createMany({
      data: [
        {
          schoolId: sch.id, paradigmId: paradigm.id,
          name: 'Term 1', shortCode: 'T1', sequence: 1, weight: 50,
          aggregationRule: JSON.stringify({ type: 'sum_all' }),
        },
        {
          schoolId: sch.id, paradigmId: paradigm.id,
          name: 'Term 2', shortCode: 'T2', sequence: 2, weight: 50,
          aggregationRule: JSON.stringify({ type: 'sum_all' }),
        },
      ],
    })

    // CBSE 9-point grading scale (percentage-based).
    const gradeScale = await db.gradeScale.create({
      data: {
        schoolId: sch.id,
        name: 'CBSE 9-point',
        scaleType: 'percentage',
        isActive: true,
        isDefault: true,
      },
    })
    const bands: ReadonlyArray<{ code: string; minValue: number; maxValue: number; gradePoint: number; remark: string }> = [
      { code: 'A1', minValue: 91, maxValue: 100, gradePoint: 10, remark: 'Outstanding' },
      { code: 'A2', minValue: 81, maxValue: 90.99, gradePoint: 9, remark: 'Excellent' },
      { code: 'B1', minValue: 71, maxValue: 80.99, gradePoint: 8, remark: 'Very Good' },
      { code: 'B2', minValue: 61, maxValue: 70.99, gradePoint: 7, remark: 'Good' },
      { code: 'C1', minValue: 51, maxValue: 60.99, gradePoint: 6, remark: 'Fair' },
      { code: 'C2', minValue: 41, maxValue: 50.99, gradePoint: 5, remark: 'Average' },
      { code: 'D', minValue: 33, maxValue: 40.99, gradePoint: 4, remark: 'Pass' },
      { code: 'E1', minValue: 21, maxValue: 32.99, gradePoint: 0, remark: 'Needs Improvement' },
      { code: 'E2', minValue: 0, maxValue: 20.99, gradePoint: 0, remark: 'Unsatisfactory' },
    ]
    await db.gradeBand.createMany({
      data: bands.map((b, i) => ({ ...b, gradeScaleId: gradeScale.id, sequence: i })),
    })

    // Phase 5: three default report card templates so schools always have a
    // safe layout to clone. CBSE is the default; Simple is a minimal layout
    // for state boards; Coaching highlights rank and best-of-N totals.
    await db.reportCardTemplate.createMany({
      data: [
        {
          schoolId: sch.id,
          name: 'CBSE Standard Report Card',
          description: 'Term-wise marks + components + grades + co-scholastic + signatures.',
          format: 'cbse',
          appliesToParadigmId: paradigm.id,
          layoutJson: JSON.stringify({
            header: { showLogo: true, showAddress: true, showAffiliation: true, title: 'Academic Report Card' },
            studentBlock: ['name', 'admissionNumber', 'rollNumber', 'class', 'section', 'fatherName', 'motherName'],
            subjectTable: { showComponents: true, showGrade: true, showRank: true, showMaxMarks: true, showPercentage: true },
            footer: { showAttendance: true, showRemarks: true, signatures: ['Class Teacher', 'Principal'] },
          }),
          includeAttendance: true,
          includeRank: true,
          includeCoScholastic: true,
          showPrincipalRemarks: true,
          showTeacherRemarks: true,
          isDefault: true,
          isActive: true,
        },
        {
          schoolId: sch.id,
          name: 'Simple Report Card',
          description: 'Minimal layout: subject, max, obtained, grade. No components, no co-scholastic.',
          format: 'simple',
          appliesToParadigmId: null,
          layoutJson: JSON.stringify({
            header: { showLogo: true, showAddress: true, showAffiliation: false, title: 'Report Card' },
            studentBlock: ['name', 'rollNumber', 'class', 'section', 'fatherName'],
            subjectTable: { showComponents: false, showGrade: true, showRank: false, showMaxMarks: true, showPercentage: true },
            footer: { showAttendance: false, showRemarks: false, signatures: ['Principal'] },
          }),
          includeAttendance: false,
          includeRank: false,
          includeCoScholastic: false,
          showPrincipalRemarks: false,
          showTeacherRemarks: false,
          isDefault: false,
          isActive: true,
        },
        {
          schoolId: sch.id,
          name: 'Coaching Performance Card',
          description: 'Highlights rank, percentile, and best-of-N performance. No attendance/remarks.',
          format: 'coaching',
          appliesToParadigmId: null,
          layoutJson: JSON.stringify({
            header: { showLogo: true, showAddress: false, showAffiliation: false, title: 'Performance Report' },
            studentBlock: ['name', 'admissionNumber', 'class', 'fatherName', 'parentPhone'],
            subjectTable: { showComponents: false, showGrade: true, showRank: true, showMaxMarks: true, showPercentage: true },
            footer: { showAttendance: false, showRemarks: true, signatures: ['Center Head'] },
          }),
          includeAttendance: false,
          includeRank: true,
          includeCoScholastic: false,
          showPrincipalRemarks: true,
          showTeacherRemarks: false,
          isDefault: false,
          isActive: true,
        },
      ],
    })
  }
  console.log('✅ Created default exam paradigm + grade scale + 3 report card templates per school')

  // Period config — 8 periods covering 08:00-13:00 with one short break
  const periods = [
    { period: 1, startTime: '08:00', endTime: '08:40', label: 'Period 1', isBreak: false },
    { period: 2, startTime: '08:40', endTime: '09:20', label: 'Period 2', isBreak: false },
    { period: 3, startTime: '09:20', endTime: '10:00', label: 'Period 3', isBreak: false },
    { period: 4, startTime: '10:00', endTime: '10:40', label: 'Period 4', isBreak: false },
    { period: 5, startTime: '10:40', endTime: '11:00', label: 'Short Break', isBreak: true },
    { period: 6, startTime: '11:00', endTime: '11:40', label: 'Period 5', isBreak: false },
    { period: 7, startTime: '11:40', endTime: '12:20', label: 'Period 6', isBreak: false },
    { period: 8, startTime: '12:20', endTime: '13:00', label: 'Period 7', isBreak: false },
  ]
  for (const p of periods) {
    await db.periodConfig.create({ data: { schoolId: school.id, ...p } })
  }
  console.log('✅ Created period configuration')

  // Teachers — multiple per core subject so the timetable generator can fill
  // all 24 sections without putting the same teacher in two rooms at once.
  const teacherData = [
    // Mathematics — 4 (primary, middle, secondary)
    { first: 'Anita', last: 'Sharma', spec: 'Mathematics', qual: 'M.Sc, B.Ed', gender: 'Female' },
    { first: 'Deepak', last: 'Tiwari', spec: 'Mathematics', qual: 'M.Sc, B.Ed', gender: 'Male' },
    { first: 'Neha', last: 'Mishra', spec: 'Mathematics', qual: 'M.Sc, B.Ed', gender: 'Female' },
    { first: 'Sanjay', last: 'Yadav', spec: 'Mathematics', qual: 'M.Sc, B.Ed', gender: 'Male' },
    // Science split — Physics, Chemistry, Biology (secondary only)
    { first: 'Vikram', last: 'Patel', spec: 'Physics', qual: 'M.Sc, B.Ed', gender: 'Male' },
    { first: 'Anjali', last: 'Rao', spec: 'Physics', qual: 'M.Sc, B.Ed', gender: 'Female' },
    { first: 'Priya', last: 'Singh', spec: 'Chemistry', qual: 'M.Sc, B.Ed', gender: 'Female' },
    { first: 'Rohit', last: 'Mehra', spec: 'Chemistry', qual: 'M.Sc, B.Ed', gender: 'Male' },
    { first: 'Ramesh', last: 'Gupta', spec: 'Biology', qual: 'M.Sc, B.Ed', gender: 'Male' },
    { first: 'Pooja', last: 'Bhatt', spec: 'Biology', qual: 'M.Sc, B.Ed', gender: 'Female' },
    // English — 3
    { first: 'Sunita', last: 'Verma', spec: 'English', qual: 'M.A, B.Ed', gender: 'Female' },
    { first: 'Rajesh', last: 'Bansal', spec: 'English', qual: 'M.A, B.Ed', gender: 'Male' },
    { first: 'Shruti', last: 'Pandey', spec: 'English', qual: 'M.A, B.Ed', gender: 'Female' },
    // Hindi — 2
    { first: 'Mohan', last: 'Kumar', spec: 'Hindi', qual: 'M.A, B.Ed', gender: 'Male' },
    { first: 'Renu', last: 'Agarwal', spec: 'Hindi', qual: 'M.A, B.Ed', gender: 'Female' },
    // Social Science — 2
    { first: 'Kavita', last: 'Joshi', spec: 'Social Science', qual: 'M.A, B.Ed', gender: 'Female' },
    { first: 'Manoj', last: 'Saxena', spec: 'Social Science', qual: 'M.A, B.Ed', gender: 'Male' },
    // Computer Science — 2 (covers middle + secondary)
    { first: 'Arun', last: 'Reddy', spec: 'Computer Science', qual: 'M.Tech', gender: 'Male' },
    { first: 'Manish', last: 'Kapoor', spec: 'Computer Science', qual: 'B.Tech, M.Ed', gender: 'Male' },
    // Physical Education — 2
    { first: 'Ravi', last: 'Bhardwaj', spec: 'Physical Education', qual: 'B.P.Ed', gender: 'Male' },
    { first: 'Suman', last: 'Chauhan', spec: 'Physical Education', qual: 'M.P.Ed', gender: 'Female' },
    // Special subjects
    { first: 'Nidhi', last: 'Khanna', spec: 'Music', qual: 'M.A Music', gender: 'Female' },
    { first: 'Sumit', last: 'Malhotra', spec: 'Art', qual: 'B.F.A', gender: 'Male' },
  ]
  const teachers: any[] = []
  for (const t of teacherData) {
    const teacher = await db.teacher.create({
      data: { schoolId: school.id, firstName: t.first, lastName: t.last, specialization: t.spec, qualification: t.qual, experience: 5 + Math.floor(Math.random() * 10), joinDate: new Date('2020-06-01'), gender: t.gender, isActive: true },
    })
    teachers.push(teacher)
    // Create user for teacher
    await db.user.create({ data: { email: `${t.first.toLowerCase()}.${t.last.toLowerCase()}@dpsdelhi.in`, password: await hashPassword('teacher123'), name: `${t.first} ${t.last}`, role: 'TEACHER', schoolId: school.id, isActive: true } })
    // Salary structure
    const basic = 25000 + Math.floor(Math.random() * 20000)
    const hra = basic * 0.2; const da = basic * 0.1; const ta = 3000; const medical = 2000; const special = 5000
    const gross = basic + hra + da + ta + medical + special
    const pf = basic * 0.12; const esi = basic * 0.0175; const net = gross - pf - esi
    await db.salaryStructure.create({ data: { schoolId: school.id, staffType: 'teacher', staffId: teacher.id, basicSalary: basic, hra, da, ta, medicalAllowance: medical, specialAllowance: special, pf, esi, grossSalary: gross, netSalary: net, standardDays: 30, effectiveFrom: new Date('2026-04-01') } })
  }
  console.log(`✅ Created ${teachers.length} teachers with salary structures`)

  // Fee Heads
  // NOTE: "Transport Fee" is intentionally NOT a FeesHead — transport billing is
  // module-driven (TransportAllocation auto-creates FeeCollection rows with
  // feeHeadName='Transport Fee' string). Keeping it out of the master prevents
  // duplicate invoices via structure-based assignment.
  const feeHeads = await Promise.all([
    db.feesHead.create({ data: { schoolId: school.id, name: 'Tuition Fee', frequency: 'MONTHLY' } }),
    db.feesHead.create({ data: { schoolId: school.id, name: 'Admission Fee', frequency: 'ONE_TIME' } }),
    db.feesHead.create({ data: { schoolId: school.id, name: 'Annual Fee', frequency: 'YEARLY' } }),
    db.feesHead.create({ data: { schoolId: school.id, name: 'Exam Fee', frequency: 'QUARTERLY' } }),
    db.feesHead.create({ data: { schoolId: school.id, name: 'Smart Class Fee', frequency: 'HALF_YEARLY' } }),
    db.feesHead.create({ data: { schoolId: school.id, name: 'Lab Fee', frequency: 'YEARLY' } }),
  ])

  // Fee Groups — categorical (concession-based), not class-based.
  // New Admission = default full fees; others are concessional brackets.
  const feeGroupDefs = [
    { name: 'New Admission', description: 'Standard fees for newly admitted students (full pricing)', tuitionMultiplier: 1.0, admissionMultiplier: 1.0, annualMultiplier: 1.0 },
    { name: 'Staff Ward', description: 'Concession for children of school staff (50% tuition discount)', tuitionMultiplier: 0.5, admissionMultiplier: 0.0, annualMultiplier: 0.5 },
    { name: 'RTE', description: 'Right to Education — fees fully waived', tuitionMultiplier: 0.0, admissionMultiplier: 0.0, annualMultiplier: 0.0 },
    { name: '3rd Ward', description: 'Third-child / sibling concession (25% tuition discount)', tuitionMultiplier: 0.75, admissionMultiplier: 0.5, annualMultiplier: 0.75 },
  ]
  const feeGroups = await Promise.all(
    feeGroupDefs.map(g => db.feesGroup.create({ data: { schoolId: school.id, name: g.name, description: g.description } }))
  )
  console.log(`✅ Created ${feeGroups.length} fee groups (${feeGroupDefs.map(g => g.name).join(', ')})`)

  const tuitionFee = feeHeads[0]; const admissionFee = feeHeads[1]; const annualFee = feeHeads[2]; const examFee = feeHeads[3]

  // Group → fee heads (same items across all four groups; pricing differs at structure level)
  for (const grp of feeGroups) {
    await Promise.all([
      db.feesGroupItem.create({ data: { groupId: grp.id, feeHeadId: tuitionFee.id } }),
      db.feesGroupItem.create({ data: { groupId: grp.id, feeHeadId: admissionFee.id } }),
      db.feesGroupItem.create({ data: { groupId: grp.id, feeHeadId: annualFee.id } }),
      db.feesGroupItem.create({ data: { groupId: grp.id, feeHeadId: examFee.id } }),
    ])
  }

  // Fee Structure per (class × group) — sectionId=null so it applies to every section of that class.
  // Indian academic year: Apr 2026 → Mar 2027 monthly tuition; lump-sum admission & annual; quarterly exam fee.
  const monthsByCalendarIdx = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  function monthlyTuitionForClass(classNumber: number) {
    if (classNumber <= 5) return 1500
    if (classNumber <= 8) return 2500
    return 4000
  }
  let structuresCreated = 0
  for (let i = 0; i < classes.length; i++) {
    const classNumber = i + 1
    const cls = classes[i]
    const baseTuition = monthlyTuitionForClass(classNumber)
    for (let gi = 0; gi < feeGroups.length; gi++) {
      const grp = feeGroups[gi]
      const def = feeGroupDefs[gi]
      const tuition = Math.round(baseTuition * def.tuitionMultiplier)
      const admissionAmt = Math.round(10000 * def.admissionMultiplier)
      const annualAmt = Math.round(5000 * def.annualMultiplier)

      const fs = await db.feesStructure.create({
        data: {
          schoolId: school.id,
          feesGroupId: grp.id,
          classId: cls.id,
          sectionId: null,
          academicYear: '2026-2027',
          name: `${cls.name} • ${def.name}`,
          status: 'active',
          effectiveFrom: new Date('2026-04-01'),
          isActive: true,
        },
      })
      // Monthly tuition only (Apr 2026 → Mar 2027). Transport is allocated per-student
      // via TransportAllocation; it auto-generates its own FeeCollection rows.
      for (let m = 0; m < 12; m++) {
        const calMonthIdx = (3 + m) % 12
        const year = calMonthIdx >= 3 ? 2026 : 2027
        await db.feesStructureItem.create({ data: { feeStructureId: fs.id, feeHeadId: tuitionFee.id, installmentName: monthsByCalendarIdx[calMonthIdx], amount: tuition, dueDate: new Date(year, calMonthIdx, 10), lateFee: tuition > 0 ? 100 : 0, frequency: 'MONTHLY' } })
      }
      await db.feesStructureItem.create({ data: { feeStructureId: fs.id, feeHeadId: admissionFee.id, installmentName: 'Admission', amount: admissionAmt, dueDate: new Date(2026, 3, 15), lateFee: 0, frequency: 'ONE_TIME' } })
      await db.feesStructureItem.create({ data: { feeStructureId: fs.id, feeHeadId: annualFee.id, installmentName: 'Annual', amount: annualAmt, dueDate: new Date(2026, 3, 15), lateFee: annualAmt > 0 ? 500 : 0, frequency: 'YEARLY' } })
      const quarterly: Array<[string, number, number]> = [
        ['Q1 (Apr-Jun)', 3, 2026],
        ['Q2 (Jul-Sep)', 6, 2026],
        ['Q3 (Oct-Dec)', 9, 2026],
        ['Q4 (Jan-Mar)', 0, 2027],
      ]
      for (const [name, monthIdx, year] of quarterly) {
        await db.feesStructureItem.create({ data: { feeStructureId: fs.id, feeHeadId: examFee.id, installmentName: name, amount: 500, dueDate: new Date(year, monthIdx, 15), lateFee: 0, frequency: 'QUARTERLY' } })
      }
      structuresCreated++
    }
  }
  console.log(`✅ Created ${structuresCreated} fee structures across ${classes.length} classes × ${feeGroups.length} groups`)

  // Transport routes + per-stop fares
  // April → March academic-year cycle. App stores feeMonths as 3-letter strings
  // (see VALID_FEE_MONTHS in routes API); the schema default is "[]" which
  // would leave routes with no billable months — hence we set it explicitly.
  const TRANSPORT_FEE_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']
  const TRANSPORT_ACADEMIC_YEAR = '2026-2027'
  const SCHOOL_GATE = 'School Gate, Mathura Road'
  const transportRouteDefs = [
    {
      name: 'Central Delhi Route', num: 'R1',
      startPoint: 'Connaught Place', endPoint: SCHOOL_GATE, distance: 8.5,
      stops: ['Connaught Place', 'Rajiv Chowk', 'Janpath', 'Patel Chowk', 'Khan Market'],
      baseFare: 1200, fareIncrement: 200,
      driverName: 'Rakesh Singh', driverPhone: '+91-9912345001', vehicleNumber: 'DL01AB1234',
    },
    {
      name: 'South Delhi Route', num: 'R2',
      startPoint: 'Saket', endPoint: SCHOOL_GATE, distance: 12.0,
      stops: ['Saket', 'Hauz Khas', 'Green Park', 'AIIMS', 'INA Market'],
      baseFare: 1500, fareIncrement: 200,
      driverName: 'Suresh Kumar', driverPhone: '+91-9912345002', vehicleNumber: 'DL02CD5678',
    },
    {
      name: 'North Delhi Route', num: 'R3',
      startPoint: 'Civil Lines', endPoint: SCHOOL_GATE, distance: 14.5,
      stops: ['Civil Lines', 'Kashmere Gate', 'ISBT', 'DU Campus', 'Mall Road'],
      baseFare: 1400, fareIncrement: 250,
      driverName: 'Mahesh Yadav', driverPhone: '+91-9912345003', vehicleNumber: 'DL03EF9012',
    },
    {
      name: 'West Delhi Route', num: 'R4',
      startPoint: 'Janakpuri', endPoint: SCHOOL_GATE, distance: 18.0,
      stops: ['Janakpuri', 'Tilak Nagar', 'Rajouri Garden', 'Karol Bagh', 'New Delhi Station'],
      baseFare: 1600, fareIncrement: 250,
      driverName: 'Vinod Sharma', driverPhone: '+91-9912345004', vehicleNumber: 'DL04GH3456',
    },
  ]
  let stopFaresCreated = 0
  for (const r of transportRouteDefs) {
    const route = await db.transportRoute.create({
      data: {
        schoolId: school.id,
        routeName: r.name,
        routeNumber: r.num,
        academicYear: TRANSPORT_ACADEMIC_YEAR,
        feeMonths: JSON.stringify(TRANSPORT_FEE_MONTHS),
        startPoint: r.startPoint,
        endPoint: r.endPoint,
        distance: r.distance,
        stops: JSON.stringify(r.stops),
        fee: r.baseFare,
        driverName: r.driverName,
        driverPhone: r.driverPhone,
        vehicleNumber: r.vehicleNumber,
        isActive: true,
      },
    })
    // Per-stop fares: base for nearest, ascending by increment for each further stop
    for (let i = 0; i < r.stops.length; i++) {
      await db.transportStopFare.create({
        data: {
          schoolId: school.id,
          routeId: route.id,
          academicYear: TRANSPORT_ACADEMIC_YEAR,
          stopName: r.stops[i],
          fare: r.baseFare + i * r.fareIncrement,
          feeMonths: JSON.stringify(TRANSPORT_FEE_MONTHS),
          isActive: true,
        },
      })
      stopFaresCreated++
    }
  }
  console.log(`✅ Created ${transportRouteDefs.length} transport routes with ${stopFaresCreated} stop fares`)

  // Hostels — mirror of transport (Hostel -> Room -> Bed + per-year room fare).
  // "Hostel Fee" is intentionally NOT a FeesHead — hostel billing is monthly
  // FeeCollection rows tagged sourceType='hostel' in the ledger.
  const HOSTEL_FEE_MONTHS = TRANSPORT_FEE_MONTHS
  const HOSTEL_ACADEMIC_YEAR = TRANSPORT_ACADEMIC_YEAR
  const hostelDefs = [
    {
      name: 'Boys Hostel A', type: 'boys', wardenName: 'Mr. Ramesh Gupta', wardenPhone: '+91-9912346001',
      rooms: [
        { roomNumber: '101', roomType: 'AC 2-seater', floor: '1', beds: 2, fare: 4500 },
        { roomNumber: '102', roomType: 'Non-AC 4-seater', floor: '1', beds: 4, fare: 3000 },
        { roomNumber: '201', roomType: 'AC 2-seater', floor: '2', beds: 2, fare: 4500 },
      ],
    },
    {
      name: 'Girls Hostel B', type: 'girls', wardenName: 'Mrs. Sunita Verma', wardenPhone: '+91-9912346002',
      rooms: [
        { roomNumber: 'G-01', roomType: 'AC 3-seater', floor: '1', beds: 3, fare: 4000 },
        { roomNumber: 'G-02', roomType: 'Non-AC 4-seater', floor: '1', beds: 4, fare: 3000 },
      ],
    },
  ]
  let hostelRoomsCreated = 0
  let hostelBedsCreated = 0
  for (const h of hostelDefs) {
    const hostel = await db.hostel.create({
      data: {
        schoolId: school.id,
        name: h.name,
        type: h.type,
        academicYear: HOSTEL_ACADEMIC_YEAR,
        feeMonths: JSON.stringify(HOSTEL_FEE_MONTHS),
        wardenName: h.wardenName,
        wardenPhone: h.wardenPhone,
        isActive: true,
      },
    })
    for (const r of h.rooms) {
      const room = await db.hostelRoom.create({
        data: {
          schoolId: school.id,
          hostelId: hostel.id,
          roomNumber: r.roomNumber,
          roomType: r.roomType,
          floor: r.floor,
          capacity: r.beds,
          isActive: true,
        },
      })
      hostelRoomsCreated++
      for (let b = 1; b <= r.beds; b++) {
        await db.hostelBed.create({
          data: {
            schoolId: school.id,
            hostelId: hostel.id,
            roomId: room.id,
            bedNumber: `${r.roomNumber}-${b}`,
            isActive: true,
          },
        })
        hostelBedsCreated++
      }
      await db.hostelRoomFare.create({
        data: {
          schoolId: school.id,
          hostelId: hostel.id,
          roomId: room.id,
          academicYear: HOSTEL_ACADEMIC_YEAR,
          fare: r.fare,
          feeMonths: JSON.stringify(HOSTEL_FEE_MONTHS),
          isActive: true,
        },
      })
    }
  }
  console.log(`✅ Created ${hostelDefs.length} hostels with ${hostelRoomsCreated} rooms and ${hostelBedsCreated} beds`)

  // Library books
  for (const b of [{ title: 'Mathematics for Class X', author: 'R.D. Sharma', cat: 'Mathematics' }, { title: 'Concepts of Physics', author: 'H.C. Verma', cat: 'Physics' }, { title: 'Modern ABC Chemistry', author: 'S.P. Jauhar', cat: 'Chemistry' }, { title: 'NCERT Biology XII', author: 'NCERT', cat: 'Biology' }, { title: 'Wren & Martin Grammar', author: 'P.C. Wren', cat: 'English' }, { title: 'Python Programming', author: 'Sumita Arora', cat: 'Computer Science' }]) {
    await db.libraryBook.create({ data: { schoolId: school.id, title: b.title, author: b.author, category: b.cat, quantity: 10, available: 8, shelfNumber: 'S1', price: 350, isActive: true } })
  }
  console.log('✅ Created library books')

  // Inventory — structured categories + items with dynamic variants (sizes/classes).
  const invCategoryDefs = ['Furniture', 'Electronics', 'Stationery', 'Uniform', 'Books']
  const invCategories = new Map<string, string>()
  for (const name of invCategoryDefs) {
    const cat = await db.inventoryCategory.create({ data: { schoolId: school.id, name, isActive: true }, select: { id: true } })
    invCategories.set(name, cat.id)
  }

  // Each item carries 1..N variants; a null variantLabel means a plain item with
  // a single default variant (label null).
  interface SeedVariant { label: string | null; qty: number; cost: number | null; sell: number | null; reorder: number }
  interface SeedItem { name: string; cat: string; variantLabel: string | null; sellable: boolean; variants: SeedVariant[] }
  const invItemDefs: SeedItem[] = [
    { name: 'Whiteboard', cat: 'Furniture', variantLabel: null, sellable: false, variants: [{ label: null, qty: 30, cost: 3500, sell: null, reorder: 5 }] },
    { name: 'Desktop Computer', cat: 'Electronics', variantLabel: null, sellable: false, variants: [{ label: null, qty: 25, cost: 35000, sell: null, reorder: 5 }] },
    { name: 'Notebook (200 pages)', cat: 'Stationery', variantLabel: null, sellable: true, variants: [{ label: null, qty: 400, cost: 35, sell: 60, reorder: 50 }] },
    { name: 'School Tie', cat: 'Uniform', variantLabel: null, sellable: true, variants: [{ label: null, qty: 120, cost: 60, sell: 110, reorder: 20 }] },
    {
      name: 'School Shirt', cat: 'Uniform', variantLabel: 'Size', sellable: true, variants: [
        { label: '24', qty: 40, cost: 180, sell: 250, reorder: 10 },
        { label: '26', qty: 35, cost: 190, sell: 260, reorder: 10 },
        { label: '28', qty: 20, cost: 200, sell: 280, reorder: 10 },
        { label: '30', qty: 8, cost: 210, sell: 300, reorder: 10 },
      ],
    },
    {
      name: 'School Trousers', cat: 'Uniform', variantLabel: 'Size', sellable: true, variants: [
        { label: '24', qty: 30, cost: 220, sell: 320, reorder: 8 },
        { label: '26', qty: 28, cost: 230, sell: 330, reorder: 8 },
        { label: '28', qty: 15, cost: 240, sell: 350, reorder: 8 },
      ],
    },
    {
      name: 'Book Set', cat: 'Books', variantLabel: 'Class', sellable: true, variants: [
        { label: 'I', qty: 50, cost: 600, sell: 850, reorder: 10 },
        { label: 'II', qty: 45, cost: 650, sell: 900, reorder: 10 },
        { label: 'III', qty: 40, cost: 700, sell: 980, reorder: 10 },
        { label: 'IV', qty: 12, cost: 750, sell: 1050, reorder: 10 },
      ],
    },
  ]
  let invVariantCount = 0
  for (const item of invItemDefs) {
    const created = await db.inventoryItem.create({
      data: {
        schoolId: school.id,
        name: item.name,
        category: item.cat,
        categoryId: invCategories.get(item.cat),
        unit: 'pcs',
        variantLabel: item.variantLabel,
        isSellable: item.sellable,
        condition: 'Good',
        location: 'Store Room',
        isActive: true,
      },
      select: { id: true },
    })
    for (let i = 0; i < item.variants.length; i++) {
      const v = item.variants[i]
      const variant = await db.inventoryItemVariant.create({
        data: {
          schoolId: school.id, itemId: created.id, label: v.label, quantity: v.qty,
          reorderLevel: v.reorder, unitPrice: v.cost, sellingPrice: v.sell, sortOrder: i, isActive: true,
        },
        select: { id: true },
      })
      if (v.qty > 0) {
        await db.inventoryStockMovement.create({
          data: {
            schoolId: school.id, itemId: created.id, variantId: variant.id, type: 'IN',
            quantity: v.qty, balanceAfter: v.qty, unitCost: v.cost, reason: 'Opening stock', referenceType: 'purchase',
          },
        })
      }
      invVariantCount++
    }
  }
  console.log(`✅ Created ${invItemDefs.length} inventory items (${invVariantCount} variants), ${invCategoryDefs.length} categories`)

  // Notifications
  await Promise.all([
    db.notification.create({ data: { schoolId: school.id, title: 'Fee Payment Due', message: 'Tuition fee for March is due by 10th.', type: 'fee' } }),
    db.notification.create({ data: { schoolId: school.id, title: 'Annual Day', message: 'Annual Day on 25th March.', type: 'info' } }),
    db.notification.create({ data: { schoolId: school.id, title: 'PTM Scheduled', message: 'PTM on 15th March.', type: 'alert' } }),
  ])

  // Announcements
  const announcements = [
    { title: 'Welcome to Academic Year 2026-2027', content: 'Wishing all students, parents and staff a successful new session. Classes begin from 1st April 2026.', audience: 'all', priority: 'normal' },
    { title: 'Mid-term Examinations Schedule', content: 'Mid-term exams will be conducted from 1st-10th September 2026. Detailed timetable will be shared with class teachers.', audience: 'students', priority: 'high' },
    { title: 'Annual Day on 15th February 2027', content: 'Annual Day celebrations will be held on 15th February 2027 at the school auditorium. All families are invited.', audience: 'all', priority: 'normal' },
  ]
  for (const a of announcements) {
    await db.announcement.create({ data: { schoolId: school.id, title: a.title, content: a.content, audience: a.audience, priority: a.priority, isActive: true } })
  }
  console.log(`✅ Created ${announcements.length} announcements`)

  // Support tickets
  await db.supportTicket.create({ data: { schoolId: school.id, userId: schoolAdmin.id, subject: 'Cannot generate fee receipt', description: 'Fee receipt failing for some students.', category: 'technical', priority: 'high', status: 'open' } })

  // Parent & Student users
  // Create a proper parent user with phone number for phone-based login
  const parentUser = await db.user.create({ data: { email: '9876543201@parent.local', password: await hashPassword('parent123'), name: 'Suresh Sharma', phone: '9876543201', role: 'PARENT', schoolId: school.id, isActive: true } })
  await db.user.create({ data: { email: 'student@example.com', password: await hashPassword('student123'), name: 'Aarav Sharma', role: 'STUDENT', schoolId: school.id, isActive: true } })

  // Create one Parent record linked to the parent user
  const parentRecord = await db.parent.create({
    data: {
      schoolId: school.id,
      userId: parentUser.id,
      fatherName: 'Suresh Sharma',
      motherName: 'Meena Sharma',
      phone: '9876543201',
      alternatePhone: '9876543202',
      email: 'suresh@example.com',
      occupation: 'Business',
      address: 'Mathura Road, New Delhi',
    }
  })

  // ============================================
  // RBAC: Permission Catalog, Roles, RolePermissions, SchoolPermissions, UserRoles
  // ============================================

  // Permission catalog — matches PERMISSIONS constant in use-permissions.ts
  const permissionDefs = [
    // Students
    { code: 'student:read', name: 'View Students', module: 'students', action: 'read' },
    { code: 'student:create', name: 'Create Student', module: 'students', action: 'create' },
    { code: 'student:update', name: 'Update Student', module: 'students', action: 'update' },
    { code: 'student:delete', name: 'Delete Student', module: 'students', action: 'delete' },
    { code: 'student:enable_disable', name: 'Enable/Disable Student', module: 'students', action: 'update' },
    { code: 'student:withdraw', name: 'Issue TC / Withdraw Student', module: 'students', action: 'update' },
    { code: 'student:withdraw:reverse', name: 'Reverse Student Withdrawal', module: 'students', action: 'update' },
    // Admissions
    { code: 'admission:read', name: 'View Admissions', module: 'admissions', action: 'read' },
    { code: 'admission:create', name: 'Create Admission', module: 'admissions', action: 'create' },
    { code: 'admission:update', name: 'Update Admission', module: 'admissions', action: 'update' },
    { code: 'admission:approve', name: 'Approve Admission', module: 'admissions', action: 'update' },
    { code: 'admission:delete', name: 'Delete Admission', module: 'admissions', action: 'delete' },
    // Teachers
    { code: 'teacher:read', name: 'View Teachers', module: 'teachers', action: 'read' },
    { code: 'teacher:create', name: 'Create Teacher', module: 'teachers', action: 'create' },
    { code: 'teacher:update', name: 'Update Teacher', module: 'teachers', action: 'update' },
    { code: 'teacher:delete', name: 'Delete Teacher', module: 'teachers', action: 'delete' },
    // Parents
    { code: 'parent:read', name: 'View Parents', module: 'parents', action: 'read' },
    { code: 'parent:create', name: 'Create Parent', module: 'parents', action: 'create' },
    { code: 'parent:update', name: 'Update Parent', module: 'parents', action: 'update' },
    { code: 'parent:delete', name: 'Delete Parent', module: 'parents', action: 'delete' },
    // Attendance
    { code: 'attendance:read', name: 'View Attendance', module: 'attendance', action: 'read' },
    { code: 'attendance:mark', name: 'Mark Attendance', module: 'attendance', action: 'create' },
    { code: 'attendance:update', name: 'Update Attendance', module: 'attendance', action: 'update' },
    { code: 'attendance:reopen', name: 'Reopen Finalized Attendance', module: 'attendance', action: 'update' },
    { code: 'attendance:export', name: 'Export Attendance', module: 'attendance', action: 'read' },
    { code: 'attendance:audit:view', name: 'View Attendance Audit Log', module: 'attendance', action: 'read' },
    { code: 'attendance:report:view', name: 'View Attendance Reports', module: 'attendance', action: 'read' },
    // RFID / NFC card attendance
    { code: 'rfid:cards:manage', name: 'Manage Student RFID Cards', module: 'attendance', action: 'update' },
    { code: 'rfid:cards:read', name: 'View Student RFID Cards', module: 'attendance', action: 'read' },
    { code: 'rfid:devices:manage', name: 'Manage RFID Reader Devices', module: 'attendance', action: 'update' },
    { code: 'rfid:taps:view', name: 'View RFID Tap Logs', module: 'attendance', action: 'read' },
    // Fees
    { code: 'fees:read', name: 'View Fees', module: 'fees', action: 'read' },
    { code: 'fees:create', name: 'Create Fee', module: 'fees', action: 'create' },
    { code: 'fees:update', name: 'Update Fee', module: 'fees', action: 'update' },
    { code: 'fees:collect', name: 'Collect Fees', module: 'fees', action: 'create' },
    { code: 'fees:refund', name: 'Refund Fees', module: 'fees', action: 'update' },
    { code: 'fees:delete', name: 'Delete Fee', module: 'fees', action: 'delete' },
    { code: 'fees:change-group', name: 'Change Fee Group', module: 'fees', action: 'update' },
    { code: 'fees:audit', name: 'View Fee Audit Trail', module: 'fees', action: 'read' },
    // Salary
    { code: 'salary:read', name: 'View Salary', module: 'salary', action: 'read' },
    { code: 'salary:create', name: 'Create Salary', module: 'salary', action: 'create' },
    { code: 'salary:update', name: 'Update Salary', module: 'salary', action: 'update' },
    { code: 'salary:pay', name: 'Pay Salary', module: 'salary', action: 'create' },
    { code: 'salary:advance', name: 'Advance Salary', module: 'salary', action: 'create' },
    { code: 'salary:delete', name: 'Delete Salary', module: 'salary', action: 'delete' },
    // Timetable
    { code: 'timetable:read', name: 'View Timetable', module: 'timetable', action: 'read' },
    { code: 'timetable:create', name: 'Create Timetable', module: 'timetable', action: 'create' },
    { code: 'timetable:update', name: 'Update Timetable', module: 'timetable', action: 'update' },
    { code: 'timetable:delete', name: 'Delete Timetable', module: 'timetable', action: 'delete' },
    // Exams
    { code: 'exam:view', name: 'View Exams', module: 'exams', action: 'read' },
    { code: 'exam:manage', name: 'Manage Exams', module: 'exams', action: 'update' },
    { code: 'exam:marks', name: 'Enter Marks', module: 'exams', action: 'update' },
    { code: 'exam:results', name: 'View & Compute Results', module: 'exams', action: 'read' },
    { code: 'exam:publish', name: 'Publish Results', module: 'exams', action: 'update' },
    { code: 'exam:audit', name: 'View Exam Audit', module: 'exams', action: 'read' },
    // Transport
    { code: 'transport:read', name: 'View Transport', module: 'transport', action: 'read' },
    { code: 'transport:create', name: 'Create Transport', module: 'transport', action: 'create' },
    { code: 'transport:update', name: 'Update Transport', module: 'transport', action: 'update' },
    { code: 'transport:allocation:update', name: 'Modify Student Transport Allocation', module: 'transport', action: 'update' },
    { code: 'transport:delete', name: 'Delete Transport', module: 'transport', action: 'delete' },
    { code: 'transport:annual-setup', name: 'Annual Transport Setup', module: 'transport', action: 'update' },
    // Hostel
    { code: 'hostel:read', name: 'View Hostel', module: 'hostel', action: 'read' },
    { code: 'hostel:create', name: 'Create Hostel', module: 'hostel', action: 'create' },
    { code: 'hostel:update', name: 'Update Hostel', module: 'hostel', action: 'update' },
    { code: 'hostel:allocation:update', name: 'Modify Student Hostel Allocation', module: 'hostel', action: 'update' },
    { code: 'hostel:delete', name: 'Delete Hostel', module: 'hostel', action: 'delete' },
    { code: 'hostel:annual-setup', name: 'Annual Hostel Setup', module: 'hostel', action: 'update' },
    // Library
    { code: 'library:read', name: 'View Library', module: 'library', action: 'read' },
    { code: 'library:create', name: 'Create Book', module: 'library', action: 'create' },
    { code: 'library:update', name: 'Update Book', module: 'library', action: 'update' },
    { code: 'library:issue', name: 'Issue/Return Book', module: 'library', action: 'create' },
    { code: 'library:delete', name: 'Delete Book', module: 'library', action: 'delete' },
    // Inventory
    { code: 'inventory:read', name: 'View Inventory', module: 'inventory', action: 'read' },
    { code: 'inventory:create', name: 'Create Item', module: 'inventory', action: 'create' },
    { code: 'inventory:update', name: 'Update Item', module: 'inventory', action: 'update' },
    { code: 'inventory:delete', name: 'Delete Item', module: 'inventory', action: 'delete' },
    { code: 'inventory:sell', name: 'Sell Inventory to Students', module: 'inventory', action: 'create' },
    // Notifications
    { code: 'notification:read', name: 'View Notifications', module: 'notifications', action: 'read' },
    { code: 'notification:create', name: 'Create Notification', module: 'notifications', action: 'create' },
    { code: 'notification:delete', name: 'Delete Notification', module: 'notifications', action: 'delete' },
    { code: 'notification:send', name: 'Send Bulk Notifications', module: 'notifications', action: 'create' },
    { code: 'notification:manage', name: 'Manage Notifications', module: 'notifications', action: 'update' },
    { code: 'notification:retry', name: 'Retry Failed Notifications', module: 'notifications', action: 'update' },
    { code: 'notification:template:manage', name: 'Manage Notification Templates', module: 'notifications', action: 'update' },
    { code: 'notification:preference:manage', name: 'Manage Notification Preferences', module: 'notifications', action: 'update' },
    // Announcements
    { code: 'announcement:read', name: 'View Announcements', module: 'announcements', action: 'read' },
    { code: 'announcement:create', name: 'Create Announcement', module: 'announcements', action: 'create' },
    { code: 'announcement:update', name: 'Update Announcement', module: 'announcements', action: 'update' },
    { code: 'announcement:delete', name: 'Delete Announcement', module: 'announcements', action: 'delete' },
    { code: 'announcement:publish', name: 'Publish Announcement', module: 'announcements', action: 'create' },
    { code: 'announcement:schedule', name: 'Schedule Announcement', module: 'announcements', action: 'update' },
    { code: 'announcement:view_analytics', name: 'View Announcement Analytics', module: 'announcements', action: 'read' },
    // Classes
    { code: 'class:read', name: 'View Classes', module: 'classes', action: 'read' },
    { code: 'class:create', name: 'Create Class', module: 'classes', action: 'create' },
    { code: 'class:update', name: 'Update Class', module: 'classes', action: 'update' },
    { code: 'class:delete', name: 'Delete Class', module: 'classes', action: 'delete' },
    // Subjects
    { code: 'subject:read', name: 'View Subjects', module: 'subjects', action: 'read' },
    { code: 'subject:create', name: 'Create Subject', module: 'subjects', action: 'create' },
    { code: 'subject:update', name: 'Update Subject', module: 'subjects', action: 'update' },
    { code: 'subject:delete', name: 'Delete Subject', module: 'subjects', action: 'delete' },
    // Settings
    { code: 'settings:read', name: 'View Settings', module: 'settings', action: 'read' },
    { code: 'settings:update', name: 'Update Settings', module: 'settings', action: 'update' },

    { code: 'holiday:read', name: 'View Academic Calendar', module: 'holidays', action: 'read' },
    { code: 'holiday:manage', name: 'Manage Academic Calendar', module: 'holidays', action: 'update' },
    // Student ID Cards
    { code: 'idcard:read', name: 'View ID Card Module', module: 'idcards', action: 'read' },
    { code: 'idcard:template:create', name: 'Create ID Card Template', module: 'idcards', action: 'create' },
    { code: 'idcard:template:update', name: 'Edit ID Card Template', module: 'idcards', action: 'update' },
    { code: 'idcard:template:delete', name: 'Delete ID Card Template', module: 'idcards', action: 'delete' },
    { code: 'idcard:generate', name: 'Generate Student ID Cards', module: 'idcards', action: 'create' },
    { code: 'idcard:print', name: 'Print / Download ID Cards', module: 'idcards', action: 'read' },
    // Roles & Permissions
    { code: 'role:read', name: 'View Roles', module: 'roles', action: 'read' },
    { code: 'role:create', name: 'Create Role', module: 'roles', action: 'create' },
    { code: 'role:update', name: 'Update Role', module: 'roles', action: 'update' },
    { code: 'role:delete', name: 'Delete Role', module: 'roles', action: 'delete' },
    { code: 'permission:assign', name: 'Assign Permissions', module: 'roles', action: 'update' },
  ]

  const permissionRecords = await Promise.all(
    permissionDefs.map(p => db.permission.create({ data: p }))
  )
  console.log(`✅ Created ${permissionRecords.length} permissions`)

  // Build a lookup map: code → record id
  const permMap = new Map<string, string>()
  for (const p of permissionRecords) {
    permMap.set(p.code, p.id)
  }

  // Create default roles for each school
  const allSchools = [school]

  // Define role templates with their permission codes
  const roleTemplates = [
    {
      name: 'School Admin',
      description: 'Full access to all school modules',
      color: '#3b82f6',
      isSystem: true,
      permissionCodes: permissionDefs.map(p => p.code), // All permissions
    },
    {
      name: 'Teacher',
      description: 'Access to attendance, timetable, exams, library, salary',
      color: '#10b981',
      isSystem: true,
      permissionCodes: [
        'student:read', 'attendance:read', 'attendance:mark', 'attendance:update',
        'timetable:read',
        'exam:view', 'exam:marks',
        'library:read', 'salary:read', 'notification:read',
        'class:read', 'subject:read', 'holiday:read',
      ],
    },
    {
      name: 'Student',
      description: 'Access to own attendance, fees, timetable, exam results, library',
      color: '#f59e0b',
      isSystem: true,
      permissionCodes: [
        'attendance:read', 'fees:read', 'timetable:read',
        'exam:view', 'library:read', 'notification:read', 'holiday:read',
      ],
    },
    {
      name: 'Parent',
      description: 'Access to children attendance, fees, notifications, exams',
      color: '#8b5cf6',
      isSystem: true,
      permissionCodes: [
        'student:read', 'attendance:read', 'fees:read',
        'notification:read', 'exam:view', 'holiday:read',
      ],
    },
    {
      name: 'Staff',
      description: 'Limited access for office staff',
      color: '#6b7280',
      isSystem: true,
      permissionCodes: [
        'student:read', 'attendance:read', 'attendance:mark',
        'fees:read', 'fees:collect', 'fees:refund', 'salary:read',
        'transport:read', 'library:read', 'inventory:read',
        'notification:read', 'announcement:read',
      ],
    },
    {
      name: 'Transport',
      description: 'Driver / transport staff — view assigned route and student manifests',
      color: '#0ea5e9',
      isSystem: true,
      permissionCodes: [
        'transport:read', 'student:read', 'attendance:read', 'notification:read',
      ],
    },
    {
      name: 'Hostel',
      description: 'Warden / hostel staff — manage hostels, rooms, beds, and allocations',
      color: '#0284c7',
      isSystem: true,
      permissionCodes: [
        'hostel:read', 'hostel:create', 'hostel:update', 'hostel:allocation:update',
        'student:read', 'notification:read',
      ],
    },
  ]

  // Create roles for each school
  for (const sch of allSchools) {
    for (const template of roleTemplates) {
      const role = await db.role.create({
        data: {
          schoolId: sch.id,
          name: template.name,
          description: template.description,
          color: template.color,
          isSystem: template.isSystem,
        },
      })

      // Create RolePermissions
      for (const code of template.permissionCodes) {
        const permId = permMap.get(code)
        if (permId) {
          await db.rolePermission.create({
            data: { roleId: role.id, permissionId: permId },
          })
        }
      }
    }
  }
  console.log(`✅ Created ${roleTemplates.length * allSchools.length} roles with permissions`)

  // Grant all permissions to each demo school via SchoolPermission
  for (const sch of allSchools) {
    for (const p of permissionRecords) {
      await db.schoolPermission.create({
        data: {
          schoolId: sch.id,
          permissionId: p.id,
          grantedBy: superAdmin.id,
        },
      })
    }
  }
  console.log(`✅ Created school permissions for ${allSchools.length} schools`)

  // Assign UserRoles — link users to their school's default role
  const schoolAdminRole = await db.role.findFirst({ where: { schoolId: school.id, name: 'School Admin' } })
  const teacherRole = await db.role.findFirst({ where: { schoolId: school.id, name: 'Teacher' } })
  const studentRole = await db.role.findFirst({ where: { schoolId: school.id, name: 'Student' } })
  const parentRole = await db.role.findFirst({ where: { schoolId: school.id, name: 'Parent' } })

  if (schoolAdminRole) {
    await db.userRole.create({ data: { userId: schoolAdmin.id, roleId: schoolAdminRole.id, assignedBy: superAdmin.id } })
  }

  // Assign teacher role to teacher users
  const teacherUsers = await db.user.findMany({ where: { role: 'TEACHER', schoolId: school.id } })
  if (teacherRole) {
    for (const tu of teacherUsers) {
      await db.userRole.create({ data: { userId: tu.id, roleId: teacherRole.id, assignedBy: schoolAdmin.id } })
    }
  }

  // Assign student role to student user
  const studentUser = await db.user.findFirst({ where: { email: 'student@example.com' } })
  if (studentUser && studentRole) {
    await db.userRole.create({ data: { userId: studentUser.id, roleId: studentRole.id, assignedBy: schoolAdmin.id } })
  }

  // Assign parent role to parent user
  if (parentRole) {
    await db.userRole.create({ data: { userId: parentUser.id, roleId: parentRole.id, assignedBy: schoolAdmin.id } })
  }
  console.log('✅ Assigned user roles')

  // Demo testimonials for the landing page
  const demoTestimonials = [
    { name: 'Rajesh Kumar', role: 'Principal, DPS Delhi', quote: 'Vidhyalayam has transformed how we manage our school. Attendance and fees are no longer headaches.', stars: 5, sortOrder: 1 },
    { name: 'Priya Sharma', role: "Administrator, St. Mary's School", quote: 'The parent communication features have brought our school community closer than ever.', stars: 5, sortOrder: 2 },
    { name: 'Dr. Ahmed Khan', role: 'Director, Sunrise Academy', quote: 'From admissions to exams, everything is streamlined. Our teachers now focus on teaching, not paperwork.', stars: 5, sortOrder: 3 },
    { name: 'Sunita Verma', role: 'Vice Principal, KV Delhi', quote: 'We switched from three different tools to just Vidhyalayam. The all-in-one platform saved us time and money.', stars: 5, sortOrder: 4 },
    { name: 'Arun Reddy', role: 'Accounts Manager, Green Valley School', quote: 'The fee management module alone has reduced our collection time by 70%. Parents love the online payment option.', stars: 5, sortOrder: 5 },
    { name: 'Meena Joshi', role: 'Parent, DPS Delhi', quote: 'Real-time attendance tracking gives me peace of mind. I know my child is safe the moment they swipe in.', stars: 4, sortOrder: 6 },
    { name: 'Vikram Patel', role: 'Academic Coordinator, Ryan International', quote: 'The timetable generator is a lifesaver. What used to take us a week now takes just a few clicks.', stars: 5, sortOrder: 7 },
    { name: 'Kavita Joshi', role: "Head Teacher, St. Mary's School", quote: 'Exam result preparation used to be a nightmare. Now it takes minutes, not days. The report cards look professional too.', stars: 5, sortOrder: 8 },
    { name: 'Mohan Kumar', role: 'Senior Teacher, DPS Delhi', quote: 'As a teacher, I appreciate how easy it is to mark attendance and upload assignments. The interface is very intuitive.', stars: 4, sortOrder: 9 },
    { name: 'Ramesh Gupta', role: 'Librarian, Kendriya Vidyalaya', quote: 'The library management system helped us track every book. We recovered over 200 lost books in the first month!', stars: 5, sortOrder: 10 },
    { name: 'Sanjay Mishra', role: 'Transport Head, DPS Delhi', quote: 'Transport tracking with GPS gives parents confidence. Complaints about bus delays have dropped to zero.', stars: 4, sortOrder: 11 },
    { name: 'Anita Desai', role: 'Principal, Lotus Valley School', quote: 'The support team is incredibly responsive. Any issue we face is resolved within hours, not days.', stars: 5, sortOrder: 12 },
  ]

  await Promise.all(demoTestimonials.map(t => db.testimonial.create({ data: t })))
  console.log(`✅ Created ${demoTestimonials.length} testimonials`)

  console.log('\n🎉 Seeding complete!')
  console.log('\n📋 Login Credentials:')
  console.log('  Super Admin:  sahyog.vidhyalayam@gmail.com / admin123')
  console.log('  School Admin: admin@dpsdelhi.in / admin123')
  console.log('  Teacher:      anita.sharma@dpsdelhi.in / teacher123')
  console.log('  Student:      student@example.com / student123')
  console.log('  Parent:       9876543201 / parent123')
}

seed().catch(console.error).finally(() => db.$disconnect())
