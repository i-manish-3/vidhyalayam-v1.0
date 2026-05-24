// File storage abstraction. Supports two drivers:
//   - local: writes files to public/uploads/ — for development. Files are served
//     by Next.js as static assets at /uploads/<key>.
//   - r2: uploads to Cloudflare R2 (S3-compatible). For production — files live
//     outside the VPS so they survive VPS rebuilds, and downloads happen via R2's
//     CDN (not through our Node process).
//
// The same API works for both drivers. Switching is just an env var change.
//
// We keep the existing on-disk/DB string fields (`profileImage`, `logo`, etc.) —
// they previously held a base64 data URL, now they hold a HTTPS URL or a
// relative path like "/uploads/students/abc.jpg". Both render fine in <img>.

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

const DRIVER = (process.env.STORAGE_DRIVER || 'local').toLowerCase()

// ============================================
// R2 CLIENT (lazy — only constructed when needed)
// ============================================

let r2Client: S3Client | null = null
function getR2(): S3Client {
  if (r2Client) return r2Client
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'STORAGE_DRIVER=r2 but R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not set. ' +
        'See .env.example for setup instructions.',
    )
  }
  r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  return r2Client
}

function r2Bucket(): string {
  const bucket = process.env.R2_BUCKET
  if (!bucket) throw new Error('R2_BUCKET env var is required when STORAGE_DRIVER=r2.')
  return bucket
}

function r2PublicUrl(): string {
  const base = process.env.R2_PUBLIC_URL
  if (!base) throw new Error('R2_PUBLIC_URL env var is required when STORAGE_DRIVER=r2.')
  return base.replace(/\/$/, '')
}

// ============================================
// PUBLIC API
// ============================================

export interface UploadInput {
  /** Raw file bytes. Accepts Buffer or Uint8Array. */
  data: Buffer | Uint8Array
  /** MIME type, e.g. 'image/jpeg'. */
  contentType: string
  /**
   * Logical folder, e.g. 'students', 'teachers', 'schools/logos'. The final key
   * becomes `<folder>/<random>.<ext>`. Keep folders consistent so it's easy to
   * audit/purge by category later.
   */
  folder: string
  /** Optional explicit filename (no extension). Otherwise a random one is generated. */
  filename?: string
  /** Optional explicit extension (without the dot). Otherwise inferred from contentType. */
  extension?: string
}

export interface UploadResult {
  /** Public URL (for <img src> / API responses). */
  url: string
  /** Storage key (relative path) — store this if you need to delete later. */
  key: string
}

/** Upload a file. Returns the public URL and the storage key. */
export async function uploadFile(input: UploadInput): Promise<UploadResult> {
  const buf = Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data)
  const ext = (input.extension || guessExtension(input.contentType)).replace(/^\./, '')
  const name = input.filename || crypto.randomBytes(12).toString('hex')
  const key = `${input.folder.replace(/^\/+|\/+$/g, '')}/${name}.${ext}`

  if (DRIVER === 'r2') {
    await getR2().send(
      new PutObjectCommand({
        Bucket: r2Bucket(),
        Key: key,
        Body: buf,
        ContentType: input.contentType,
        // 1-year browser cache. Filenames are content-addressed (random) so
        // updating an image always produces a new key — safe to cache forever.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    )
    return { url: `${r2PublicUrl()}/${key}`, key }
  }

  // local driver
  const uploadsRoot = path.join(process.cwd(), 'public', 'uploads')
  const filePath = path.join(uploadsRoot, key)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, buf)
  return { url: `/uploads/${key}`, key }
}

/**
 * Delete a previously-uploaded file. Accepts either a storage key (as returned
 * by uploadFile) or a public URL. Silently ignores missing files — callers
 * usually just want best-effort cleanup.
 */
export async function deleteFile(keyOrUrl: string): Promise<void> {
  const key = extractKey(keyOrUrl)
  if (!key) return

  if (DRIVER === 'r2') {
    try {
      await getR2().send(new DeleteObjectCommand({ Bucket: r2Bucket(), Key: key }))
    } catch (err) {
      console.warn('R2 delete failed (ignored):', key, err)
    }
    return
  }

  try {
    const filePath = path.join(process.cwd(), 'public', 'uploads', key)
    await fs.unlink(filePath)
  } catch {
    // already gone — fine
  }
}

// ============================================
// HELPERS
// ============================================

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

function guessExtension(contentType: string): string {
  return MIME_TO_EXT[contentType.toLowerCase()] || 'bin'
}

/**
 * Parse a base64 data URL ("data:image/png;base64,iVBOR...") into raw bytes +
 * MIME type. Returns null if the input is not a valid data URL.
 */
export function parseDataUrl(value: string): { data: Buffer; contentType: string } | null {
  if (!value || typeof value !== 'string') return null
  const match = value.match(/^data:([^;,]+)(;base64)?,(.+)$/)
  if (!match) return null
  const contentType = match[1]
  const isBase64 = match[2] === ';base64'
  const payload = match[3]
  try {
    const data = isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf-8')
    return { data, contentType }
  } catch {
    return null
  }
}

/** True for data URLs (legacy base64) — the values that need to be uploaded. */
export function isDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:')
}

