/**
 * One-off end-to-end verification for tenant export. Runs in a fresh process,
 * picks the first non-deleted school, runs the export engine, then reads the
 * gzip artifact back and sanity-checks its structure. Cleans up the artifact.
 * Run AFTER `prisma db push`: bun run scripts/verify-tenant-export.ts
 */
import { db } from '../src/lib/db'
import { runTenantExport, getExportModels, deleteExportArtifact } from '../src/lib/tenant-export'
import fs from 'fs/promises'
import zlib from 'zlib'

function assert(label: string, cond: boolean) {
  console.log(`${cond ? '✅' : '❌'} ${label}`)
  if (!cond) process.exitCode = 1
}

async function main() {
  const models = getExportModels()
  assert(`registry discovered tenant models (${models.length} tables)`, models.length > 20)
  assert('School is first in the registry', models[0]?.model === 'School')

  const school = await db.school.findFirst({ where: { deletedAt: null }, select: { id: true, name: true } })
  if (!school) {
    console.log('⚠️  no school in DB — seed first; skipping dump check')
    return
  }
  console.log(`exporting school: ${school.name} (${school.id})`)

  const result = await runTenantExport(school.id)
  assert('artifact file was written', !!result.filePath)
  assert('artifact has non-zero size', result.fileSize > 0)
  assert('tableCount matches registry', result.tableCount === models.length)
  console.log(`  → ${result.tableCount} tables, ${result.recordCount} rows, ${result.fileSize} bytes`)

  // Read the gzip back and parse it.
  const raw = await fs.readFile(result.filePath)
  const json = JSON.parse(zlib.gunzipSync(raw).toString('utf-8'))
  assert('artifact decompresses to valid JSON', typeof json === 'object')
  assert('artifact records the schoolId', json.schoolId === school.id)
  assert('artifact has a tables map', json.tables && typeof json.tables === 'object')
  assert('School table contains exactly the one school row', Array.isArray(json.tables.School) && json.tables.School.length === 1)
  assert('every School row in export belongs to the target school', json.tables.School[0]?.id === school.id)

  // Spot-check tenant isolation: any Student rows must all carry the schoolId.
  if (Array.isArray(json.tables.Student) && json.tables.Student.length > 0) {
    const allScoped = json.tables.Student.every((s: { schoolId?: string }) => s.schoolId === school.id)
    assert('exported Student rows are all tenant-scoped', allScoped)
  } else {
    console.log('  (no Student rows to check tenant isolation on)')
  }

  await deleteExportArtifact(result.filePath)
  assert('artifact cleaned up', !(await fs.stat(result.filePath).then(() => true).catch(() => false)))
}

main()
  .catch((e) => {
    console.error('verification error:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
    console.log('done')
  })
