import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, getUserPermissions } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'
import { getTeachingDays, getAcademicYearStart, startOfDay, isSchoolTeachingDay } from '@/lib/academic-calendar'
import { computePercent } from '@/lib/attendance-report-utils'

// Returns attendance percentage for a single student over the academic year
// to today, using teaching days as denominator (missing records = absent).
async function computeStudentAttendancePercent(
  schoolId: string,
  academicYear: string,
  studentId: string
): Promise<number> {
  const start = await getAcademicYearStart(schoolId, academicYear)
  if (!start) return 0
  const today = startOfDay(new Date())
  if (start > today) return 0

  const [present, teachingDays] = await Promise.all([
    db.attendance.count({
      where: {
        schoolId,
        studentId,
        academicYear,
        status: 'present',
        date: { gte: start, lte: today },
      },
    }),
    getTeachingDays(schoolId, academicYear, start, today),
  ])

  return Math.round(computePercent(present, teachingDays.length))
}

// GET /api/school/dashboard - Dashboard stats (role-aware)
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF', 'STUDENT', 'PARENT'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const schoolId = user.schoolId
    const role = user.role

    // Route to role-specific dashboard data
    switch (role) {
      case 'SUPER_ADMIN':
      case 'SCHOOL_ADMIN':
        return await getAdminDashboard(schoolId, ['*'])
      case 'TEACHER':
        return await getTeacherDashboard(schoolId, user.userId)
      case 'STAFF': {
        // STAFF roles inherit permissions from their assigned custom roles.
        // The admin dashboard only returns sections the user has permission for.
        const perms = await getUserPermissions(user.userId, role, schoolId)
        return await getAdminDashboard(schoolId, perms)
      }
      case 'STUDENT':
        return await getStudentDashboard(schoolId, user.userId)
      case 'PARENT':
        return await getParentDashboard(schoolId, user.userId)
      default:
        return unauthorizedError()
    }
  } catch (error) {
    console.error('Dashboard error:', error)
    return internalError('loading the dashboard')
  }
}

function hasPerm(perms: string[], code: string) {
  if (perms.includes('*')) return true
  if (perms.includes(code)) return true
  const [mod] = code.split(':')
  return perms.includes(`${mod}:*`)
}