/**
 * True for already-uploaded values — either a R2 HTTPS URL or a local
 * /uploads/... path. Callers can skip the upload step for these.
 */
export function isStoredUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/uploads/')
}

/**
 * Strip the public URL prefix to recover the storage key. Returns null when
 * the input is not recognizable as one of our stored files.
 */
function extractKey(keyOrUrl: string): string | null {
  if (!keyOrUrl) return null
  // already a bare key
  if (!keyOrUrl.startsWith('http') && !keyOrUrl.startsWith('/uploads/')) return keyOrUrl
  // local
  if (keyOrUrl.startsWith('/uploads/')) return keyOrUrl.slice('/uploads/'.length)
  // r2 — strip the configured public base
  try {
    const base = r2PublicUrl()
    if (keyOrUrl.startsWith(base + '/')) return keyOrUrl.slice(base.length + 1)
  } catch {
    // R2 not configured — fall through
  }
  return null
}

// ============================================
// CONVENIENCE: upload-if-data-url
// ============================================
// Most call sites take a value off `req.body` that might be:
//   - undefined / null / '' (no change)
//   - a base64 data URL (needs upload)
//   - an already-stored URL like https://files... or /uploads/... (keep as-is)
//
// This helper handles all three cases in one call so endpoints stay short.

export interface UploadIfDataUrlOptions {
  folder: string
  /** Cap on the raw (post-decode) size in bytes. Defaults to 5 MB. */
  maxBytes?: number
  /** Restrict accepted MIME types. Empty/undefined = accept whatever guessExtension knows. */
  allowedMimeTypes?: string[]
  /** If provided, the previous stored value — will be deleted from storage after a successful new upload. */
  previousUrl?: string | null
}

export interface UploadIfDataUrlResult {
  /** undefined when input was undefined (no change). null when input was empty (clear). url when uploaded or passed through. */
  url: string | null | undefined
  /** True if a fresh upload happened. */
  uploaded: boolean
  /** Set when validation failed — caller should return a 400 with this message. */
  error?: string
}

export async function uploadIfDataUrl(
  value: unknown,
  options: UploadIfDataUrlOptions,
): Promise<UploadIfDataUrlResult> {
  if (value === undefined) return { url: undefined, uploaded: false }
  if (value === null || value === '') {
    if (options.previousUrl) await deleteFile(options.previousUrl)
    return { url: null, uploaded: false }
  }
  if (typeof value !== 'string') {
    return { url: undefined, uploaded: false, error: 'Invalid file value.' }
  }
  if (isStoredUrl(value)) {
    // Already uploaded — caller is sending the same URL back unchanged.
    return { url: value, uploaded: false }
  }
  if (!isDataUrl(value)) {
    return { url: undefined, uploaded: false, error: 'File must be a data URL or stored URL.' }
  }

  const parsed = parseDataUrl(value)
  if (!parsed) {
    return { url: undefined, uploaded: false, error: 'Could not decode the uploaded file.' }
  }

  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024
  if (parsed.data.length > maxBytes) {
    return { url: undefined, uploaded: false, error: `File too large. Max ${Math.floor(maxBytes / 1024 / 1024)} MB.` }
  }

  if (options.allowedMimeTypes && options.allowedMimeTypes.length > 0) {
    if (!options.allowedMimeTypes.includes(parsed.contentType.toLowerCase())) {
      return { url: undefined, uploaded: false, error: 'Unsupported file type.' }
    }
  }

  const result = await uploadFile({
    data: parsed.data,
    contentType: parsed.contentType,
    folder: options.folder,
  })

  if (options.previousUrl && options.previousUrl !== result.url) {
    await deleteFile(options.previousUrl)
  }

  return { url: result.url, uploaded: true }
}

// Common MIME-type allowlists, shared across upload endpoints.
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
export const IMAGE_MIME_TYPES_WITH_ICO = [...IMAGE_MIME_TYPES, 'image/x-icon', 'image/vnd.microsoft.icon']
export const DOCUMENT_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
