/**
 * POST /api/school/students/[id]/transport/preview
 *
 * Dry-run for adding transport mid-year. Returns the billable-months list,
 * total fare, and any guardrail violations the cashier should see (active
 * allocation overlap, missing fare configuration). The UI calls this when
 * the cashier picks a route+stop+effectiveFrom to render the impact panel
 * before committing.
 *
 * Body: same as transport POST.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

const AY_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

function parseDate(s: unknown): Date | null {
  if (typeof s !== 'string' || !s.trim()) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}
function currentAcademicYear(today: Date): string {
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth() + 1
  return m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}
function parseFeeMonths(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const p = JSON.parse(value)
    return Array.isArray(p) ? p.filter((m): m is string => typeof m === 'string' && !!m.trim()) : []
  } catch {
    return value.split(',').map((m) => m.trim()).filter(Boolean)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'transport:allocation:update')
    if (!user || !user.schoolId) return unauthorizedError()

    const { id: studentId } = await params
    const body = await request.json().catch(() => ({}))

    const routeId = typeof body.routeId === 'string' && body.routeId.trim() ? body.routeId.trim() : null
    const stopName = typeof body.stopName === 'string' && body.stopName.trim() ? body.stopName.trim() : null
    if (!routeId || !stopName) return apiError(400, 'routeId and stopName are required')

    const today = new Date()
    const effectiveFrom = parseDate(body.effectiveFrom) || today
    const academicYear = currentAcademicYear(today)

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, 'Student not found')

    const activeAlloc = await db.transportAllocation.findFirst({
      where: { schoolId: user.schoolId, studentId, academicYear, isActive: true },
      select: { id: true, stopName: true, fareAmount: true },
    })

    const stopFare = await db.transportStopFare.findFirst({
      where: { schoolId: user.schoolId, routeId, academicYear, stopName, isActive: true },
      select: { fare: true, feeMonths: true },
    })
    let fareInfo = stopFare
    if (!fareInfo) {
      const route = await db.transportRoute.findFirst({
        where: { id: routeId, schoolId: user.schoolId, academicYear, deletedAt: null, isActive: true },
        select: { stops: true, feeMonths: true },
      })
      if (route?.stops) {
        try {
          const stops = JSON.parse(route.stops)
          if (Array.isArray(stops)) {
            const m = stops.find((s) => (typeof s === 'string' ? s === stopName : s?.name === stopName))
            if (m) {
              fareInfo = {
                fare: typeof m === 'object' && typeof m.fare === 'number' ? m.fare : 0,
                feeMonths: route.feeMonths,
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }
    if (!fareInfo) {
      return NextResponse.json({
        success: true,
        canCommit: false,
        blockers: ['No fare configured for this route+stop in the current academic year'],
        billableMonths: [],
        fare: 0,
        totalAmount: 0,
        academicYear,
      })
    }

    const allMonths = parseFeeMonths(fareInfo.feeMonths)
    const [startYearStr] = academicYear.split('-')
    const startYear = Number(startYearStr)
    const effYM = effectiveFrom.getUTCFullYear() * 12 + effectiveFrom.getUTCMonth()
    const monthLabelToYM = (label: string): number | null => {
      if (!Number.isFinite(startYear)) return null
      const idx = AY_MONTHS.findIndex((m) => m.toLowerCase() === label.toLowerCase())
      if (idx === -1) return null
      const calMonth = idx <= 8 ? idx + 3 : idx - 9
      const calYear = idx <= 8 ? startYear : startYear + 1
      return calYear * 12 + calMonth
    }
    const billableMonths = allMonths.filter((label) => {
      const ym = monthLabelToYM(label)
      return ym === null || ym >= effYM
    })

    const blockers: string[] = []
    if (activeAlloc) {
      blockers.push(
        `Student already has an active transport allocation (${activeAlloc.stopName}). Withdraw it before adding a new one.`,
      )
    }
    if (allMonths.length === 0) blockers.push('Route has no fee months configured')
    if (billableMonths.length === 0 && allMonths.length > 0) {
      blockers.push('Effective-from date is past every billing month — nothing to bill')
    }

    return NextResponse.json({
      success: true,
      canCommit: blockers.length === 0,
      blockers,
      billableMonths,
      droppedMonths: allMonths.filter((m) => !billableMonths.includes(m)),
      fare: fareInfo.fare,
      totalAmount: fareInfo.fare * billableMonths.length,
      academicYear,
      effectiveFrom: effectiveFrom.toISOString(),
    })
  } catch (error) {
    console.error('POST /students/[id]/transport/preview failed:', error)
    return internalError('Failed to preview transport addition')
  }
}
