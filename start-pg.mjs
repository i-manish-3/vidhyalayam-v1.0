import EmbeddedPostgres from 'embedded-postgres'
import path from 'path'
import fs from 'fs'

const dbDir = path.join(process.cwd(), 'pgdata')
const isInitialized = fs.existsSync(path.join(dbDir, 'PG_VERSION'))

const postgres = new EmbeddedPostgres({
  databaseDir: dbDir,
  port: 5432,
  user: 'z',
  password: 'postgres',
  dbName: 'vidhyalayam',
  persistent: true,
})

if (!isInitialized) {
  console.log('Initializing embedded PostgreSQL...')
  await postgres.initialise()
  console.log('PostgreSQL initialized.')
} else {
  console.log('PostgreSQL data directory already initialized.')
}

console.log('Starting PostgreSQL...')
await postgres.start()
console.log('PostgreSQL started on port 5432.')

// Keep process alive
process.on('SIGINT', async () => {
  console.log('Shutting down PostgreSQL...')
  await postgres.stop()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('Shutting down PostgreSQL...')
  await postgres.stop()
  process.exit(0)
})

// Keep alive
setInterval(() => {}, 60000)
