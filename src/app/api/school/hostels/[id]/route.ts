import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, notFoundError, internalError, apiError } from '@/lib/api-errors'

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
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) return null
  const months = value.map((m) => (typeof m === 'string' ? m.trim() : '')).filter(Boolean)
  if (months.length === 0) return null
  if (months.some((m) => !VALID_FEE_MONTHS.has(m))) return null
  return Array.from(new Set(months))
}

// GET /api/school/hostels/[id]?academicYear= - Full hostel with rooms/beds/fares.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()
    const authorized = await requirePermission(request, 'hostel:read')
    if (!authorized) return forbiddenError()

    const { id } = await params
    const url = new URL(request.url)
    const academicYear = optionalText(url.searchParams.get('academicYear'))

    const hostel = await db.hostel.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: {
        rooms: {
          where: { deletedAt: null },
          orderBy: { roomNumber: 'asc' },
          include: { beds: { where: { deletedAt: null }, orderBy: { bedNumber: 'asc' } } },
        },
      },
    })
    if (!hostel) return notFoundError('Hostel')

    const roomIds = hostel.rooms.map((r) => r.id)
    const year = academicYear || hostel.academicYear
    const fares = roomIds.length > 0
      ? await db.hostelRoomFare.findMany({
          where: { schoolId: user.schoolId, roomId: { in: roomIds }, academicYear: year, isActive: true },
        })
      : []
    const fareByRoom = new Map(fares.map((f) => [f.roomId, f]))
    const occupancy = await db.hostelAllocation.findMany({
      where: { schoolId: user.schoolId, hostelId: id, academicYear: year, isActive: true },
      select: { bedId: true },
    })
    const occupiedBeds = new Set(occupancy.map((o) => o.bedId))

    return NextResponse.json({
      hostel: {
        ...hostel,
        rooms: hostel.rooms.map((room) => ({
          ...room,
          fare: fareByRoom.get(room.id)?.fare ?? null,
          feeMonths: fareByRoom.get(room.id)?.feeMonths ?? hostel.feeMonths,
          beds: room.beds.map((bed) => ({ ...bed, occupied: occupiedBeds.has(bed.id) })),
        })),
      },
    })
  } catch (error) {
    console.error('Get hostel error:', error)
    return internalError('loading the hostel')
  }
}

