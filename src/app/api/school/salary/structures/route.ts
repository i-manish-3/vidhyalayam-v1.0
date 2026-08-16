import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { internalError, apiError } from '@/lib/api-errors'
import { resolveStaff, resolveStaffMap, isStaffType, salaryRound, staffKey } from '@/lib/salary/staff-resolver'
import { logSalaryEvent, extractSalaryAuditContext } from '@/lib/salary/audit'

// GET /api/school/salary/structures - List salary structures
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'salary:read')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view salary structures.")
    }

    const { searchParams } = new URL(request.url)
    const staffType = searchParams.get('staffType') || ''
    const staffId = searchParams.get('staffId') || ''

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }
    if (isStaffType(staffType)) where.staffType = staffType
    if (staffId) where.staffId = staffId

    const structures = await db.salaryStructure.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    const staffMap = await resolveStaffMap(
      db,
      user.schoolId,
      structures.map((s: { staffType: string; staffId: string }) => ({ staffType: s.staffType, staffId: s.staffId }))
    )
    const withStaff = structures.map((s: { staffType: string; staffId: string }) => {
      const staff = staffMap.get(staffKey(s.staffType, s.staffId)) || null
      return {
        ...s,
        staff,
        staffName: staff?.fullName || '',
        staffEmployeeId: staff?.employeeId || '',
      }
    })

    return NextResponse.json({ structures: withStaff })
  } catch (error) {
    console.error('List salary structures error:', error)
    return internalError('listing salary structures')
  }
}

// POST /api/school/salary/structures - Create salary structure
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'salary:create')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to create salary structures.")
    }

    const body = await request.json()
    const {
      staffType,
      staffId,
      basicSalary,
      hra,
      da,
      ta,
      medicalAllowance,
      specialAllowance,
      pf,
      esi,
      tax,
      otherDeductions,
      standardDays,
      effectiveFrom,
    } = body

    if (!isStaffType(staffType) || !staffId || basicSalary === undefined) {
      return apiError(400, 'Please select a staff member and enter their basic salary amount.')
    }

    const staff = await resolveStaff(db, user.schoolId, staffType, staffId)
    if (!staff) {
      return apiError(404, "We couldn't find this staff member's record. They may have been removed.")
    }

    // One active structure per staff member (matches the unique constraint).
    const existing = await db.salaryStructure.findFirst({
      where: { schoolId: user.schoolId, staffType, staffId, deletedAt: null },
    })
    if (existing) {
      return apiError(
        409,
        `${staff.fullName} already has a salary structure. Please edit the existing one instead of creating a new one.`
      )
    }

    const basic = basicSalary || 0
    const hraVal = hra || 0
    const daVal = da || 0
    const taVal = ta || 0
    const medical = medicalAllowance || 0
    const special = specialAllowance || 0
    const pfVal = pf || 0
    const esiVal = esi || 0
    const taxVal = tax || 0
    const otherDed = otherDeductions || 0
    const days = standardDays && standardDays > 0 ? standardDays : 30

    const grossSalary = salaryRound(basic + hraVal + daVal + taVal + medical + special)
    const totalDeductions = salaryRound(pfVal + esiVal + taxVal + otherDed)
    const netSalary = salaryRound(grossSalary - totalDeductions)

    const auditContext = extractSalaryAuditContext(request, user.userId)

    const structure = await db.$transaction(async (tx: typeof db) => {
      const created = await tx.salaryStructure.create({
        data: {
          schoolId: user.schoolId!,
          staffType,
          staffId,
          basicSalary: basic,
          hra: hraVal,
          da: daVal,
          ta: taVal,
          medicalAllowance: medical,
          specialAllowance: special,
          pf: pfVal,
          esi: esiVal,
          tax: taxVal,
          otherDeductions: otherDed,
          grossSalary,
          netSalary,
          standardDays: days,
          effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        },
      })
      await logSalaryEvent(tx, user.schoolId!, 'SalaryStructure', created.id, 'created', null, created, {
        ...auditContext,
        staffType,
        staffId,
        diffSummary: `Created salary structure for ${staff.fullName}, net ${netSalary}`,
      })
      return created
    })

    return NextResponse.json({ ...structure, staff }, { status: 201 })
  } catch (error) {
    console.error('Create salary structure error:', error)
    return internalError('creating the salary structure')
  }
}
