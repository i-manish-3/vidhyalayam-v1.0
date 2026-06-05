import { NextResponse } from 'next/server'

// Mobile logout. JWTs are stateless, so there's no server-side session to
// destroy — the client simply deletes its tokens from expo-secure-store. This
// endpoint exists so the app has a single, explicit "log me out" call to make
// (useful later if we add server-side refresh-token revocation / device
// unregistration for push). For now it's a simple acknowledgement.
//
// To force-invalidate a user's existing sessions, bump their `tokenVersion`
// (the same mechanism a password reset uses) — every outstanding refresh token
// then fails the version check in auth-core's refreshSession.
export async function POST() {
  return NextResponse.json({ ok: true })
}
