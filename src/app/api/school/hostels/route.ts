import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, internalError, apiError } from '@/lib/api-errors'

const VALID_FEE_MONTHS = new Set(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

async function resolveAcademicYear(schoolId: string, value: string | null) {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const academicYear = (value || school?.academicYear || '').trim()
  return ACADEMIC_YEAR_PATTERN.test(academicYear) ? academicYear : null
}

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
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) return null
  const months = value.map((m) => (typeof m === 'string' ? m.trim() : '')).filter(Boolean)
  if (months.length === 0) return null
  if (months.some((m) => !VALID_FEE_MONTHS.has(m))) return null
  return Array.from(new Set(months))
}

export interface ParsedRoom {
  roomNumber: string
  roomType: string | null
  floor: string | null
  capacity: number
  fare: number
}

// Parse the rooms[] payload. Each room needs a unique roomNumber, an integer
// capacity >= 1 (the bed count), and a non-negative fare.
export function parseRooms(value: unknown): { rooms: ParsedRoom[] | null; error: string | null } {
  if (!Array.isArray(value)) return { rooms: null, error: 'Please provide a rooms list.' }
  const rooms: ParsedRoom[] = []
  for (let i = 0; i < value.length; i++) {
    const raw = value[i]
    if (!raw || typeof raw !== 'object') return { rooms: null, error: `Room #${i + 1} is invalid.` }
    const r = raw as Record<string, unknown>
    const roomNumber = optionalText(r.roomNumber)
    if (!roomNumber) return { rooms: null, error: `Room #${i + 1} needs a room number.` }
    const capacityRaw = optionalNumber(r.capacity)
    if (capacityRaw === null || Number.isNaN(capacityRaw) || !Number.isInteger(capacityRaw) || capacityRaw < 1) {
      return { rooms: null, error: `Room ${roomNumber} needs a whole-number capacity of at least 1.` }
    }
    const fareRaw = optionalNumber(r.fare)
    if (fareRaw === null || Number.isNaN(fareRaw) || fareRaw < 0) {
      return { rooms: null, error: `Room ${roomNumber} needs a non-negative fare.` }
    }
    rooms.push({
      roomNumber,
      roomType: optionalText(r.roomType),
      floor: optionalText(r.floor),
      capacity: capacityRaw,
      fare: fareRaw,
    })
  }
  if (rooms.length === 0) return { rooms: null, error: 'Please add at least one room.' }
  const numbers = rooms.map((r) => r.roomNumber.toLowerCase())
  if (new Set(numbers).size !== numbers.length) {
    return { rooms: null, error: 'Two or more rooms share the same room number.' }
  }
  return { rooms, error: null }
}

