import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/transport/routes - List routes
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const routes = await db.transportRoute.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: { allocations: { where: { isActive: true } } },
        },
      },
      orderBy: { routeName: 'asc' },
    })

    return NextResponse.json({ routes })
  } catch (error) {
    console.error('List transport routes error:', error)
    return internalError('listing transport routes')
  }
}

// POST /api/school/transport/routes - Create route
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const {
      routeName,
      routeNumber,
      startPoint,
      endPoint,
      stops,
      distance,
      driverName,
      driverPhone,
      vehicleNumber,
      capacity,
      fee,
    } = body

    if (!routeName) {
      return apiError(400, 'Please enter a name for this transport route.')
    }

    const route = await db.transportRoute.create({
      data: {
        schoolId: user.schoolId,
        routeName,
        routeNumber,
        startPoint,
        endPoint,
        stops: stops ? JSON.stringify(stops) : null,
        distance,
        driverName,
        driverPhone,
        vehicleNumber,
        capacity: capacity || 40,
        fee: fee || 0,
      },
    })

    return NextResponse.json(route, { status: 201 })
  } catch (error) {
    console.error('Create transport route error:', error)
    return internalError('creating the transport route')
  }
}