// ============================================
// ADMIN DASHBOARD
// ============================================
async function getAdminDashboard(schoolId: string, perms: string[]) {
  const canStudents = hasPerm(perms, 'student:read')
  const canTeachers = hasPerm(perms, 'teacher:read')
  const canClasses = hasPerm(perms, 'class:read')
  const canFees = hasPerm(perms, 'fees:read')
  const canAttendance = hasPerm(perms, 'attendance:read')
  const canSalary = hasPerm(perms, 'salary:read')
  const canAnnouncements = hasPerm(perms, 'announcement:read')

  // Core stats — each guarded by the matching read permission
  const [totalStudents, totalTeachers, totalClasses, totalSections] = await Promise.all([
    canStudents ? db.student.count({ where: { schoolId, deletedAt: null, isActive: true } }) : Promise.resolve(0),
    canTeachers ? db.teacher.count({ where: { schoolId, deletedAt: null, isActive: true } }) : Promise.resolve(0),
    canClasses ? db.class.count({ where: { schoolId, deletedAt: null } }) : Promise.resolve(0),
    canClasses ? db.section.count({ where: { schoolId, deletedAt: null } }) : Promise.resolve(0),
  ])

  // Fee stats
  const [totalFees, collectedFees, pendingFees] = canFees
    ? await Promise.all([
        db.feeCollection.aggregate({
          where: { schoolId, deletedAt: null },
          _sum: { amount: true },
        }),
        db.feeCollection.aggregate({
          where: { schoolId, deletedAt: null, paymentStatus: { in: ['paid', 'partial'] } },
          _sum: { paidAmount: true },
        }),
        db.feeCollection.aggregate({
          where: { schoolId, deletedAt: null, paymentStatus: { in: ['unpaid', 'partial'] } },
          _sum: { amount: true, paidAmount: true },
        }),
      ])
    : [
        { _sum: { amount: 0 } },
        { _sum: { paidAmount: 0 } },
        { _sum: { amount: 0, paidAmount: 0 } },
      ]

  // Attendance today
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const schoolForYear = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const adminAcademicYear = schoolForYear?.academicYear || ''

  const teachingInfo = canAttendance && adminAcademicYear
    ? await isSchoolTeachingDay(schoolId, adminAcademicYear, today)
    : { teaching: true as const }

  const attendanceToday = canAttendance && teachingInfo.teaching
    ? await db.attendance.findMany({
        where: { schoolId, date: today },
        select: { status: true },
      })
    : []

  const attendanceStats = {
    total: attendanceToday.length,
    present: attendanceToday.filter((a) => a.status === 'present').length,
    absent: attendanceToday.filter((a) => a.status === 'absent').length,
    leave: attendanceToday.filter((a) => a.status === 'leave').length,
    isTeachingDay: teachingInfo.teaching,
    nonTeachingReason: !teachingInfo.teaching ? teachingInfo.reason : undefined,
    holidayName: !teachingInfo.teaching && teachingInfo.reason === 'holiday' ? teachingInfo.holiday?.name : undefined,
  }

  // Overdue fees
  const overdueFees = canFees
    ? await db.feeCollection.aggregate({
        where: {
          schoolId,
          deletedAt: null,
          paymentStatus: { in: ['unpaid', 'partial'] },
          dueDate: { lt: new Date() },
        },
        _sum: { amount: true, paidAmount: true },
      })
    : { _sum: { amount: 0, paidAmount: 0 } }

  // Salary stats
  const salaryPaymentsThisMonth = canSalary
    ? await db.salaryPayment.aggregate({
        where: {
          schoolId,
          month: today.getMonth() + 1,
          year: today.getFullYear(),
          paymentStatus: 'paid',
        },
        _sum: { netPayable: true },
      })
    : { _sum: { netPayable: 0 } }

  // Recent activities — only pull from sources the user can see
  const [recentFeePayments, recentStudents, recentAnnouncements] = await Promise.all([
    canFees
      ? db.feeCollection.findMany({
          where: { schoolId, paymentStatus: { in: ['paid', 'partial'] }, deletedAt: null },
          include: { student: { select: { firstName: true, lastName: true } } },
          orderBy: { paymentDate: 'desc' },
          take: 5,
        })
      : Promise.resolve([]),
    canStudents
      ? db.student.findMany({
          where: { schoolId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, firstName: true, lastName: true, createdAt: true },
        })
      : Promise.resolve([]),
    canAnnouncements
      ? db.announcement.findMany({
          where: { schoolId, isActive: true, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { id: true, title: true, priority: true, createdAt: true },
        })
      : Promise.resolve([]),
  ])

  const totalFeeAmount = totalFees._sum.amount || 0
  const collectedFeeAmount = collectedFees._sum.paidAmount || 0
  const pendingFeeAmount = (pendingFees._sum.amount || 0) - (pendingFees._sum.paidAmount || 0)
  const overdueFeeAmount = (overdueFees._sum.amount || 0) - (overdueFees._sum.paidAmount || 0)

  const recentActivities: Array<{ id: string; type: string; message: string; time: string }> = []

  recentFeePayments.forEach((p) => {
    recentActivities.push({
      id: p.id,
      type: 'fee',
      message: `Fee payment of ₹${(p.paidAmount || 0).toLocaleString()} received from ${p.student ? `${p.student.firstName} ${p.student.lastName}` : 'Unknown'}`,
      time: p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : 'Recently',
    })
  })

  recentStudents.forEach((s) => {
    recentActivities.push({
      id: s.id,
      type: 'student',
      message: `New student ${s.firstName} ${s.lastName} enrolled`,
      time: s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'Recently',
    })
  })

  recentAnnouncements.forEach((a) => {
    recentActivities.push({
      id: a.id,
      type: 'announcement',
      message: `Announcement: ${a.title}`,
      time: a.createdAt ? new Date(a.createdAt).toLocaleDateString() : 'Recently',
    })
  })

  recentActivities.reverse()

  return NextResponse.json({
    role: 'SCHOOL_ADMIN',
    stats: {
      totalStudents,
      totalTeachers,
      totalClasses,
      totalSections,
      totalFees: totalFeeAmount,
      collectedFees: collectedFeeAmount,
      pendingFees: pendingFeeAmount,
      overdueFees: overdueFeeAmount,
      salaryPaidThisMonth: salaryPaymentsThisMonth._sum.netPayable || 0,
      collectionRate: totalFeeAmount > 0 ? ((collectedFeeAmount / totalFeeAmount) * 100).toFixed(1) : '0',
    },
    attendance: attendanceStats,
    recentActivities,
  })
}

// ============================================
// TEACHER DASHBOARD
// ============================================
async function getTeacherDashboard(schoolId: string, userId: string) {
  // Find teacher record linked to this user
  const teacher = await db.teacher.findFirst({
    where: { schoolId, userId, deletedAt: null },
  })

  if (!teacher) {
    return NextResponse.json({
      role: 'TEACHER',
      stats: { myClasses: 0, todayPeriods: 0, totalStudents: 0 },
      schedule: [],
      announcements: [],
    })
  }

  const today = new Date()
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' })

  // Get today's timetable for this teacher
  const todaySchedule = await db.timetable.findMany({
    where: { schoolId, teacherId: teacher.id, day: dayName, deletedAt: null },
    include: {
      subject: { select: { name: true } },
      section: { include: { class: { select: { name: true } } } },
    },
    orderBy: { period: 'asc' },
  })

  // Count distinct classes/sections this teacher teaches
  const distinctSections = await db.timetable.findMany({
    where: { schoolId, teacherId: teacher.id, deletedAt: null },
    select: { sectionId: true },
    distinct: ['sectionId'],
  })

  // Count students in those sections
  const sectionIds = distinctSections.map(s => s.sectionId).filter(Boolean) as string[]
  const totalStudents = sectionIds.length > 0
    ? await db.student.count({ where: { schoolId, sectionId: { in: sectionIds }, deletedAt: null, isActive: true } })
    : 0

  // Get salary info
  const salaryStructure = await db.salaryStructure.findFirst({
    where: { teacherId: teacher.id, isActive: true },
  })

  // Recent announcements
  const announcements = await db.announcement.findMany({
    where: { schoolId, isActive: true, deletedAt: null, audience: { in: ['all', 'teachers'] } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, title: true, priority: true, createdAt: true },
  })

  return NextResponse.json({
    role: 'TEACHER',
    teacherId: teacher.id,
    teacherName: `${teacher.firstName} ${teacher.lastName}`,
    stats: {
      myClasses: distinctSections.length,
      todayPeriods: todaySchedule.length,
      totalStudents,
      netSalary: salaryStructure?.netSalary || 0,
    },
    schedule: todaySchedule.map(t => ({
      period: t.period,
      subject: t.subject?.name || 'N/A',
      class: t.section?.class?.name || 'N/A',
      section: t.section?.name || 'N/A',
      className: t.section?.class?.name && t.section?.name ? `${t.section.class.name}-${t.section.name}` : 'N/A',
      startTime: t.startTime || '',
      endTime: t.endTime || '',
    })),
    salary: salaryStructure ? {
      basic: salaryStructure.basicSalary,
      hra: salaryStructure.hra,
      da: salaryStructure.da,
      gross: salaryStructure.grossSalary,
      deductions: salaryStructure.pf + salaryStructure.esi + salaryStructure.tax + salaryStructure.otherDeductions,
      net: salaryStructure.netSalary,
    } : null,
    announcements,
  })
}

// ============================================
// STUDENT DASHBOARD
// ============================================
async function getStudentDashboard(schoolId: string, userId: string) {
  // Find student record linked to this user (via parent -> studentParent, or directly)
  // Students are linked via User table — but currently Student model doesn't have userId
  // We'll find the student through the parent linkage or direct lookup
  // For now, let's find by matching user info

  const today = new Date()
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' })

  // Try to find student linked to this user
  // Since Student model doesn't have userId, we check if any parent is linked to this user
  const parent = await db.parent.findFirst({
    where: { schoolId, userId, deletedAt: null },
    include: {
      children: {
        include: {
          student: {
            include: {
              class: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  // If this is a parent user trying to access student view, get first child
  // For actual student users, we need a different approach
  // Check if there's a student with this userId (future enhancement)
  const student = await db.student.findFirst({
    where: { schoolId, deletedAt: null, isActive: true },
    include: {
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  })

  if (!student) {
    return NextResponse.json({
      role: 'STUDENT',
      stats: { attendance: '0%', pendingFees: 0, upcomingExams: 0, todayClasses: 0 },
      schedule: [],
      feeStatus: [],
    })
  }

  // Attendance % for this student over the current academic year to today.
  // Denominator = teaching days (working days minus holidays); missing
  // records on teaching days are treated as absent.
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const academicYear = school?.academicYear || ''
  const attendancePercent = academicYear
    ? await computeStudentAttendancePercent(schoolId, academicYear, student.id)
    : 0

  // Pending fees
  const pendingFees = await db.feeCollection.aggregate({
    where: { schoolId, studentId: student.id, paymentStatus: { in: ['unpaid', 'partial'] }, deletedAt: null },
    _sum: { amount: true, paidAmount: true },
  })
  const pendingFeeAmount = (pendingFees._sum.amount || 0) - (pendingFees._sum.paidAmount || 0)

  // Upcoming exams
  const upcomingExams = await db.exam.count({
    where: { schoolId, classId: student.classId || undefined, examDate: { gte: today }, deletedAt: null },
  })

  // Today's schedule
  const sectionId = student.sectionId
  const todaySchedule = sectionId ? await db.timetable.findMany({
    where: { schoolId, sectionId, day: dayName, deletedAt: null },
    include: {
      subject: { select: { name: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
    orderBy: { period: 'asc' },
  }) : []

  // Fee details
  const feeDetails = await db.feeCollection.findMany({
    where: { schoolId, studentId: student.id, deletedAt: null },
    select: { feeHeadName: true, amount: true, paidAmount: true, paymentStatus: true, dueDate: true },
    orderBy: { dueDate: 'asc' },
    take: 10,
  })

  return NextResponse.json({
    role: 'STUDENT',
    studentId: student.id,
    studentName: `${student.firstName} ${student.lastName}`,
    className: student.class?.name || null,
    sectionName: student.section?.name || null,
    stats: {
      attendance: `${attendancePercent}%`,
      pendingFees: pendingFeeAmount,
      upcomingExams,
      todayClasses: todaySchedule.length,
    },
    schedule: todaySchedule.map(t => ({
      period: t.period,
      subject: t.subject?.name || 'N/A',
      teacher: t.teacher ? `${t.teacher.firstName} ${t.teacher.lastName}` : '',
      startTime: t.startTime || '',
      endTime: t.endTime || '',
    })),
    feeStatus: feeDetails.map(f => ({
      feeHead: f.feeHeadName || 'Fee',
      amount: f.amount,
      paid: f.paidAmount,
      due: f.amount - f.paidAmount,
      status: f.paymentStatus,
      dueDate: f.dueDate ? new Date(f.dueDate).toLocaleDateString() : null,
    })),
  })
}

// ============================================
// PARENT DASHBOARD
// ============================================
async function getParentDashboard(schoolId: string, userId: string) {
  const parent = await db.parent.findFirst({
    where: { schoolId, userId, deletedAt: null },
    include: {
      children: {
        include: {
          student: {
            include: {
              class: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
        },
      },
    },
  })

  if (!parent) {
    return NextResponse.json({
      role: 'PARENT',
      stats: { totalChildren: 0, activeChildren: 0 },
      children: [],
    })
  }

  const activeChildren = parent.children.filter(c => c.student.isActive)
  const childIds = activeChildren.map(c => c.studentId)

  // School academic year drives teaching-days lookup for attendance %.
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const academicYear = school?.academicYear || ''

  // Per-child attendance % using teaching-days denominator. Runs in parallel.
  const childPercents = await Promise.all(
    activeChildren.map(async (c) =>
      academicYear ? computeStudentAttendancePercent(schoolId, academicYear, c.studentId) : 0
    )
  )

  // Aggregate pending fees for all children
  const pendingFees = await db.feeCollection.aggregate({
    where: { schoolId, studentId: { in: childIds }, paymentStatus: { in: ['unpaid', 'partial'] }, deletedAt: null },
    _sum: { amount: true, paidAmount: true },
  })
  const totalPendingFees = (pendingFees._sum.amount || 0) - (pendingFees._sum.paidAmount || 0)

  // Announcements
  const announcements = await db.announcement.findMany({
    where: { schoolId, isActive: true, deletedAt: null, audience: { in: ['all', 'parents'] } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, title: true, priority: true, createdAt: true },
  })

  const childrenDetails = activeChildren.map((c, idx) => ({
    id: c.student.id,
    studentId: c.studentId,
    name: `${c.student.firstName} ${c.student.lastName}`,
    admissionNumber: c.student.admissionNumber,
    className: c.student.class?.name || null,
    sectionName: c.student.section?.name || null,
    isActive: c.student.isActive,
    attendancePercent: childPercents[idx],
  }))

  // Overall % = mean of per-child %, so a struggling child isn't masked by
  // siblings with longer histories.
  const overallPercent = childPercents.length > 0
    ? Math.round(childPercents.reduce((a, b) => a + b, 0) / childPercents.length)
    : 0

  return NextResponse.json({
    role: 'PARENT',
    parentId: parent.id,
    stats: {
      totalChildren: parent.children.length,
      activeChildren: activeChildren.length,
      totalPendingFees,
      attendancePercent: overallPercent,
    },
    children: childrenDetails,
    announcements,
  })
}
