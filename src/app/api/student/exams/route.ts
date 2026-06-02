// GET /api/student/exams - Get exam results for the logged-in student
// Phase 1 stub — replaced by GET /api/students/me/results (new contract) in Phase 5.
// Returns empty until the new result publishing flow is wired.
import { NextRequest, NextResponse } from 'next/server'

export async function GET(_request: NextRequest) {
  return NextResponse.json({ results: [], upcomingExams: [] })
}
