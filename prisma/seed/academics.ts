import { db } from '../../src/lib/db'

const ACADEMIC_YEAR = '2026-2027'
const ACADEMIC_YEAR_START = new Date('2026-04-01')

type TimetableSlot = { day: string; period: number; subjectCode: string; teacherSpec: string; startTime: string; endTime: string; roomNo: string }

// 5 teaching periods per day Mon-Fri (period 5 in PeriodConfig is the break)
const TEACHING_PERIODS = [
  { period: 1, startTime: '08:00', endTime: '08:40' },
  { period: 2, startTime: '08:40', endTime: '09:20' },
  { period: 3, startTime: '09:20', endTime: '10:00' },
  { period: 4, startTime: '10:00', endTime: '10:40' },
  { period: 6, startTime: '11:00', endTime: '11:40' },
  { period: 7, startTime: '11:40', endTime: '12:20' },
  { period: 8, startTime: '12:20', endTime: '13:00' },
]
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function rotateSubjects(codes: string[]) {
  // Build a Mon-Sat × 7-period plan by rotating through the subject list.
  const slots: Array<{ day: string; period: number; startTime: string; endTime: string; subjectCode: string }> = []
  let cursor = 0
  for (const day of DAYS) {
    for (const p of TEACHING_PERIODS) {
      slots.push({ day, period: p.period, startTime: p.startTime, endTime: p.endTime, subjectCode: codes[cursor % codes.length] })
      cursor++
    }
  }
  return slots
}

