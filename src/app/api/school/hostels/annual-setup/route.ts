import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, internalError, apiError } from '@/lib/api-errors'

const VALID_FEE_MONTHS = new Set(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : Number.NaN
}

function parseFeeMonths(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const months = value.map((m) => (typeof m === 'string' ? m.trim() : '')).filter(Boolean)
  if (months.length === 0) return null
  if (months.some((m) => !VALID_FEE_MONTHS.has(m))) return null
  return Array.from(new Set(months))
}

// A room fare entry inside a copy/create hostel.
function parseRoomFares(value: unknown): Array<{ roomId?: string; roomNumber: string; roomType: string | null; floor: string | null; capacity: number; fare: number }> | null {
  if (!Array.isArray(value)) return null
  const rooms = value.map((room) => {
    if (!room || typeof room !== 'object') return null
    const r = room as Record<string, unknown>
    const roomNumber = optionalText(r.roomNumber) || ''
    const fare = optionalNumber(r.fare)
    const capacityRaw = optionalNumber(r.capacity)
    const capacity = capacityRaw !== null && Number.isInteger(capacityRaw) && capacityRaw >= 1 ? capacityRaw : 1
    if (!roomNumber || fare === null || Number.isNaN(fare) || fare < 0) return null
    return {
      roomId: optionalText(r.roomId) || undefined,
      roomNumber,
      roomType: optionalText(r.roomType),
      floor: optionalText(r.floor),
      capacity,
      fare,
    }
  })
  if (rooms.some((r) => r === null)) return null
  return rooms as NonNullable<(typeof rooms)[number]>[]
}

type HostelEntry =
  | { mode: 'copy'; hostelId: string; rooms: NonNullable<ReturnType<typeof parseRoomFares>>; feeMonths: string[] }
  | {
      mode: 'create'
      name: string
      type: string | null
      wardenName: string | null
      wardenPhone: string | null
      rooms: NonNullable<ReturnType<typeof parseRoomFares>>
      feeMonths: string[]
    }
  | { mode: 'discontinue'; hostelId: string }

function parseHostelEntry(raw: unknown): { entry: HostelEntry | null; error: string | null } {
  if (!raw || typeof raw !== 'object') return { entry: null, error: 'Each hostel entry must be an object.' }
  const r = raw as Record<string, unknown>
  const mode = typeof r.mode === 'string' ? r.mode : ''

  if (mode === 'discontinue') {
    const hostelId = optionalText(r.hostelId)
    if (!hostelId) return { entry: null, error: 'Discontinue entries require a hostelId.' }
    return { entry: { mode: 'discontinue', hostelId }, error: null }
  }

  if (mode === 'copy') {
    const hostelId = optionalText(r.hostelId)
    if (!hostelId) return { entry: null, error: 'Copy entries require a hostelId.' }
    const rooms = parseRoomFares(r.rooms)
    if (!rooms || rooms.length === 0) return { entry: null, error: 'Copy entries need at least one room with a non-negative fare.' }
    const feeMonths = parseFeeMonths(r.feeMonths)
    if (!feeMonths) return { entry: null, error: 'Copy entries need at least one valid fee month.' }
    return { entry: { mode: 'copy', hostelId, rooms, feeMonths }, error: null }
  }

  if (mode === 'create') {
    const name = optionalText(r.name)
    if (!name) return { entry: null, error: 'New hostel entries require a name.' }
    const rooms = parseRoomFares(r.rooms)
    if (!rooms || rooms.length === 0) return { entry: null, error: 'New hostels need at least one room with a non-negative fare.' }
    const feeMonths = parseFeeMonths(r.feeMonths)
    if (!feeMonths) return { entry: null, error: 'New hostels need at least one valid fee month.' }
    return {
      entry: {
        mode: 'create',
        name,
        type: optionalText(r.type),
        wardenName: optionalText(r.wardenName),
        wardenPhone: optionalText(r.wardenPhone),
        rooms,
        feeMonths,
      },
      error: null,
    }
  }

  return { entry: null, error: `Unknown mode "${mode}". Expected copy, create or discontinue.` }
}

