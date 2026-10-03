import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requireAnyPermission } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, internalError, apiError } from '@/lib/api-errors'

/**
 * GET /api/school/audit-logs
 *
 * Central Audit Logs API providing a unified view of all log categories across the ERP:
 * - Fees & Payments (FeeAuditLog)
 * - Fee Configurations (FeeConfigAuditLog)
 * - Attendance Events (AttendanceAuditLog)
 * - Biometric / RFID Punches (AttendanceDevicePunchLog)
 * - Exams & Academic Marks (ExamAuditLog)
 * - Staff Salary & Payroll (SalaryAuditLog)
 */

const CREATED_KEYWORDS = ['create', 'recorded', 'issued', 'generated', 'marked']
const UPDATED_KEYWORDS = ['update', 'edit', 'reopen', 'change', 'modify']
const DELETED_KEYWORDS = ['delete', 'void', 'cancel', 'revers', 'remove', 'reject']

function determineActionGroup(action: string): 'created' | 'updated' | 'deleted' | 'system' {
  const lower = (action || '').toLowerCase()
  if (DELETED_KEYWORDS.some((kw) => lower.includes(kw))) return 'deleted'
  if (UPDATED_KEYWORDS.some((kw) => lower.includes(kw))) return 'updated'
  if (CREATED_KEYWORDS.some((kw) => lower.includes(kw))) return 'created'
  return 'system'
}