// PATCH /api/school/hostels/[id] - Update hostel fields, per-room fares (for the
// given academicYear), add new rooms/beds, and adjust capacity. Capacity
// decreases only remove UNOCCUPIED beds; the request is rejected otherwise.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()
    const authorized = await requirePermission(request, 'hostel:update')
    if (!authorized) return forbiddenError()

    const { id } = await params
    const schoolId = user.schoolId
    const body = await request.json()

    const existing = await db.hostel.findFirst({
      where: { id, schoolId, deletedAt: null },
      include: { rooms: { where: { deletedAt: null }, include: { beds: { where: { deletedAt: null } } } } },
    })
    if (!existing) return notFoundError('Hostel')

    const academicYear = optionalText(body.academicYear) || existing.academicYear
    if (!ACADEMIC_YEAR_PATTERN.test(academicYear)) {
      return apiError(400, 'Please choose a valid academic year.')
    }

    const feeMonths = body.feeMonths !== undefined ? parseFeeMonths(body.feeMonths) : null
    if (body.feeMonths !== undefined && (!feeMonths || feeMonths.length === 0)) {
      return apiError(400, 'Please select at least one fee month.')
    }
    const feeMonthsJson = JSON.stringify(feeMonths || parseFeeMonths(existing.feeMonths) || [])

    // Validate rooms payload upfront (if provided).
    const roomsInput: unknown = body.rooms
    if (roomsInput !== undefined && !Array.isArray(roomsInput)) {
      return apiError(400, 'rooms must be a list.')
    }

    const existingRoomById = new Map(existing.rooms.map((r) => [r.id, r]))
    const occupancy = await db.hostelAllocation.findMany({
      where: { schoolId, hostelId: id, academicYear, isActive: true },
      select: { bedId: true, roomId: true },
    })
    const occupiedBedIds = new Set(occupancy.map((o) => o.bedId))

    await db.$transaction(async (tx) => {
      const hostelUpdate: Record<string, unknown> = {}
      if (body.name !== undefined) hostelUpdate.name = optionalText(body.name) || existing.name
      if (body.type !== undefined) hostelUpdate.type = optionalText(body.type)
      if (body.wardenName !== undefined) hostelUpdate.wardenName = optionalText(body.wardenName)
      if (body.wardenPhone !== undefined) hostelUpdate.wardenPhone = optionalText(body.wardenPhone)
      if (body.address !== undefined) hostelUpdate.address = optionalText(body.address)
      if (body.isActive !== undefined) hostelUpdate.isActive = !!body.isActive
      if (body.feeMonths !== undefined) hostelUpdate.feeMonths = feeMonthsJson
      if (Object.keys(hostelUpdate).length > 0) {
        await tx.hostel.update({ where: { id }, data: hostelUpdate })
      }

      if (Array.isArray(roomsInput)) {
        for (const raw of roomsInput) {
          if (!raw || typeof raw !== 'object') continue
          const r = raw as Record<string, unknown>
          const roomId = optionalText(r.id)
          const roomNumber = optionalText(r.roomNumber)
          const roomType = optionalText(r.roomType)
          const floor = optionalText(r.floor)
          const fareRaw = optionalNumber(r.fare)
          const capacityRaw = optionalNumber(r.capacity)

          if (roomId && existingRoomById.has(roomId)) {
            // Update existing room.
            const room = existingRoomById.get(roomId)!
            const roomData: Record<string, unknown> = {}
            if (roomType !== undefined) roomData.roomType = roomType
            if (floor !== undefined) roomData.floor = floor

            // Capacity adjustment via bed add/remove.
            if (capacityRaw !== null && Number.isInteger(capacityRaw) && capacityRaw >= 1) {
              const activeBeds = room.beds
              const current = activeBeds.length
              if (capacityRaw > current) {
                for (let b = current + 1; b <= capacityRaw; b++) {
                  await tx.hostelBed.create({
                    data: {
                      schoolId, hostelId: id, roomId: room.id,
                      bedNumber: `${room.roomNumber}-${b}`, isActive: true,
                    },
                  })
                }
                roomData.capacity = capacityRaw
              } else if (capacityRaw < current) {
                // Remove only unoccupied beds, highest-numbered first.
                const removable = activeBeds
                  .filter((bed) => !occupiedBedIds.has(bed.id))
                  .sort((a, b) => b.bedNumber.localeCompare(a.bedNumber, undefined, { numeric: true }))
                const toRemove = current - capacityRaw
                if (removable.length < toRemove) {
                  throw new RoomCapacityError(room.roomNumber)
                }
                const removeIds = removable.slice(0, toRemove).map((b) => b.id)
                await tx.hostelBed.updateMany({
                  where: { id: { in: removeIds } },
                  data: { isActive: false, deletedAt: new Date() },
                })
                roomData.capacity = capacityRaw
              }
            }
            if (Object.keys(roomData).length > 0) {
              await tx.hostelRoom.update({ where: { id: room.id }, data: roomData })
            }
            // Sync this room's fare for the year.
            if (fareRaw !== null && !Number.isNaN(fareRaw) && fareRaw >= 0) {
              await tx.hostelRoomFare.upsert({
                where: { roomId_academicYear: { roomId: room.id, academicYear } },
                create: { schoolId, hostelId: id, roomId: room.id, academicYear, fare: fareRaw, feeMonths: feeMonthsJson, isActive: true },
                update: { fare: fareRaw, feeMonths: feeMonthsJson, isActive: true },
              })
            }
          } else if (roomNumber) {
            // New room.
            const capacity = capacityRaw !== null && Number.isInteger(capacityRaw) && capacityRaw >= 1 ? capacityRaw : 1
            const fare = fareRaw !== null && !Number.isNaN(fareRaw) && fareRaw >= 0 ? fareRaw : 0
            const newRoom = await tx.hostelRoom.create({
              data: { schoolId, hostelId: id, roomNumber, roomType, floor, capacity, isActive: true },
              select: { id: true },
            })
            for (let b = 1; b <= capacity; b++) {
              await tx.hostelBed.create({
                data: { schoolId, hostelId: id, roomId: newRoom.id, bedNumber: `${roomNumber}-${b}`, isActive: true },
              })
            }
            await tx.hostelRoomFare.create({
              data: { schoolId, hostelId: id, roomId: newRoom.id, academicYear, fare, feeMonths: feeMonthsJson, isActive: true },
            })
          }
        }
      }
    })

    return NextResponse.json({ message: 'Hostel has been updated successfully.' })
  } catch (error) {
    if (error instanceof RoomCapacityError) {
      return apiError(400, `Room ${error.roomNumber}: cannot reduce capacity below the number of occupied beds. Discontinue those students' hostel allocation first.`)
    }
    console.error('Update hostel error:', error)
    return internalError('updating the hostel')
  }
}

