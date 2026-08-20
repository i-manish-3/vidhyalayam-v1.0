import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { r2PublicUrl } from '@/lib/storage'

// Same-origin proxy for stored images.
//
// html-to-image needs every <img> on a card to be readable by the browser. Local
// `/uploads/...` files are same-origin and work directly, but R2 public URLs live
// on a different origin and the browser cannot read them without CORS headers on
// the bucket. Routing the bytes through this route makes them same-origin, so the
// birthday/id-card downloaders can embed them into the PNG.

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
}

const CACHE_HEADERS = 'public, max-age=31536000, immutable'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url || url.length > 2000) {
    return new NextResponse('Bad request', { status: 400 })
  }

  // Local file → read straight off disk. Next.js serves /uploads as static assets
  // anyway, but proxying keeps the downloader's fetch same-origin and uniform.
  if (url.startsWith('/uploads/')) {
    const publicRoot = path.join(process.cwd(), 'public')
    const filePath = path.join(publicRoot, url)
    if (!filePath.startsWith(publicRoot + path.sep)) {
      return new NextResponse('Forbidden', { status: 403 })
    }
    try {
      const data = await fs.readFile(filePath)
      const ext = path.extname(url).toLowerCase()
      return new NextResponse(data, {
        headers: {
          'Content-Type': EXT_TO_MIME[ext] ?? 'application/octet-stream',
          'Cache-Control': CACHE_HEADERS,
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch {
      return new NextResponse('Not found', { status: 404 })
    }
  }

  // R2 file → fetch server-side and stream back. Only allow our own public base
  // (SSRF guard — never proxy arbitrary external URLs).
  let base: string
  try {
    base = r2PublicUrl()
  } catch {
    return new NextResponse('Proxy not configured', { status: 400 })
  }
  if (!url.startsWith(base + '/')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      return new NextResponse('Not found', { status: 404 })
    }
    const buf = Buffer.from(await res.arrayBuffer())
    return new NextResponse(buf, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
        'Cache-Control': CACHE_HEADERS,
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return new NextResponse('Upstream fetch failed', { status: 502 })
  }
}