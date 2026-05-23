import { db } from '../../src/lib/db'
import { hashPassword } from '../../src/lib/auth'

async function seed() {
  const existingSuperAdmin = await db.user.findUnique({
    where: { email: 'superadmin@schoolerp.com' },
  })

  if (existingSuperAdmin) {
    console.log('Core demo data already exists, skipping.')
    return
  }

  console.log('🌱 Seeding database...')

  // Create super admin
  const superAdmin = await db.user.create({
    data: { email: 'superadmin@schoolerp.com', password: await hashPassword('admin123'), name: 'Super Admin', phone: '+91-9999999999', role: 'SUPER_ADMIN', isActive: true },
  })
  console.log('✅ Created super admin')

  // Create demo school
  const school = await db.school.create({
    data: {
      name: 'Delhi Public School', address: 'Mathura Road, New Delhi', city: 'New Delhi', state: 'Delhi', pincode: '110003', country: 'India',
      contactPhone: '+91-11-24362489', contactEmail: 'info@dpsdelhi.in', website: 'https://dpsdelhi.in',
      academicYear: '2025-2026', board: 'CBSE', timezone: 'Asia/Kolkata', currency: 'INR',
      subdomain: 'dps-delhi', status: 'active', onboardingDate: new Date('2024-04-01'), primaryColor: '#8c8f97',
    },
  })
  const school2 = await db.school.create({
    data: {
      name: "St. Mary's Convent School", address: 'MG Road, Bangalore', city: 'Bangalore', state: 'Karnataka', pincode: '560001', country: 'India',
      contactPhone: '+91-80-25581234', contactEmail: 'info@stmarysblr.in', academicYear: '2025-2026', board: 'ICSE', timezone: 'Asia/Kolkata', currency: 'INR',
      subdomain: 'st-marys-blr', status: 'trial', trialEndsAt: new Date('2025-08-01'), onboardingDate: new Date('2025-06-01'),
    },
  })
  const school3 = await db.school.create({
    data: {
      name: 'Kendriya Vidyalaya', address: 'JNU Campus, New Delhi', city: 'New Delhi', state: 'Delhi', pincode: '110067', country: 'India',
      contactPhone: '+91-11-26741234', contactEmail: 'info@kvdelhi.in', academicYear: '2025-2026', board: 'CBSE', timezone: 'Asia/Kolkata', currency: 'INR',
      subdomain: 'kv-delhi', status: 'active', onboardingDate: new Date('2024-07-01'),
    },
  })
  console.log('✅ Created 3 demo schools')

  // Academic Year — one current session per school
  const allSchoolsForYear = [school, school2, school3]
  for (const sch of allSchoolsForYear) {
    await db.academicYear.create({
      data: {
        schoolId: sch.id,
        name: '2025-2026',
        startDate: new Date('2025-04-01'),
        endDate: new Date('2026-03-31'),
        isCurrent: true,
        isActive: true,
      },
    })
  }
  console.log('✅ Created academic year 2025-2026 (current) for all schools')

  // School admin
  const schoolAdmin = await db.user.create({
    data: { email: 'admin@dpsdelhi.in', password: await hashPassword('admin123'), name: 'Rajesh Kumar', phone: '+91-9876543210', role: 'SCHOOL_ADMIN', schoolId: school.id, isActive: true },
  })

  // Admission settings — one per school, scoped to current year
  for (const sch of allSchoolsForYear) {
    await db.admissionSetting.create({
      data: {
        schoolId: sch.id,
        academicYear: '2025-2026',
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
      sections.push(await db.section.create({ data: { schoolId: school.id, classId: cls.id, name: s, capacity: 40 } }))
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
    await db.salaryStructure.create({ data: { schoolId: school.id, teacherId: teacher.id, basicSalary: basic, hra, da, ta, medicalAllowance: medical, specialAllowance: special, pf, esi, grossSalary: gross, netSalary: net, effectiveFrom: new Date('2025-04-01') } })
  }
  console.log(`✅ Created ${teachers.length} teachers with salary structures`)

  // Fee Heads
  const feeHeads = await Promise.all([
    db.feesHead.create({ data: { schoolId: school.id, name: 'Tuition Fee', frequency: 'MONTHLY' } }),
    db.feesHead.create({ data: { schoolId: school.id, name: 'Admission Fee', frequency: 'ONE_TIME' } }),
    db.feesHead.create({ data: { schoolId: school.id, name: 'Annual Fee', frequency: 'YEARLY' } }),
    db.feesHead.create({ data: { schoolId: school.id, name: 'Transport Fee', frequency: 'MONTHLY' } }),
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

  const tuitionFee = feeHeads[0]; const admissionFee = feeHeads[1]; const annualFee = feeHeads[2]; const transportFee = feeHeads[3]; const examFee = feeHeads[4]

  // Group → fee heads (same items across all four groups; pricing differs at structure level)
  for (const grp of feeGroups) {
    await Promise.all([
      db.feesGroupItem.create({ data: { groupId: grp.id, feeHeadId: tuitionFee.id } }),
      db.feesGroupItem.create({ data: { groupId: grp.id, feeHeadId: admissionFee.id } }),
      db.feesGroupItem.create({ data: { groupId: grp.id, feeHeadId: annualFee.id } }),
      db.feesGroupItem.create({ data: { groupId: grp.id, feeHeadId: transportFee.id } }),
      db.feesGroupItem.create({ data: { groupId: grp.id, feeHeadId: examFee.id } }),
    ])
  }

  // Fee Structure per (class × group) — sectionId=null so it applies to every section of that class.
  // Indian academic year: Apr 2025 → Mar 2026 monthly tuition; lump-sum admission & annual; quarterly exam fee.
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
          academicYear: '2025-2026',
          name: `${cls.name} • ${def.name}`,
          status: 'active',
          effectiveFrom: new Date('2025-04-01'),
          isActive: true,
        },
      })
      // Monthly tuition + transport (Apr 2025 → Mar 2026). Transport stays uniform across groups.
      for (let m = 0; m < 12; m++) {
        const calMonthIdx = (3 + m) % 12
        const year = calMonthIdx >= 3 ? 2025 : 2026
        await db.feesStructureItem.create({ data: { feeStructureId: fs.id, feeHeadId: tuitionFee.id, installmentName: monthsByCalendarIdx[calMonthIdx], amount: tuition, dueDate: new Date(year, calMonthIdx, 10), lateFee: tuition > 0 ? 100 : 0, frequency: 'MONTHLY' } })
        await db.feesStructureItem.create({ data: { feeStructureId: fs.id, feeHeadId: transportFee.id, installmentName: monthsByCalendarIdx[calMonthIdx], amount: 1500, dueDate: new Date(year, calMonthIdx, 10), lateFee: 50, frequency: 'MONTHLY' } })
      }
      await db.feesStructureItem.create({ data: { feeStructureId: fs.id, feeHeadId: admissionFee.id, installmentName: 'Admission', amount: admissionAmt, dueDate: new Date(2025, 3, 15), lateFee: 0, frequency: 'ONE_TIME' } })
      await db.feesStructureItem.create({ data: { feeStructureId: fs.id, feeHeadId: annualFee.id, installmentName: 'Annual', amount: annualAmt, dueDate: new Date(2025, 3, 15), lateFee: annualAmt > 0 ? 500 : 0, frequency: 'YEARLY' } })
      const quarterly: Array<[string, number, number]> = [
        ['Q1 (Apr-Jun)', 3, 2025],
        ['Q2 (Jul-Sep)', 6, 2025],
        ['Q3 (Oct-Dec)', 9, 2025],
        ['Q4 (Jan-Mar)', 0, 2026],
      ]
      for (const [name, monthIdx, year] of quarterly) {
        await db.feesStructureItem.create({ data: { feeStructureId: fs.id, feeHeadId: examFee.id, installmentName: name, amount: 500, dueDate: new Date(year, monthIdx, 15), lateFee: 0, frequency: 'QUARTERLY' } })
      }
      structuresCreated++
    }
  }
  console.log(`✅ Created ${structuresCreated} fee structures across ${classes.length} classes × ${feeGroups.length} groups`)

  // Transport routes
  for (const r of [{ name: 'Central Delhi', num: 'R1', stops: ['Connaught Place', 'Rajiv Chowk', 'Patel Chowk'], fee: 1500 }, { name: 'South Delhi', num: 'R2', stops: ['Hauz Khas', 'Green Park', 'Saket'], fee: 1800 }, { name: 'North Delhi', num: 'R3', stops: ['Civil Lines', 'DU', 'Kashmere Gate'], fee: 1500 }]) {
    await db.transportRoute.create({ data: { schoolId: school.id, routeName: r.name, routeNumber: r.num, stops: JSON.stringify(r.stops), fee: r.fee, driverName: `Driver ${r.num}`, driverPhone: '+91-9912345678', vehicleNumber: `DL01AB1234`, isActive: true } })
  }
  console.log('✅ Created transport routes')

  // Library books
  for (const b of [{ title: 'Mathematics for Class X', author: 'R.D. Sharma', cat: 'Mathematics' }, { title: 'Concepts of Physics', author: 'H.C. Verma', cat: 'Physics' }, { title: 'Modern ABC Chemistry', author: 'S.P. Jauhar', cat: 'Chemistry' }, { title: 'NCERT Biology XII', author: 'NCERT', cat: 'Biology' }, { title: 'Wren & Martin Grammar', author: 'P.C. Wren', cat: 'English' }, { title: 'Python Programming', author: 'Sumita Arora', cat: 'Computer Science' }]) {
    await db.libraryBook.create({ data: { schoolId: school.id, title: b.title, author: b.author, category: b.cat, quantity: 10, available: 8, shelfNumber: 'S1', price: 350, isActive: true } })
  }
  console.log('✅ Created library books')

  // Inventory
  for (const item of [{ name: 'Whiteboard', cat: 'Furniture', qty: 30, price: 3500 }, { name: 'Student Desk', cat: 'Furniture', qty: 500, price: 2500 }, { name: 'Desktop Computer', cat: 'Electronics', qty: 25, price: 35000 }, { name: 'Projector', cat: 'Electronics', qty: 10, price: 45000 }, { name: 'A4 Paper Bundle', cat: 'Stationery', qty: 200, price: 350 }]) {
    await db.inventoryItem.create({ data: { schoolId: school.id, name: item.name, category: item.cat, quantity: item.qty, unit: 'pcs', unitPrice: item.price, totalPrice: item.qty * item.price, condition: 'Good', location: 'Main Building', isActive: true } })
  }
  console.log('✅ Created inventory items')

  // Notifications
  await Promise.all([
    db.notification.create({ data: { schoolId: school.id, title: 'Fee Payment Due', message: 'Tuition fee for March is due by 10th.', type: 'fee' } }),
    db.notification.create({ data: { schoolId: school.id, title: 'Annual Day', message: 'Annual Day on 25th March.', type: 'info' } }),
    db.notification.create({ data: { schoolId: school.id, title: 'PTM Scheduled', message: 'PTM on 15th March.', type: 'alert' } }),
  ])

  // Announcements
  const announcements = [
    { title: 'Welcome to Academic Year 2025-2026', content: 'Wishing all students, parents and staff a successful new session. Classes begin from 1st April 2025.', audience: 'all', priority: 'normal' },
    { title: 'Mid-term Examinations Schedule', content: 'Mid-term exams will be conducted from 1st-10th September 2025. Detailed timetable will be shared with class teachers.', audience: 'students', priority: 'high' },
    { title: 'Annual Day on 15th February 2026', content: 'Annual Day celebrations will be held on 15th February 2026 at the school auditorium. All families are invited.', audience: 'all', priority: 'normal' },
  ]
  for (const a of announcements) {
    await db.announcement.create({ data: { schoolId: school.id, title: a.title, content: a.content, audience: a.audience, priority: a.priority, isActive: true } })
  }
  console.log(`✅ Created ${announcements.length} announcements`)

  // Petty cash
  const pettyCashEntries = [
    { amount: 500, type: 'debit', category: 'Stationery', description: 'Pens, notebooks, markers for staff room', approvalStatus: 'approved' },
    { amount: 1200, type: 'debit', category: 'Utilities', description: 'Electricity meter recharge', approvalStatus: 'approved' },
    { amount: 800, type: 'debit', category: 'Maintenance', description: 'Plumbing repair in girls washroom', approvalStatus: 'approved' },
    { amount: 350, type: 'debit', category: 'Transport', description: 'Auto fare for sports equipment delivery', approvalStatus: 'pending' },
    { amount: 10000, type: 'credit', category: 'Fee Counter', description: 'Cash deposit from fee counter', approvalStatus: 'approved' },
    { amount: 600, type: 'debit', category: 'Refreshments', description: 'Tea and snacks for staff meeting', approvalStatus: 'approved' },
    { amount: 4500, type: 'debit', category: 'Stationery', description: 'Photocopy paper bulk order', approvalStatus: 'approved' },
    { amount: 300, type: 'debit', category: 'Maintenance', description: 'Whiteboard markers replacement', approvalStatus: 'pending' },
  ]
  for (const e of pettyCashEntries) {
    await db.pettyCashEntry.create({
      data: {
        schoolId: school.id,
        amount: e.amount,
        type: e.type,
        category: e.category,
        description: e.description,
        createdBy: schoolAdmin.id,
        approvalStatus: e.approvalStatus,
        approvedBy: e.approvalStatus === 'approved' ? schoolAdmin.id : null,
        date: new Date(),
      },
    })
  }
  console.log(`✅ Created ${pettyCashEntries.length} petty cash entries`)

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
    { code: 'attendance:export', name: 'Export Attendance', module: 'attendance', action: 'read' },
    // Fees
    { code: 'fees:read', name: 'View Fees', module: 'fees', action: 'read' },
    { code: 'fees:create', name: 'Create Fee', module: 'fees', action: 'create' },
    { code: 'fees:update', name: 'Update Fee', module: 'fees', action: 'update' },
    { code: 'fees:collect', name: 'Collect Fees', module: 'fees', action: 'create' },
    { code: 'fees:refund', name: 'Refund Fees', module: 'fees', action: 'update' },
    { code: 'fees:delete', name: 'Delete Fee', module: 'fees', action: 'delete' },
    { code: 'fees:change-group', name: 'Change Fee Group', module: 'fees', action: 'update' },
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
    { code: 'exam:read', name: 'View Exams', module: 'exams', action: 'read' },
    { code: 'exam:create', name: 'Create Exam', module: 'exams', action: 'create' },
    { code: 'exam:update', name: 'Update Exam', module: 'exams', action: 'update' },
    { code: 'exam:delete', name: 'Delete Exam', module: 'exams', action: 'delete' },
    { code: 'exam:results', name: 'Manage Exam Results', module: 'exams', action: 'update' },
    // Transport
    { code: 'transport:read', name: 'View Transport', module: 'transport', action: 'read' },
    { code: 'transport:create', name: 'Create Transport', module: 'transport', action: 'create' },
    { code: 'transport:update', name: 'Update Transport', module: 'transport', action: 'update' },
    { code: 'transport:delete', name: 'Delete Transport', module: 'transport', action: 'delete' },
    { code: 'transport:annual-setup', name: 'Annual Transport Setup', module: 'transport', action: 'update' },
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
    // Petty Cash
    { code: 'petty_cash:read', name: 'View Petty Cash', module: 'petty_cash', action: 'read' },
    { code: 'petty_cash:create', name: 'Create Entry', module: 'petty_cash', action: 'create' },
    { code: 'petty_cash:approve', name: 'Approve Entry', module: 'petty_cash', action: 'update' },
    { code: 'petty_cash:delete', name: 'Delete Entry', module: 'petty_cash', action: 'delete' },
    // Notifications
    { code: 'notification:read', name: 'View Notifications', module: 'notifications', action: 'read' },
    { code: 'notification:create', name: 'Create Notification', module: 'notifications', action: 'create' },
    { code: 'notification:delete', name: 'Delete Notification', module: 'notifications', action: 'delete' },
    // Announcements
    { code: 'announcement:read', name: 'View Announcements', module: 'announcements', action: 'read' },
    { code: 'announcement:create', name: 'Create Announcement', module: 'announcements', action: 'create' },
    { code: 'announcement:update', name: 'Update Announcement', module: 'announcements', action: 'update' },
    { code: 'announcement:delete', name: 'Delete Announcement', module: 'announcements', action: 'delete' },
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
  const allSchools = [school, school2, school3]

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
        'timetable:read', 'exam:read', 'exam:update', 'exam:results',
        'library:read', 'salary:read', 'notification:read',
        'class:read', 'subject:read',
      ],
    },
    {
      name: 'Student',
      description: 'Access to own attendance, fees, timetable, exam results, library',
      color: '#f59e0b',
      isSystem: true,
      permissionCodes: [
        'attendance:read', 'fees:read', 'timetable:read',
        'exam:read', 'library:read', 'notification:read',
      ],
    },
    {
      name: 'Parent',
      description: 'Access to children attendance, fees, notifications, exams',
      color: '#8b5cf6',
      isSystem: true,
      permissionCodes: [
        'student:read', 'attendance:read', 'fees:read',
        'notification:read', 'exam:read',
      ],
    },
    {
      name: 'Staff',
      description: 'Limited access for office staff',
      color: '#6b7280',
      isSystem: true,
      permissionCodes: [
        'student:read', 'attendance:read', 'attendance:mark',
        'fees:read', 'fees:collect', 'salary:read',
        'transport:read', 'library:read', 'inventory:read',
        'petty_cash:read', 'notification:read', 'announcement:read',
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
    { name: 'Rajesh Kumar', role: 'Principal, DPS Delhi', quote: 'My Digital Academy has transformed how we manage our school. Attendance and fees are no longer headaches.', stars: 5, sortOrder: 1 },
    { name: 'Priya Sharma', role: "Administrator, St. Mary's School", quote: 'The parent communication features have brought our school community closer than ever.', stars: 5, sortOrder: 2 },
    { name: 'Dr. Ahmed Khan', role: 'Director, Sunrise Academy', quote: 'From admissions to exams, everything is streamlined. Our teachers now focus on teaching, not paperwork.', stars: 5, sortOrder: 3 },
    { name: 'Sunita Verma', role: 'Vice Principal, KV Delhi', quote: 'We switched from three different tools to just My Digital Academy. The all-in-one platform saved us time and money.', stars: 5, sortOrder: 4 },
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
  console.log('  Super Admin:  superadmin@schoolerp.com / admin123')
  console.log('  School Admin: admin@dpsdelhi.in / admin123')
  console.log('  Teacher:      anita.sharma@dpsdelhi.in / teacher123')
  console.log('  Student:      student@example.com / student123')
  console.log('  Parent:       9876543201 / parent123')
}

seed().catch(console.error).finally(() => db.$disconnect())
