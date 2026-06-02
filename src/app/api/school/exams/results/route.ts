import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/exams/results - Get exam results
// Phase 1 stub — replaced by GET /api/school/exams/[id]/results (new contract) in Phase 4.
export async function GET(_request: NextRequest) {
  return NextResponse.json({ results: [] })
}

// POST /api/school/exams/results - Submit exam result
// Phase 1 stub — replaced by MarksEntry + result computation APIs in Phase 3/4.
export async function POST(_request: NextRequest) {
  return NextResponse.json({ message: 'Legacy result submission is deprecated. Use marks entry + compute-result APIs.', }, { status: 410 })
}
