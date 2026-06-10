import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import fs from 'fs/promises'
import { createWriteStream } from 'fs'
import zlib from 'zlib'
import path from 'path'
import crypto from 'crypto'

/**
 * Tenant data export engine.
 *
 * Dumps every tenant-scoped table (any model with a `schoolId` scalar field) for
 * one school into a single gzip-compressed NDJSON-ish JSON artifact, written to a
 * PRIVATE storage dir (never under public/). Export-only — there is no restore.
 *
 * Models are discovered from Prisma's DMMF at runtime, so new tenant tables are
 * included automatically without editing a hardcoded list.
 */

// Private (gitignored) directory for export artifacts — NOT public/uploads, so
// the files are never statically served. Downloads go through an authz'd route.
export const EXPORT_DIR = path.join(process.cwd(), 'storage', 'exports')

export interface ExportModel {
  /** Prisma model name, e.g. "Student". */
  model: string
  /** Prisma client accessor, e.g. "student". */
  accessor: string
  /** Whether the model has a scalar string `id` (enables keyset pagination). */
  hasStringId: boolean
}

let cachedModels: ExportModel[] | null = null

/** lowercase the first character (Prisma model -> client accessor). */
function toAccessor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

/**
 * Every model that carries a `schoolId` scalar field, discovered from the DMMF.
 * The School model itself is prepended so the export is self-describing.
 */
export function getExportModels(): ExportModel[] {
  if (cachedModels) return cachedModels

  const models = Prisma.dmmf.datamodel.models
  const tenantModels: ExportModel[] = []
  for (const m of models) {
    const hasSchoolId = m.fields.some((f) => f.name === 'schoolId' && f.kind === 'scalar')
    if (!hasSchoolId) continue
    const hasStringId = m.fields.some(
      (f) => f.name === 'id' && f.kind === 'scalar' && f.type === 'String' && f.isId,
    )
    tenantModels.push({ model: m.name, accessor: toAccessor(m.name), hasStringId })
  }
  tenantModels.sort((a, b) => a.model.localeCompare(b.model))

  // School row first (the tenant record itself).
  cachedModels = [{ model: 'School', accessor: 'school', hasStringId: true }, ...tenantModels]
  return cachedModels
}

export interface ExportResult {
  filePath: string
  fileSize: number
  tableCount: number
  recordCount: number
}

export interface ExportProgress {
  tablesDone: number
  tablesTotal: number
  recordCount: number
  currentTable?: string
}

/**
 * Run the export for one school. Streams each table's rows into a gzip file as a
 * single JSON document of shape:
 *   { schoolId, exportedAt, tables: { Student: [...], FeeCollection: [...], ... } }
 *
 * Written incrementally so a large tenant never materializes fully in memory.
 */
export async function runTenantExport(
  schoolId: string,
  opts?: { onProgress?: (p: ExportProgress) => void; pageSize?: number },
): Promise<ExportResult> {
  const pageSize = opts?.pageSize ?? 1000
  const models = getExportModels()

  await fs.mkdir(EXPORT_DIR, { recursive: true })
  const fileName = `${schoolId}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.json.gz`
  const filePath = path.join(EXPORT_DIR, fileName)

  const gzip = zlib.createGzip()
  const out = createWriteStream(filePath)
  gzip.pipe(out)

  // Backpressure-aware write to the gzip stream.
  const write = (chunk: string): Promise<void> =>
    new Promise((resolve, reject) => {
      gzip.write(chunk, (err) => (err ? reject(err) : resolve()))
    })

  let recordCount = 0
  let tablesDone = 0

  try {
    await write(`{"schoolId":${JSON.stringify(schoolId)},`)
    await write(`"exportedAt":${JSON.stringify(new Date().toISOString())},"tables":{`)

    for (let i = 0; i < models.length; i++) {
      const { model, accessor, hasStringId } = models[i]
      // The School model is keyed by id; tenant models by schoolId.
      const where = model === 'School' ? { id: schoolId } : { schoolId }

      const delegate = (db as unknown as Record<string, {
        findMany: (args: unknown) => Promise<unknown[]>
      }>)[accessor]
      if (!delegate?.findMany) continue

      await write(`${i === 0 ? '' : ','}${JSON.stringify(model)}:[`)

      let first = true

      if (hasStringId) {
        // Keyset pagination on id so huge tables stream without OFFSET cost.
        let cursor: string | null = null
        for (;;) {
          const rows: Array<{ id?: string }> = (await delegate.findMany({
            where,
            take: pageSize,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: 'asc' },
          })) as Array<{ id?: string }>

          if (rows.length === 0) break

          for (const row of rows) {
            await write(`${first ? '' : ','}${JSON.stringify(row)}`)
            first = false
            recordCount++
          }

          if (rows.length < pageSize) break
          cursor = rows[rows.length - 1].id ?? null
          if (!cursor) break
        }
      } else {
        // Composite-PK / id-less models (junction tables) — no cursor key, so
        // pull them in one shot. These are small lookup/link tables in practice.
        const rows = (await delegate.findMany({ where })) as unknown[]
        for (const row of rows) {
          await write(`${first ? '' : ','}${JSON.stringify(row)}`)
          first = false
          recordCount++
        }
      }

      await write(`]`)
      tablesDone++
      opts?.onProgress?.({ tablesDone, tablesTotal: models.length, recordCount, currentTable: model })
    }

    await write(`}}`)
  } catch (err) {
    gzip.destroy()
    out.destroy()
    await fs.unlink(filePath).catch(() => {})
    throw err
  }

  // Flush + close, then stat for the size.
  await new Promise<void>((resolve, reject) => {
    out.on('finish', () => resolve())
    out.on('error', reject)
    gzip.on('error', reject)
    gzip.end()
  })

  const stat = await fs.stat(filePath)
  return { filePath, fileSize: stat.size, tableCount: tablesDone, recordCount }
}

/** Best-effort delete of an export artifact (e.g. on expiry or job delete). */
export async function deleteExportArtifact(filePath: string | null | undefined): Promise<void> {
  if (!filePath) return
  // Only ever touch files inside EXPORT_DIR.
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(path.resolve(EXPORT_DIR))) return
  await fs.unlink(resolved).catch(() => {})
}
