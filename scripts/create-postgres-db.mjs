import pg from 'pg'

const databaseUrl =
  process.env.DATABASE_URL || 'postgresql://z:postgres@127.0.0.1:5432/vidhyalayam'
const target = new URL(databaseUrl)
const databaseName = target.pathname.replace(/^\//, '') || 'vidhyalayam'

const adminUrl = new URL(databaseUrl)
adminUrl.pathname = '/postgres'

const client = new pg.Client({ connectionString: adminUrl.toString() })

await client.connect()

const { rowCount } = await client.query(
  'SELECT 1 FROM pg_database WHERE datname = $1',
  [databaseName]
)

if (rowCount === 0) {
  await client.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`)
  console.log(`Created PostgreSQL database "${databaseName}".`)
} else {
  console.log(`PostgreSQL database "${databaseName}" already exists.`)
}

await client.end()
