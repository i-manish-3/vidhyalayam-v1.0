import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/platform/branding — public (the login screen reads it before auth).
// Returns only the safe, display-facing branding fields.
export async function GET() {
  try {
    const branding = await db.platformBranding.findUnique({ where: { id: 'singleton' } })
    return NextResponse.json({ logo: branding?.logo ?? null })
  } catch (error) {
    console.error('Get platform branding error:', error)
    // Branding is non-critical — never fail the login screen over it.
    return NextResponse.json({ logo: null })
  }
}
