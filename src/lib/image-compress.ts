/**
 * Client-side image compression.
 *
 * Iteratively recompresses (and if needed, downscales) a JPEG/PNG/WebP image
 * until it fits under a target byte size. Formats that can't be safely
 * re-encoded through a canvas (animated GIF, ICO, SVG) are passed through
 * unchanged, and the caller is expected to reject them if oversized.
 */

export const DEFAULT_MAX_BYTES = 200 * 1024 // 200 KB

const CANVAS_SAFE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type CompressResult = {
  file: File
  dataUrl: string
  compressed: boolean
  originalBytes: number
  finalBytes: number
}

export type CompressOptions = {
  maxBytes?: number
  /** Maximum dimension (width or height) for the initial render. */
  maxDimension?: number
  /** Re-encode output mime type. JPEG gives best compression for photos. */
  outputType?: 'image/jpeg' | 'image/webp'
}

const fileToImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    img.src = url
  })

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas encode failed'))),
      type,
      quality,
    )
  })

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'))
    reader.readAsDataURL(blob)
  })

const renameWithExtension = (name: string, mime: string) => {
  const ext = mime === 'image/webp' ? 'webp' : 'jpg'
  const base = name.replace(/\.[^.]+$/, '') || 'image'
  return `${base}.${ext}`
}

export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<CompressResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const maxDimension = options.maxDimension ?? 1600
  const outputType = options.outputType ?? 'image/jpeg'

  if (!CANVAS_SAFE_TYPES.has(file.type) || file.size <= maxBytes) {
    const dataUrl = await blobToDataUrl(file)
    return {
      file,
      dataUrl,
      compressed: false,
      originalBytes: file.size,
      finalBytes: file.size,
    }
  }

  const img = await fileToImage(file)

  let width = img.naturalWidth
  let height = img.naturalHeight
  const longestSide = Math.max(width, height)
  if (longestSide > maxDimension) {
    const scale = maxDimension / longestSide
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  let bestBlob: Blob | null = null

  // Outer loop: shrink dimensions if quality alone can't get us under the cap.
  // Inner loop: drop quality from 0.9 → 0.4 in 0.1 steps.
  for (let attempt = 0; attempt < 5; attempt++) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.drawImage(img, 0, 0, width, height)

    for (let quality = 0.9; quality >= 0.4; quality -= 0.1) {
      const blob = await canvasToBlob(canvas, outputType, quality)
      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob
      if (blob.size <= maxBytes) {
        bestBlob = blob
        break
      }
    }

    if (bestBlob && bestBlob.size <= maxBytes) break

    // Shrink by 20% and try again.
    width = Math.max(320, Math.round(width * 0.8))
    height = Math.max(320, Math.round(height * 0.8))
  }

  if (!bestBlob) {
    // Fallback: shouldn't happen, but return original to avoid data loss.
    const dataUrl = await blobToDataUrl(file)
    return {
      file,
      dataUrl,
      compressed: false,
      originalBytes: file.size,
      finalBytes: file.size,
    }
  }

  const outName = renameWithExtension(file.name, outputType)
  const outFile = new File([bestBlob], outName, { type: outputType, lastModified: Date.now() })
  const dataUrl = await blobToDataUrl(bestBlob)

  return {
    file: outFile,
    dataUrl,
    compressed: true,
    originalBytes: file.size,
    finalBytes: bestBlob.size,
  }
}

export async function compressImageToDataUrl(
  file: File,
  options: CompressOptions = {},
): Promise<string> {
  const { dataUrl } = await compressImage(file, options)
  return dataUrl
}
