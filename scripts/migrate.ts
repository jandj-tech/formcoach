import postgres from 'postgres'
import fs from 'fs'
import path from 'path'

// SQL files are applied in order. Each must be idempotent
// (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
const FILES = ['migrate.sql', 'migrate-teams.sql', 'migrate-organizations.sql']

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error(
      'DATABASE_URL is not set. Run `npm run migrate`, which loads .env.local via --env-file.'
    )
    process.exit(1)
  }

  const db = postgres(process.env.DATABASE_URL, { ssl: 'require' })

  try {
    for (const file of FILES) {
      const filePath = path.join(__dirname, file)
      if (!fs.existsSync(filePath)) continue
      console.log(`Running ${file}...`)
      await db.unsafe(fs.readFileSync(filePath, 'utf-8'))
    }
    console.log('Migrations complete.')
  } finally {
    await db.end()
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