class RoomCapacityError extends Error {
  constructor(public roomNumber: string) {
    super('ROOM_CAPACITY')
    this.name = 'RoomCapacityError'
  }
}

// DELETE /api/school/hostels/[id]?academicYear=YYYY-YYYY
// Year-scoped soft delete (mirrors transport routes): deactivates the year's
// HostelRoomFare + HostelAllocation rows, re-anchors the hostel to another year
// with active data, or soft-deletes the hostel when nothing remains.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()
    const authorized = await requirePermission(request, 'hostel:delete')
    if (!authorized) return forbiddenError()

    const { id } = await params
    const schoolId = user.schoolId
    const url = new URL(request.url)
    const academicYear = optionalText(url.searchParams.get('academicYear'))
    if (academicYear && !ACADEMIC_YEAR_PATTERN.test(academicYear)) {
      return apiError(400, 'Please provide a valid academic year (YYYY-YYYY).')
    }

    const existing = await db.hostel.findFirst({ where: { id, schoolId, deletedAt: null } })
    if (!existing) return notFoundError('Hostel')

    if (!academicYear) {
      const [activeFareCount, activeAllocCount] = await Promise.all([
        db.hostelRoomFare.count({ where: { hostelId: id, isActive: true } }),
        db.hostelAllocation.count({ where: { hostelId: id, isActive: true } }),
      ])
      if (activeFareCount + activeAllocCount > 0) {
        return apiError(
          400,
          'This hostel has data in one or more academic years. Switch to that academic year and delete from there to keep history intact.',
        )
      }
      await db.hostel.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
      return NextResponse.json({ message: `Hostel "${existing.name}" has been deleted successfully.` })
    }

    await db.$transaction(async (tx) => {
      await tx.hostelRoomFare.updateMany({
        where: { hostelId: id, schoolId, academicYear, isActive: true },
        data: { isActive: false },
      })
      await tx.hostelAllocation.updateMany({
        where: { hostelId: id, schoolId, academicYear, isActive: true },
        data: { isActive: false },
      })

      if (existing.academicYear === academicYear) {
        const remainingFare = await tx.hostelRoomFare.findFirst({
          where: { hostelId: id, isActive: true, academicYear: { not: academicYear } },
          orderBy: { academicYear: 'desc' },
          select: { academicYear: true },
        })
        const remainingAlloc = remainingFare
          ? null
          : await tx.hostelAllocation.findFirst({
              where: { hostelId: id, isActive: true, academicYear: { not: academicYear } },
              orderBy: { academicYear: 'desc' },
              select: { academicYear: true },
            })
        const reanchorTo = remainingFare?.academicYear || remainingAlloc?.academicYear || null
        if (reanchorTo) {
          await tx.hostel.update({ where: { id }, data: { academicYear: reanchorTo } })
        } else {
          await tx.hostel.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
        }
      }
    })

    return NextResponse.json({ message: `Hostel "${existing.name}" removed from ${academicYear}. Past sessions are unaffected.` })
  } catch (error) {
    console.error('Delete hostel error:', error)
    return internalError('deleting the hostel')
  }
}
