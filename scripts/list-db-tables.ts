// One-time inspection: list every public-schema table currently in the DB.
// Used to find tables that exist in the DB but aren't defined in schema.prisma.

import { db } from '../src/lib/db'

async function main() {
  const rows = await db.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;`
  )
  for (const row of rows) {
    console.log(row.tablename)
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
