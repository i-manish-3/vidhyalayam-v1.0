import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import {
  forbiddenError,
  internalError,
  unauthorizedError,
} from '@/lib/api-errors'

// GET /api/school/fees/assignments/eligible-for-group-change
// Lists active fee assignments where no payment has been collected against any
// linked invoice. Used by the Change Fee Group page.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SCHOOL_ADMIN') {
      const authorized = await requirePermission(request, 'fees:change-group')
      if (!authorized) {
        return forbiddenError("You don't have permission to change fee groups. Contact your school administrator.")
      }
    }

    const { searchParams } = new URL(request.url)
    const academicYear = searchParams.get('academicYear') || ''
    const schoolId = user.schoolId

    const assignments = await db.studentFeeAssignment.findMany({
      where: {
        schoolId,
        status: 'active',
        deletedAt: null,
        ...(academicYear ? { academicYear } : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
          },
        },
        feesGroup: { select: { id: true, name: true } },
        invoices: {
          where: { deletedAt: null },
          select: {
            id: true,
            totalAmount: true,
            paidAmount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Read the persisted billing mode (full_year | pro_rated) from each
    // assignment snapshot so the UI can offer a "Bill Full Year" fix for
    // pro-rated demands. Older rows without the field default to 'pro_rated'.
    const resolveBillingMode = (snapshotJson: string | null): 'full_year' | 'pro_rated' => {
      if (!snapshotJson) return 'pro_rated'
      try {
        return JSON.parse(snapshotJson)?.billingMode === 'full_year' ? 'full_year' : 'pro_rated'
      } catch {
        return 'pro_rated'
      }
    }

    // Filter to only those with zero paid amount across all invoices.
    // (Invoice.paidAmount is the authoritative payment total per invoice.)
    const zeroPaid = assignments.filter((assignment) => {
      const totalPaid = assignment.invoices.reduce((sum, invoice) => sum + (invoice.paidAmount || 0), 0)
      return totalPaid === 0
    })

    // For each row, resolve which fees groups have a valid active FeesStructure
    // for that student's (class, section, academicYear). Only these should be
    // offered as switch targets in the dialog.
    const lookupKey = (classId: string | null, sectionId: string | null, year: string) =>
      `${classId || ''}|${sectionId || ''}|${year}`

    const lookupCache = new Map<string, { id: string; name: string }[]>()

    async function resolveGroupsFor(classId: string | null, sectionId: string | null, year: string) {
      const key = lookupKey(classId, sectionId, year)
      const cached = lookupCache.get(key)
      if (cached) return cached
      if (!classId) {
        lookupCache.set(key, [])
        return []
      }
      const structures = await db.feesStructure.findMany({
        where: {
          schoolId,
          classId,
          academicYear: year,
          isActive: true,
          status: 'active',
          deletedAt: null,
          OR: [{ sectionId: sectionId || null }, { sectionId: null }],
        },
        select: {
          feesGroup: { select: { id: true, name: true } },
        },
      })
      const unique = new Map<string, { id: string; name: string }>()
      for (const structure of structures) {
        if (structure.feesGroup) unique.set(structure.feesGroup.id, structure.feesGroup)
      }
      const result = Array.from(unique.values())
      lookupCache.set(key, result)
      return result
    }

    const eligible = await Promise.all(
      zeroPaid.map(async (assignment) => {
        const availableGroups = (
          await resolveGroupsFor(assignment.classId, assignment.sectionId, assignment.academicYear)
        ).filter((group) => group.id !== assignment.feesGroupId)

        return {
          id: assignment.id,
          academicYear: assignment.academicYear,
          feesGroupId: assignment.feesGroupId,
          feesGroupName: assignment.feesGroup?.name || null,
          classId: assignment.classId,
          sectionId: assignment.sectionId,
          student: assignment.student
            ? {
                id: assignment.student.id,
                firstName: assignment.student.firstName,
                lastName: assignment.student.lastName,
                admissionNumber: assignment.student.admissionNumber,
                className: assignment.student.class?.name || null,
                sectionName: assignment.student.section?.name || null,
              }
            : null,
          totalAmount: assignment.invoices.reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0),
          billingMode: resolveBillingMode(assignment.snapshotJson),
          availableGroups,
        }
      })
    )

    return NextResponse.json({ assignments: eligible })
  } catch (error) {
    console.error('List eligible assignments error:', error)
    return internalError('listing eligible fee assignments')
  }
}