// GET /api/school/hostels?academicYear= - List hostels with rooms, beds, and
// the requested year's room fares + active-allocation occupancy.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()
    const authorized = await requirePermission(request, 'hostel:read')
    if (!authorized) return forbiddenError()

    const { searchParams } = new URL(request.url)
    const academicYear = await resolveAcademicYear(user.schoolId, searchParams.get('academicYear'))

    // A hostel belongs to the requested year if its own tag matches OR it has at
    // least one active HostelRoomFare for that year (hostels copied via Annual
    // Setup keep their original tag but gain per-year fares).
    let hostelIdsWithActiveFares: string[] = []
    if (academicYear) {
      const fareHostels = await db.hostelRoomFare.findMany({
        where: { schoolId: user.schoolId, academicYear, isActive: true },
        select: { hostelId: true },
        distinct: ['hostelId'],
      })
      hostelIdsWithActiveFares = fareHostels.map((h) => h.hostelId)
    }

    const hostels = await db.hostel.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        ...(academicYear
          ? {
              OR: [
                { academicYear },
                ...(hostelIdsWithActiveFares.length > 0 ? [{ id: { in: hostelIdsWithActiveFares } }] : []),
              ],
            }
          : {}),
      },
      include: {
        rooms: {
          where: { deletedAt: null },
          orderBy: { roomNumber: 'asc' },
          include: {
            beds: { where: { deletedAt: null }, orderBy: { bedNumber: 'asc' } },
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    const hostelIds = hostels.map((h) => h.id)
    const roomIds = hostels.flatMap((h) => h.rooms.map((r) => r.id))

    // Per-year fares for the listed rooms.
    const fares = academicYear && roomIds.length > 0
      ? await db.hostelRoomFare.findMany({
          where: { schoolId: user.schoolId, roomId: { in: roomIds }, academicYear, isActive: true },
        })
      : []
    const fareByRoom = new Map(fares.map((f) => [f.roomId, f]))

    // Active-allocation occupancy per bed for the requested year.
    const occupancy = academicYear && hostelIds.length > 0
      ? await db.hostelAllocation.findMany({
          where: { schoolId: user.schoolId, hostelId: { in: hostelIds }, academicYear, isActive: true },
          select: { bedId: true, roomId: true },
        })
      : []
    const occupiedBeds = new Set(occupancy.map((o) => o.bedId))
    const occupiedByRoom = new Map<string, number>()
    for (const o of occupancy) {
      occupiedByRoom.set(o.roomId, (occupiedByRoom.get(o.roomId) || 0) + 1)
    }

    const shaped = hostels.map((hostel) => ({
      ...hostel,
      rooms: hostel.rooms.map((room) => {
        const fare = fareByRoom.get(room.id)
        return {
          ...room,
          fare: fare?.fare ?? null,
          feeMonths: fare?.feeMonths ?? hostel.feeMonths,
          occupiedCount: occupiedByRoom.get(room.id) || 0,
          beds: room.beds.map((bed) => ({ ...bed, occupied: occupiedBeds.has(bed.id) })),
        }
      }),
    }))

    return NextResponse.json({ hostels: shaped })
  } catch (error) {
    console.error('List hostels error:', error)
    return internalError('listing hostels')
  }
}

// POST /api/school/hostels - Create a hostel with rooms, beds, and per-year fares.
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()
    const authorized = await requirePermission(request, 'hostel:create')
    if (!authorized) return forbiddenError()

    const body = await request.json()
    const name = optionalText(body.name)
    if (!name) return apiError(400, 'Please enter a hostel name.')

    const academicYear = optionalText(body.academicYear)
    if (!academicYear || !ACADEMIC_YEAR_PATTERN.test(academicYear)) {
      return apiError(400, 'Please choose a valid academic year.')
    }
    const yearExists = await db.academicYear.findFirst({
      where: { schoolId: user.schoolId, name: academicYear, isActive: true, deletedAt: null },
      select: { id: true },
    })
    if (!yearExists) return apiError(400, 'Please choose an active academic year from school settings.')

    const feeMonths = parseFeeMonths(body.feeMonths)
    if (!feeMonths || feeMonths.length === 0) {
      return apiError(400, 'Please select at least one fee month.')
    }

    const { rooms, error: roomError } = parseRooms(body.rooms)
    if (roomError || !rooms) return apiError(400, roomError || 'Invalid rooms.')

    const feeMonthsJson = JSON.stringify(feeMonths)

    const created = await db.$transaction(async (tx) => {
      const hostel = await tx.hostel.create({
        data: {
          schoolId: user.schoolId!,
          name,
          type: optionalText(body.type),
          academicYear,
          feeMonths: feeMonthsJson,
          wardenName: optionalText(body.wardenName),
          wardenPhone: optionalText(body.wardenPhone),
          address: optionalText(body.address),
          isActive: typeof body.isActive === 'boolean' ? body.isActive : true,
        },
        select: { id: true },
      })

      for (const room of rooms) {
        const roomRow = await tx.hostelRoom.create({
          data: {
            schoolId: user.schoolId!,
            hostelId: hostel.id,
            roomNumber: room.roomNumber,
            roomType: room.roomType,
            floor: room.floor,
            capacity: room.capacity,
            isActive: true,
          },
          select: { id: true },
        })
        for (let b = 1; b <= room.capacity; b++) {
          await tx.hostelBed.create({
            data: {
              schoolId: user.schoolId!,
              hostelId: hostel.id,
              roomId: roomRow.id,
              bedNumber: `${room.roomNumber}-${b}`,
              isActive: true,
            },
          })
        }
        await tx.hostelRoomFare.create({
          data: {
            schoolId: user.schoolId!,
            hostelId: hostel.id,
            roomId: roomRow.id,
            academicYear,
            fare: room.fare,
            feeMonths: feeMonthsJson,
            isActive: true,
          },
        })
      }

      return hostel
    })

    return NextResponse.json({ id: created.id }, { status: 201 })
  } catch (error) {
    console.error('Create hostel error:', error)
    return internalError('creating the hostel')
  }
}