async function main() {
  console.log('🌱 Seeding academics (timetable, exams, results, attendance)...')

  const school = await db.school.findFirst({ where: { subdomain: 'dps-delhi', deletedAt: null } })
  if (!school) {
    throw new Error('Seed school "dps-delhi" not found. Run the core seed first.')
  }

  const schoolAdmin = await db.user.findFirst({ where: { schoolId: school.id, role: 'SCHOOL_ADMIN', deletedAt: null } })
  if (!schoolAdmin) {
    throw new Error('School admin not found. Run the core seed first.')
  }

  const classes = await db.class.findMany({ where: { schoolId: school.id, deletedAt: null }, orderBy: { name: 'asc' } })
  const sections = await db.section.findMany({ where: { schoolId: school.id, deletedAt: null }, orderBy: { name: 'asc' } })
  const subjects = await db.subject.findMany({ where: { schoolId: school.id, deletedAt: null } })
  const teachers = await db.teacher.findMany({ where: { schoolId: school.id, isActive: true } })

  const subjectByCode = new Map(subjects.map(s => [s.code!, s]))
  // Multiple teachers can share a specialization (e.g., 3 Math teachers across
  // primary/middle/secondary). Match teacher.specialization against subject.name
  // case-insensitively via substring, so 'Art' specialization maps to 'Art & Craft'.
  const teachersBySubjectCode = new Map<string, typeof teachers>()
  for (const t of teachers) {
    if (!t.specialization) continue
    const spec = t.specialization.toLowerCase()
    const subject = subjects.find(s => s.name.toLowerCase().includes(spec))
    if (!subject?.code) continue
    const list = teachersBySubjectCode.get(subject.code) || []
    list.push(t)
    teachersBySubjectCode.set(subject.code, list)
  }

  // Per-class subject lists from ClassSubject mappings (rather than hardcoding
  // again — keeps academics seed in sync with the index seed's tiering).
  const classSubjectRows = await db.classSubject.findMany({
    where: { class: { schoolId: school.id, deletedAt: null } },
    include: { subject: { select: { code: true } } },
  })
  const subjectCodesByClass = new Map<string, string[]>()
  for (const cs of classSubjectRows) {
    if (!cs.subject?.code) continue
    const arr = subjectCodesByClass.get(cs.classId) || []
    arr.push(cs.subject.code)
    subjectCodesByClass.set(cs.classId, arr)
  }

  // ============================================
  // TIMETABLE — cover every (class, section), no teacher double-bookings
  // ============================================
  // Busy = teacher already teaching at (day, period) anywhere in the school.
  // Pre-populate from any existing timetable so re-runs respect prior data.
  const slotKey = (day: string, period: number, teacherId: string) => `${day}|${period}|${teacherId}`
  const existsKey = (sectionId: string, day: string, period: number) => `${sectionId}|${day}|${period}`
  const busy = new Set<string>()
  const alreadyScheduled = new Set<string>()
  const existingTimetables = await db.timetable.findMany({
    where: { schoolId: school.id, academicYear: ACADEMIC_YEAR },
    select: { sectionId: true, day: true, period: true, teacherId: true },
  })
  for (const tt of existingTimetables) {
    busy.add(slotKey(tt.day, tt.period, tt.teacherId))
    alreadyScheduled.add(existsKey(tt.sectionId, tt.day, tt.period))
  }

  // Round-robin cursor per subject so teacher load stays balanced across sections.
  const teacherCursors = new Map<string, number>()

  // Process sections in a stable order: by class name, then section name.
  const orderedSections = [...sections].sort((a, b) => {
    const ca = classes.find(c => c.id === a.classId)?.name || ''
    const cb = classes.find(c => c.id === b.classId)?.name || ''
    if (ca !== cb) {
      const na = parseInt(ca.replace(/\D/g, ''), 10) || 0
      const nb = parseInt(cb.replace(/\D/g, ''), 10) || 0
      if (na !== nb) return na - nb
      return ca.localeCompare(cb)
    }
    return (a.name || '').localeCompare(b.name || '')
  })

  let timetableCreated = 0
  let skippedNoTeacher = 0
  let sectionIndex = 0
  for (const section of orderedSections) {
    const cls = classes.find(c => c.id === section.classId)
    if (!cls) continue
    const codes = subjectCodesByClass.get(cls.id) || []
    if (codes.length === 0) continue

    // Stagger the rotation per section so consecutive sections aren't all
    // demanding the same subject (and same teachers) at the same slot.
    const offset = sectionIndex % codes.length
    const rotatedCodes = [...codes.slice(offset), ...codes.slice(0, offset)]

    const slots = rotateSubjects(rotatedCodes)
    for (const slot of slots) {
      if (alreadyScheduled.has(existsKey(section.id, slot.day, slot.period))) continue

      const subject = subjectByCode.get(slot.subjectCode)
      if (!subject) continue

      const candidates = teachersBySubjectCode.get(slot.subjectCode) || []
      let teacher: typeof teachers[number] | undefined
      if (candidates.length > 0) {
        const startCursor = teacherCursors.get(slot.subjectCode) || 0
        for (let i = 0; i < candidates.length; i++) {
          const idx = (startCursor + i) % candidates.length
          const cand = candidates[idx]
          if (!busy.has(slotKey(slot.day, slot.period, cand.id))) {
            teacher = cand
            teacherCursors.set(slot.subjectCode, idx + 1)
            break
          }
        }
      }
      if (!teacher) {
        // Every teacher of this subject is already booked at this slot.
        // Real schools leave the period as study-hall — skip gracefully.
        skippedNoTeacher++
        continue
      }

      busy.add(slotKey(slot.day, slot.period, teacher.id))
      alreadyScheduled.add(existsKey(section.id, slot.day, slot.period))

      await db.timetable.create({
        data: {
          schoolId: school.id,
          academicYear: ACADEMIC_YEAR,
          classId: cls.id,
          sectionId: section.id,
          subjectId: subject.id,
          teacherId: teacher.id,
          day: slot.day,
          period: slot.period,
          startTime: slot.startTime,
          endTime: slot.endTime,
          roomNo: `R-${cls.name.replace('Class ', '')}${section.name}`,
        },
      })
      timetableCreated++
    }
    sectionIndex++
  }
  console.log(
    `✅ Created ${timetableCreated} timetable entries across ${orderedSections.length} sections` +
    (skippedNoTeacher > 0 ? ` (${skippedNoTeacher} slots left as study-hall — no teacher free)` : '')
  )

  // ============================================
  // EXAMS — seeded by the main seed (prisma/seed/index.ts) which now creates
  // an ExamParadigm + Term 1/Term 2 ExamGroup + GradeScale + ReportCardTemplate
  // per school. Concrete Exam rows + ExamSubjectConfig + MarksEntry seeding
  // ships with Phase 2 of the exam module. The legacy single-row Exam/ExamResult
  // model was removed when the new dynamic schema landed (2026-06-02).
  // ============================================
  console.log('ℹ️  Skipping legacy exam/result seeding — new exam module uses paradigm → group → exam → component (Phase 2).')

  // ============================================
  // ATTENDANCE — 30 weekdays from 2026-04-01 for each demo student
  // ============================================
  const demoStudents = await db.student.findMany({
    where: { schoolId: school.id, admissionNumber: { startsWith: 'ADM-SEED-2026-' }, deletedAt: null },
    select: { id: true },
  })

  const existingAttendance = await db.attendance.count({ where: { schoolId: school.id, academicYear: ACADEMIC_YEAR } })
  if (existingAttendance > 0) {
    console.log(`↺ Attendance already seeded (${existingAttendance} rows). Skipping.`)
  } else if (demoStudents.length > 0) {
    const weekdayCount = 30
    const days: Date[] = []
    const cursor = new Date(ACADEMIC_YEAR_START)
    while (days.length < weekdayCount) {
      const dow = cursor.getDay()
      if (dow !== 0 && dow !== 6) {
        days.push(new Date(cursor))
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    // ~92% present, with deterministic dispersion of absent/late
    function statusFor(studentIdx: number, dayIdx: number): string {
      const v = (studentIdx * 7 + dayIdx) % 25
      if (v === 3) return 'absent'
      if (v === 11) return 'late'
      if (v === 19) return 'half_day'
      return 'present'
    }

    let attendanceCreated = 0
    for (let sIdx = 0; sIdx < demoStudents.length; sIdx++) {
      const student = demoStudents[sIdx]
      for (let dIdx = 0; dIdx < days.length; dIdx++) {
        const date = days[dIdx]
        const status = statusFor(sIdx, dIdx)
        await db.attendance.create({
          data: {
            schoolId: school.id,
            studentId: student.id,
            academicYear: ACADEMIC_YEAR,
            date,
            status,
            markedBy: schoolAdmin.id,
            finalized: true,
            finalizedAt: date,
            finalizedBy: schoolAdmin.id,
          },
        })
        attendanceCreated++
      }
    }
    console.log(`✅ Created ${attendanceCreated} attendance rows (${demoStudents.length} students × ${days.length} weekdays)`)
  }

  console.log('🎓 Academics seed complete.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
