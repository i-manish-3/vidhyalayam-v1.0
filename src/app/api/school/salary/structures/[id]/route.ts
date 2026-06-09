import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { resolveStaff, salaryRound } from '@/lib/salary/staff-resolver'
import { logSalaryEvent, extractSalaryAuditContext } from '@/lib/salary/audit'

// PATCH /api/school/salary/structures/[id] - Update a salary structure
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'salary:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to update salary structures.")
    }

    const { id } = await params
    const existing = await db.salaryStructure.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) {
      return notFoundError('SalaryStructure')
    }

    const body = await request.json()
    const num = (key: string, fallback: number) =>
      body[key] !== undefined && body[key] !== null ? Number(body[key]) : fallback

    const basicSalary = num('basicSalary', existing.basicSalary)
    const hra = num('hra', existing.hra)
    const da = num('da', existing.da)
    const ta = num('ta', existing.ta)
    const medicalAllowance = num('medicalAllowance', existing.medicalAllowance)
    const specialAllowance = num('specialAllowance', existing.specialAllowance)
    const pf = num('pf', existing.pf)
    const esi = num('esi', existing.esi)
    const tax = num('tax', existing.tax)
    const otherDeductions = num('otherDeductions', existing.otherDeductions)
    const standardDays = num('standardDays', existing.standardDays) || 30

    const grossSalary = salaryRound(basicSalary + hra + da + ta + medicalAllowance + specialAllowance)
    const netSalary = salaryRound(grossSalary - (pf + esi + tax + otherDeductions))

    const auditContext = extractSalaryAuditContext(request, user.userId)

    const updated = await db.$transaction(async (tx: typeof db) => {
      const result = await tx.salaryStructure.update({
        where: { id },
        data: {
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
          grossSalary,
          netSalary,
          effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : existing.effectiveFrom,
          isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing.isActive,
        },
      })
      await logSalaryEvent(tx, user.schoolId!, 'SalaryStructure', result.id, 'updated', existing, result, {
        ...auditContext,
        staffType: existing.staffType,
        staffId: existing.staffId,
        diffSummary: `Updated salary structure, net ${existing.netSalary} -> ${netSalary}`,
      })
      return result
    })

    const staff = await resolveStaff(db, user.schoolId, updated.staffType, updated.staffId)
    return NextResponse.json({ ...updated, staff })
  } catch (error) {
    console.error('Update salary structure error:', error)
    return internalError('updating the salary structure')
  }
}

// DELETE /api/school/salary/structures/[id] - Soft-delete a salary structure
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'salary:delete')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to delete salary structures.")
    }

    const { id } = await params
    const existing = await db.salaryStructure.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) {
      return notFoundError('SalaryStructure')
    }

    const auditContext = extractSalaryAuditContext(request, user.userId)

    await db.$transaction(async (tx: typeof db) => {
      await tx.salaryStructure.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      })
      await logSalaryEvent(tx, user.schoolId!, 'SalaryStructure', id, 'deleted', existing, null, {
        ...auditContext,
        staffType: existing.staffType,
        staffId: existing.staffId,
        diffSummary: 'Salary structure removed',
      })
    })

    return NextResponse.json({ message: 'Salary structure removed successfully.' })
  } catch (error) {
    console.error('Delete salary structure error:', error)
    return internalError('removing the salary structure')
  }
}