function safeJsonParse(val: unknown): any {
  if (!val) return null
  if (typeof val === 'object') return val
  if (typeof val === 'string') {
    try {
      return JSON.parse(val)
    } catch {
      return val
    }
  }
  return null
}

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return ''
  const str = String(val).trim()
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF', 'TEACHER'])
    if (!user?.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const ok = await requireAnyPermission(request, [
        'attendance:audit:view',
        'fees:audit',
        'fees:read',
        'exam:audit',
        'exam:audit:view',
        'rfid:taps:view',
        'salary:read',
      ])
      if (!ok) {
        return forbiddenError("You don't have access to audit logs.")
      }
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || 'all'
    const actionGroup = searchParams.get('actionGroup') || 'all'
    const search = (searchParams.get('search') || '').trim().toLowerCase()
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    const format = searchParams.get('format')
    const wantCsv = format === 'csv'

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = wantCsv ? 2000 : Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)))
    const skip = (page - 1) * limit

    const schoolId = user.schoolId

    // Date range filter
    const dateRange: { gte?: Date; lte?: Date } = {}
    if (startDate) {
      const d = new Date(startDate)
      if (!isNaN(d.getTime())) dateRange.gte = d
    }
    if (endDate) {
      const d = new Date(endDate)
      if (!isNaN(d.getTime())) {
        // Set end of day if only YYYY-MM-DD was provided
        if (endDate.length === 10) d.setHours(23, 59, 59, 999)
        dateRange.lte = d
      }
    }
    const hasDateRange = Boolean(dateRange.gte || dateRange.lte)

    // Summary counters (overall counts per category for the school)
    const [
      feesCount,
      configCount,
      attendanceCount,
      punchesCount,
      examsCount,
      salaryCount,
    ] = await Promise.all([
      db.feeAuditLog.count({ where: { schoolId } }).catch(() => 0),
      db.feeConfigAuditLog.count({ where: { schoolId } }).catch(() => 0),
      db.attendanceAuditLog.count({ where: { schoolId } }).catch(() => 0),
      db.attendanceDevicePunchLog.count({ where: { schoolId } }).catch(() => 0),
      db.examAuditLog.count({ where: { schoolId } }).catch(() => 0),
      db.salaryAuditLog.count({ where: { schoolId } }).catch(() => 0),
    ])

    const totalEvents = feesCount + configCount + attendanceCount + punchesCount + examsCount + salaryCount

    // Queries to collect unified logs
    // When category is 'all', we fetch recent events from each category, normalize, and sort
    const normalizedItems: any[] = []

    const shouldQueryFees = category === 'all' || category === 'fees'
    const shouldQueryConfig = category === 'all' || category === 'fee-config'
    const shouldQueryAttendance = category === 'all' || category === 'attendance'
    const shouldQueryPunches = category === 'all' || category === 'punches'
    const shouldQueryExams = category === 'all' || category === 'exams'
    const shouldQuerySalary = category === 'all' || category === 'salary'

    const fetchPerModuleLimit = category === 'all' ? Math.max(limit * 2, 50) : limit + skip

    const queries: Promise<void>[] = []

    // 1. Fee Audit Logs
    if (shouldQueryFees) {
      queries.push((async () => {
        try {
          const where: any = { schoolId }
          if (hasDateRange) where.createdAt = dateRange

          const rows = await db.feeAuditLog.findMany({
            where,
            include: {
              student: {
                select: { id: true, firstName: true, lastName: true, admissionNumber: true },
              },
              user: {
                select: { id: true, name: true, email: true, role: true },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: fetchPerModuleLimit,
          })

          for (const row of rows) {
            const studentName = row.student ? `${row.student.firstName} ${row.student.lastName}`.trim() : null
            const actionGrp = determineActionGroup(row.action)
            normalizedItems.push({
              id: `fee_${row.id}`,
              rawId: row.id,
              category: 'fees',
              categoryLabel: 'Fees & Collections',
              action: row.action,
              actionGroup: actionGrp,
              entityType: row.entityType,
              entityId: row.entityId,
              title: `${row.entityType.replace(/_/g, ' ').toUpperCase()} • ${row.action.replace(/_/g, ' ')}`,
              description: row.diffSummary || null,
              diffSummary: row.diffSummary,
              oldValue: safeJsonParse(row.oldValue),
              newValue: safeJsonParse(row.newValue),
              metadata: safeJsonParse(row.metadata),
              actor: row.user ? { id: row.user.id, name: row.user.name, email: row.user.email, role: row.user.role } : null,
              target: studentName ? { id: row.student?.id, name: studentName, subtitle: `Adm: ${row.student?.admissionNumber || 'N/A'}`, type: 'student' } : null,
              ipAddress: row.ipAddress,
              userAgent: row.userAgent,
              createdAt: row.createdAt.toISOString(),
            })
          }
        } catch (e) {
          console.error('Unified audit: error fetching fee logs', e)
        }
      })())
    }

    // 2. Fee Config Audit Logs
    if (shouldQueryConfig) {
      queries.push((async () => {
        try {
          const where: any = { schoolId }
          if (hasDateRange) where.createdAt = dateRange

          const rows = await db.feeConfigAuditLog.findMany({
            where,
            include: {
              user: {
                select: { id: true, name: true, email: true, role: true },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: fetchPerModuleLimit,
          })

          for (const row of rows) {
            const actionGrp = determineActionGroup(row.action)
            normalizedItems.push({
              id: `cfg_${row.id}`,
              rawId: row.id,
              category: 'fee-config',
              categoryLabel: 'Fee Configurations',
              action: row.action,
              actionGroup: actionGrp,
              entityType: row.configType,
              entityId: row.configId,
              title: `Config: ${row.configType.replace(/_/g, ' ').toUpperCase()} • ${row.action}`,
              description: row.diffSummary || null,
              diffSummary: row.diffSummary,
              oldValue: safeJsonParse(row.oldValue),
              newValue: safeJsonParse(row.newValue),
              metadata: null,
              actor: row.user ? { id: row.user.id, name: row.user.name, email: row.user.email, role: row.user.role } : null,
              target: { id: row.configId, name: row.configType, subtitle: `ID: ${row.configId.slice(0, 10)}...`, type: 'config' },
              ipAddress: row.ipAddress,
              userAgent: row.userAgent,
              createdAt: row.createdAt.toISOString(),
            })
          }
        } catch (e) {
          console.error('Unified audit: error fetching config logs', e)
        }
      })())
    }

    // 3. Attendance Audit Logs
    if (shouldQueryAttendance) {
      queries.push((async () => {
        try {
          const where: any = { schoolId }
          if (hasDateRange) where.createdAt = dateRange

          const rows = await db.attendanceAuditLog.findMany({
            where,
            include: {
              actor: {
                select: { id: true, name: true, email: true, role: true },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: fetchPerModuleLimit,
          })

          const classIds = Array.from(new Set(rows.map((r) => r.classId).filter(Boolean))) as string[]
          const sectionIds = Array.from(new Set(rows.map((r) => r.sectionId).filter(Boolean))) as string[]

          const [classes, sections] = await Promise.all([
            classIds.length ? db.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }) : [],
            sectionIds.length ? db.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true } }) : [],
          ])
          const classMap = new Map(classes.map((c) => [c.id, c.name]))
          const sectionMap = new Map(sections.map((s) => [s.id, s.name]))

          for (const row of rows) {
            const className = row.classId ? classMap.get(row.classId) || 'Class' : ''
            const sectionName = row.sectionId ? sectionMap.get(row.sectionId) || '' : ''
            const classLabel = [className, sectionName].filter(Boolean).join(' - ') || 'All Classes'
            const actionGrp = row.action === 'reopen' ? 'updated' : 'system'

            normalizedItems.push({
              id: `att_${row.id}`,
              rawId: row.id,
              category: 'attendance',
              categoryLabel: 'Attendance Logs',
              action: row.action,
              actionGroup: actionGrp,
              entityType: 'attendance_register',
              entityId: `${row.date.toISOString().split('T')[0]}_${row.classId || 'all'}`,
              title: `Attendance ${row.action === 'finalize' ? 'Finalized' : 'Reopened'} • ${classLabel}`,
              description: row.reason || `Session: ${row.academicYear}, Changes: ${row.changesCount || 0}`,
              diffSummary: row.reason ? `Reason: ${row.reason}` : `Changes Count: ${row.changesCount}`,
              oldValue: null,
              newValue: { academicYear: row.academicYear, date: row.date, changesCount: row.changesCount, reason: row.reason },
              metadata: { academicYear: row.academicYear, date: row.date, changesCount: row.changesCount },
              actor: row.actor ? { id: row.actor.id, name: row.actor.name, email: row.actor.email, role: (row.actor as any).role || 'STAFF' } : null,
              target: { id: row.classId || '', name: classLabel, subtitle: `Date: ${row.date.toISOString().split('T')[0]}`, type: 'class' },
              ipAddress: null,
              userAgent: null,
              createdAt: row.createdAt.toISOString(),
            })
          }
        } catch (e) {
          console.error('Unified audit: error fetching attendance logs', e)
        }
      })())
    }

    // 4. Device Punches
    if (shouldQueryPunches) {
      queries.push((async () => {
        try {
          const where: any = { schoolId }
          if (hasDateRange) where.createdAt = dateRange

          const rows = await db.attendanceDevicePunchLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: fetchPerModuleLimit,
          })

          for (const row of rows) {
            const isReject = row.result.includes('unknown') || row.result.includes('invalid') || row.result.includes('revoked')
            const actionGrp = isReject ? 'deleted' : 'created'

            normalizedItems.push({
              id: `punch_${row.id}`,
              rawId: row.id,
              category: 'punches',
              categoryLabel: 'Device Punches',
              action: row.result,
              actionGroup: actionGrp,
              entityType: 'biometric_punch',
              entityId: row.id,
              title: `Punch Tap (${row.verifyMode || 'CARD/BIO'}) • ${row.result}`,
              description: row.errorDetail || `Device: ${row.serialNo}, User ID: ${row.deviceUserId}`,
              diffSummary: row.errorDetail ? `Error: ${row.errorDetail}` : `Status: ${row.punchStatus}`,
              oldValue: null,
              newValue: { verifyMode: row.verifyMode, punchStatus: row.punchStatus, result: row.result },
              metadata: { serialNo: row.serialNo, deviceUserId: row.deviceUserId, rawPayload: row.rawPayload },
              actor: { id: row.deviceUserId, name: `Device ${row.serialNo}`, email: null, role: 'DEVICE' },
              target: { id: row.personId || row.deviceUserId, name: `User ID: ${row.deviceUserId}`, subtitle: `Type: ${row.personType || 'Unknown'}`, type: row.personType || 'person' },
              ipAddress: null,
              userAgent: null,
              createdAt: (row.punchTime || row.createdAt).toISOString(),
            })
          }
        } catch (e) {
          console.error('Unified audit: error fetching punch logs', e)
        }
      })())
    }

    // 5. Exam Audit Logs
    if (shouldQueryExams) {
      queries.push((async () => {
        try {
          const where: any = { schoolId }
          if (hasDateRange) where.createdAt = dateRange

          const rows = await db.examAuditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: fetchPerModuleLimit,
          })

          const userIds = Array.from(new Set(rows.map((r) => r.userId).filter(Boolean))) as string[]
          const studentIds = Array.from(new Set(rows.map((r) => r.studentId).filter(Boolean))) as string[]
          const examIds = Array.from(new Set(rows.map((r) => r.examId).filter(Boolean))) as string[]

          const [users, students, exams] = await Promise.all([
            userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, role: true } }) : [],
            studentIds.length ? db.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true, lastName: true, admissionNumber: true } }) : [],
            examIds.length ? db.exam.findMany({ where: { id: { in: examIds } }, select: { id: true, name: true, shortCode: true } }) : [],
          ])

          const userMap = new Map(users.map((u) => [u.id, u]))
          const studentMap = new Map(students.map((s) => [s.id, s]))
          const examMap = new Map(exams.map((e) => [e.id, e]))

          for (const row of rows) {
            const actorUser = row.userId ? userMap.get(row.userId) : null
            const targetStudent = row.studentId ? studentMap.get(row.studentId) : null
            const targetExam = row.examId ? examMap.get(row.examId) : null
            const studentName = targetStudent ? `${targetStudent.firstName} ${targetStudent.lastName}`.trim() : null
            const actionGrp = determineActionGroup(row.action)

            normalizedItems.push({
              id: `exam_${row.id}`,
              rawId: row.id,
              category: 'exams',
              categoryLabel: 'Exams & Marks',
              action: row.action,
              actionGroup: actionGrp,
              entityType: row.entityType,
              entityId: row.entityId,
              title: `Exam: ${row.entityType.replace(/_/g, ' ').toUpperCase()} • ${row.action}`,
              description: row.diffSummary || null,
              diffSummary: row.diffSummary,
              oldValue: safeJsonParse(row.oldValue),
              newValue: safeJsonParse(row.newValue),
              metadata: safeJsonParse(row.metadata),
              actor: actorUser ? { id: actorUser.id, name: actorUser.name, email: actorUser.email, role: actorUser.role } : null,
              target: targetStudent
                ? { id: targetStudent.id, name: studentName, subtitle: `Adm: ${targetStudent.admissionNumber || 'N/A'}${targetExam ? ` • ${targetExam.name}` : ''}`, type: 'student' }
                : targetExam
                ? { id: targetExam.id, name: targetExam.name, subtitle: `Code: ${targetExam.shortCode || 'N/A'}`, type: 'exam' }
                : null,
              ipAddress: row.ipAddress,
              userAgent: row.userAgent,
              createdAt: row.createdAt.toISOString(),
            })
          }
        } catch (e) {
          console.error('Unified audit: error fetching exam logs', e)
        }
      })())
    }

    // 6. Salary Audit Logs
    if (shouldQuerySalary) {
      queries.push((async () => {
        try {
          const where: any = { schoolId }
          if (hasDateRange) where.createdAt = dateRange

          const rows = await db.salaryAuditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: fetchPerModuleLimit,
          })

          const userIds = Array.from(new Set(rows.map((r) => r.userId).filter(Boolean))) as string[]
          const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, role: true } }) : []
          const userMap = new Map(users.map((u) => [u.id, u]))

          for (const row of rows) {
            const actorUser = row.userId ? userMap.get(row.userId) : null
            const actionGrp = determineActionGroup(row.action)

            normalizedItems.push({
              id: `sal_${row.id}`,
              rawId: row.id,
              category: 'salary',
              categoryLabel: 'Salary & Payroll',
              action: row.action,
              actionGroup: actionGrp,
              entityType: row.entityType,
              entityId: row.entityId,
              title: `Salary: ${row.entityType.replace(/_/g, ' ').toUpperCase()} • ${row.action}`,
              description: row.diffSummary || null,
              diffSummary: row.diffSummary,
              oldValue: safeJsonParse(row.oldValue),
              newValue: safeJsonParse(row.newValue),
              metadata: safeJsonParse(row.metadata),
              actor: actorUser ? { id: actorUser.id, name: actorUser.name, email: actorUser.email, role: actorUser.role } : null,
              target: { id: row.staffId || row.entityId, name: `${row.staffType || 'Staff'} Record`, subtitle: `ID: ${(row.staffId || row.entityId).slice(0, 10)}...`, type: 'staff' },
              ipAddress: row.ipAddress,
              userAgent: row.userAgent,
              createdAt: row.createdAt.toISOString(),
            })
          }
        } catch (e) {
          console.error('Unified audit: error fetching salary logs', e)
        }
      })())
    }

    // Wait for all queries to finish
    await Promise.all(queries)

    // In-memory filtering for actionGroup & search across all aggregated streams
    let filtered = normalizedItems

    if (actionGroup !== 'all') {
      filtered = filtered.filter((item) => item.actionGroup === actionGroup)
    }

    if (search) {
      filtered = filtered.filter((item) => {
        const titleMatch = item.title?.toLowerCase().includes(search)
        const descMatch = item.description?.toLowerCase().includes(search)
        const diffMatch = item.diffSummary?.toLowerCase().includes(search)
        const actorNameMatch = item.actor?.name?.toLowerCase().includes(search)
        const actorEmailMatch = item.actor?.email?.toLowerCase().includes(search)
        const targetNameMatch = item.target?.name?.toLowerCase().includes(search)
        const targetSubMatch = item.target?.subtitle?.toLowerCase().includes(search)
        const actionMatch = item.action?.toLowerCase().includes(search)
        const entityIdMatch = item.entityId?.toLowerCase().includes(search)
        return (
          titleMatch ||
          descMatch ||
          diffMatch ||
          actorNameMatch ||
          actorEmailMatch ||
          targetNameMatch ||
          targetSubMatch ||
          actionMatch ||
          entityIdMatch
        )
      })
    }

    // Sort chronologically descending
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // CSV format output
    if (wantCsv) {
      const csvHeader = [
        'Timestamp',
        'Category',
        'Action',
        'Action Group',
        'Entity Type',
        'Entity ID',
        'Target',
        'Performed By',
        'Role',
        'Diff Summary',
        'IP Address',
      ].join(',')

      const csvRows = filtered.map((item) => [
        escapeCsvField(new Date(item.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })),
        escapeCsvField(item.categoryLabel),
        escapeCsvField(item.action),
        escapeCsvField(item.actionGroup),
        escapeCsvField(item.entityType),
        escapeCsvField(item.entityId),
        escapeCsvField(item.target ? `${item.target.name || ''} (${item.target.subtitle || ''})` : ''),
        escapeCsvField(item.actor?.name || 'System'),
        escapeCsvField(item.actor?.role || 'SYSTEM'),
        escapeCsvField(item.diffSummary || item.description || ''),
        escapeCsvField(item.ipAddress || ''),
      ].join(','))

      const csvContent = [csvHeader, ...csvRows].join('\r\n')

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="audit-logs-report-${Date.now()}.csv"`,
        },
      })
    }

    // Pagination
    const total = filtered.length
    const paginatedItems = filtered.slice(skip, skip + limit)

    // Calculate sensitive actions count
    const sensitiveCount = normalizedItems.filter((i) => i.actionGroup === 'deleted').length

    return NextResponse.json({
      logs: paginatedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      stats: {
        totalEvents,
        filteredTotal: total,
        feesCount,
        configCount,
        attendanceCount,
        punchesCount,
        examsCount,
        salaryCount,
        sensitiveCount,
      },
    })
  } catch (error) {
    console.error('Unified audit logs API error:', error)
    return internalError('Unified audit logs error')
  }
}
