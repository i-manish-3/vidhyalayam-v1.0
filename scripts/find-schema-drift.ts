// One-time inspection: compare actual DB tables/columns vs prisma schema models.
// Prints any DB columns that don't have a matching field in schema.prisma.

import { db } from '../src/lib/db'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface ColumnRow {
  table_name: string
  column_name: string
  data_type: string
  is_nullable: 'YES' | 'NO'
}

async function main() {
  const schemaPath = join(process.cwd(), 'prisma', 'schema.prisma')
  const schemaText = readFileSync(schemaPath, 'utf8')

  // Build modelName -> set of declared field names from schema.prisma.
  const modelFieldMap = new Map<string, Set<string>>()
  const modelBlocks = schemaText.split(/^model\s+/m).slice(1)
  for (const block of modelBlocks) {
    const nameMatch = block.match(/^(\w+)\s*\{/)
    if (!nameMatch) continue
    const modelName = nameMatch[1]
    const bodyMatch = block.match(/\{([\s\S]*?)\n\}/)
    const body = bodyMatch?.[1] || ''
    const fields = new Set<string>()
    for (const line of body.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue
      const fieldMatch = trimmed.match(/^(\w+)\s+/)
      if (fieldMatch) fields.add(fieldMatch[1])
    }
    modelFieldMap.set(modelName, fields)
  }

  const columns = await db.$queryRawUnsafe<ColumnRow[]>(
    `SELECT table_name, column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position;`
  )

  const dbTablesSeen = new Set<string>()
  for (const col of columns) dbTablesSeen.add(col.table_name)

  // Tables in DB but not in schema
  const orphanTables: string[] = []
  for (const table of dbTablesSeen) {
    if (table === '_prisma_migrations') continue
    if (!modelFieldMap.has(table)) orphanTables.push(table)
  }

  // Columns in DB but not in schema (per known model)
  const orphanColumnsByTable = new Map<string, ColumnRow[]>()
  for (const col of columns) {
    if (col.table_name === '_prisma_migrations') continue
    const schemaFields = modelFieldMap.get(col.table_name)
    if (!schemaFields) continue // table-level orphan reported separately
    if (!schemaFields.has(col.column_name)) {
      const list = orphanColumnsByTable.get(col.table_name) || []
      list.push(col)
      orphanColumnsByTable.set(col.table_name, list)
    }
  }

  console.log('=== Tables in DB but not in schema.prisma ===')
  if (orphanTables.length === 0) {
    console.log('(none — all DB tables are modelled)')
  } else {
    for (const table of orphanTables) console.log(`  • ${table}`)
  }

  console.log('\n=== Columns in DB but not in schema.prisma ===')
  if (orphanColumnsByTable.size === 0) {
    console.log('(none — all DB columns are modelled)')
  } else {
    for (const [table, cols] of orphanColumnsByTable) {
      console.log(`  • ${table}`)
      for (const col of cols) {
        console.log(`      - ${col.column_name} (${col.data_type}, nullable=${col.is_nullable})`)
      }
    }
  }

  // Reverse direction: models / fields declared in schema.prisma but missing in DB.
  // This signals an out-of-date DB that needs `prisma db push`.
  const dbColumnsByTable = new Map<string, Set<string>>()
  for (const col of columns) {
    if (col.table_name === '_prisma_migrations') continue
    const set = dbColumnsByTable.get(col.table_name) || new Set()
    set.add(col.column_name)
    dbColumnsByTable.set(col.table_name, set)
  }

  const missingTables: string[] = []
  const missingColumnsByTable = new Map<string, string[]>()
  for (const [model, fields] of modelFieldMap) {
    if (!dbColumnsByTable.has(model)) {
      missingTables.push(model)
      continue
    }
    const dbFields = dbColumnsByTable.get(model)!
    const missingFields: string[] = []
    for (const field of fields) {
      // Skip pure relation fields (no DB column) — heuristic: look up the
      // original line and skip if it references another model with `?`/`[]`.
      // For now, just check direct presence.
      if (!dbFields.has(field)) missingFields.push(field)
    }
    if (missingFields.length > 0) missingColumnsByTable.set(model, missingFields)
  }

  console.log('\n=== Models in schema.prisma but missing in DB ===')
  if (missingTables.length === 0) {
    console.log('(none)')
  } else {
    for (const table of missingTables) console.log(`  • ${table}`)
  }

  console.log('\n=== Fields in schema.prisma but missing in DB (may include relation fields, which is OK) ===')
  if (missingColumnsByTable.size === 0) {
    console.log('(none)')
  } else {
    for (const [table, fields] of missingColumnsByTable) {
      console.log(`  • ${table}`)
      for (const field of fields) {
        console.log(`      - ${field}`)
      }
    }
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
