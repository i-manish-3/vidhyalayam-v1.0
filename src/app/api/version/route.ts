import { NextResponse } from 'next/server'
import packageInfo from '../../../../package.json'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    status: 'online',
    app: 'Vidhyalayam ERP',
    version: packageInfo.version,
    commit: process.env.NEXT_PUBLIC_GIT_COMMIT || process.env.GIT_COMMIT || 'development',
    deployedAt: process.env.NEXT_PUBLIC_DEPLOYED_AT || process.env.DEPLOYED_AT || null,
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    serverTime: new Date().toISOString(),
  })
}