// POST /api/school/hostels/annual-setup
// Bulk-configure hostel room fares for a target academic year. Three modes per
// hostel, mirroring the transport annual setup:
//   - copy: existing hostel, upsert room fares for target year
//   - create: new Hostel (+ rooms + beds) tagged target year + room fares
//   - discontinue: existing hostel, deactivate all its room fares for target year
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()
    const authorized = await requirePermission(request, 'hostel:annual-setup')
    if (!authorized) {
      return forbiddenError("You don't have permission to run the annual hostel setup. Contact your school administrator.")
    }

    const body = await request.json()
    const fromAcademicYear = optionalText(body.fromAcademicYear)
    const toAcademicYear = optionalText(body.toAcademicYear)

    if (!fromAcademicYear || !ACADEMIC_YEAR_PATTERN.test(fromAcademicYear)) {
      return apiError(400, 'Please choose a valid source academic year.')
    }
    if (!toAcademicYear || !ACADEMIC_YEAR_PATTERN.test(toAcademicYear)) {
      return apiError(400, 'Please choose a valid target academic year.')
    }
    if (fromAcademicYear === toAcademicYear) {
      return apiError(400, 'Source and target academic years must be different.')
    }

    const [fromYearExists, toYearExists] = await Promise.all([
      db.academicYear.findFirst({ where: { schoolId: user.schoolId, name: fromAcademicYear, deletedAt: null }, select: { id: true } }),
      db.academicYear.findFirst({ where: { schoolId: user.schoolId, name: toAcademicYear, isActive: true, deletedAt: null }, select: { id: true } }),
    ])
    if (!fromYearExists) return apiError(400, 'The source academic year was not found for this school.')
    if (!toYearExists) return apiError(400, 'The target academic year must be an active session. Please activate it in Settings first.')

    if (!Array.isArray(body.hostels)) {
      return apiError(400, 'Please provide a hostels list describing what to copy, create or discontinue.')
    }
    if (body.hostels.length === 0) {
      return apiError(400, 'Please include at least one hostel entry.')
    }

    const parsed: HostelEntry[] = []
    for (let i = 0; i < body.hostels.length; i++) {
      const { entry, error } = parseHostelEntry(body.hostels[i])
      if (error || !entry) return apiError(400, `Hostel entry #${i + 1}: ${error || 'invalid'}`)
      parsed.push(entry)
    }

    // Validate referenced hostels + their rooms exist for this school.
    const referencedHostelIds = Array.from(
      new Set(parsed.flatMap((e) => (e.mode === 'copy' || e.mode === 'discontinue' ? [e.hostelId] : [])))
    )
    const existingHostels = referencedHostelIds.length > 0
      ? await db.hostel.findMany({
          where: { id: { in: referencedHostelIds }, schoolId: user.schoolId, deletedAt: null },
          select: { id: true },
        })
      : []
    const existingHostelIds = new Set(existingHostels.map((h) => h.id))
    const missing = referencedHostelIds.filter((id) => !existingHostelIds.has(id))
    if (missing.length > 0) {
      return apiError(400, 'Some referenced hostels no longer exist. Please refresh and try again.')
    }

    let hostelsCreated = 0
    let hostelsCopied = 0
    let hostelsDiscontinued = 0
    let roomFaresUpserted = 0
    let roomFaresDeactivated = 0

    await db.$transaction(async (tx) => {
      for (const entry of parsed) {
        if (entry.mode === 'discontinue') {
          const result = await tx.hostelRoomFare.updateMany({
            where: { hostelId: entry.hostelId, schoolId: user.schoolId!, academicYear: toAcademicYear, isActive: true },
            data: { isActive: false },
          })
          roomFaresDeactivated += result.count
          hostelsDiscontinued += 1
          continue
        }

        const feeMonthsJson = JSON.stringify(entry.feeMonths)
        let hostelId: string

        if (entry.mode === 'create') {
          const newHostel = await tx.hostel.create({
            data: {
              schoolId: user.schoolId!,
              name: entry.name,
              type: entry.type,
              academicYear: toAcademicYear,
              feeMonths: feeMonthsJson,
              wardenName: entry.wardenName,
              wardenPhone: entry.wardenPhone,
              isActive: true,
            },
            select: { id: true },
          })
          hostelId = newHostel.id
          // Create rooms + beds for the new hostel.
          for (const room of entry.rooms) {
            const roomRow = await tx.hostelRoom.create({
              data: { schoolId: user.schoolId!, hostelId, roomNumber: room.roomNumber, roomType: room.roomType, floor: room.floor, capacity: room.capacity, isActive: true },
              select: { id: true },
            })
            for (let b = 1; b <= room.capacity; b++) {
              await tx.hostelBed.create({
                data: { schoolId: user.schoolId!, hostelId, roomId: roomRow.id, bedNumber: `${room.roomNumber}-${b}`, isActive: true },
              })
            }
            await tx.hostelRoomFare.create({
              data: { schoolId: user.schoolId!, hostelId, roomId: roomRow.id, academicYear: toAcademicYear, fare: room.fare, feeMonths: feeMonthsJson, isActive: true },
            })
            roomFaresUpserted += 1
          }
          hostelsCreated += 1
          continue
        }

        // copy mode: upsert fares for existing rooms (matched by roomId) for the target year.
        hostelId = entry.hostelId
        const roomIds = entry.rooms.map((r) => r.roomId).filter((x): x is string => !!x)
        const validRooms = roomIds.length > 0
          ? await tx.hostelRoom.findMany({ where: { id: { in: roomIds }, hostelId, schoolId: user.schoolId!, deletedAt: null }, select: { id: true } })
          : []
        const validRoomIds = new Set(validRooms.map((r) => r.id))

        // Deactivate any prior fares for (hostel, target year) whose room isn't in this batch.
        await tx.hostelRoomFare.updateMany({
          where: { hostelId, schoolId: user.schoolId!, academicYear: toAcademicYear, roomId: { notIn: Array.from(validRoomIds) }, isActive: true },
          data: { isActive: false },
        })

        for (const room of entry.rooms) {
          if (!room.roomId || !validRoomIds.has(room.roomId)) continue
          await tx.hostelRoomFare.upsert({
            where: { roomId_academicYear: { roomId: room.roomId, academicYear: toAcademicYear } },
            create: { schoolId: user.schoolId!, hostelId, roomId: room.roomId, academicYear: toAcademicYear, fare: room.fare, feeMonths: feeMonthsJson, isActive: true },
            update: { fare: room.fare, feeMonths: feeMonthsJson, isActive: true },
          })
          roomFaresUpserted += 1
        }
        hostelsCopied += 1
      }
    })

    return NextResponse.json({
      fromAcademicYear,
      toAcademicYear,
      summary: { hostelsCreated, hostelsCopied, hostelsDiscontinued, roomFaresUpserted, roomFaresDeactivated },
      message:
        `Annual hostel setup complete for ${toAcademicYear}. ` +
        `${hostelsCreated} new hostel(s), ${hostelsCopied} updated, ${hostelsDiscontinued} discontinued. ` +
        `${roomFaresUpserted} room fare(s) saved, ${roomFaresDeactivated} deactivated.`,
    }, { status: 200 })
  } catch (error) {
    console.error('Annual hostel setup error:', error)
    return internalError('running the annual hostel setup')
  }
}
