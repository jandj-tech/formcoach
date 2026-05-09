import postgres from 'postgres'
import fs from 'fs'
import path from 'path'

async function migrate() {
  const db = postgres(process.env.DATABASE_URL!, {
    ssl: 'require',
  })

  const sql = fs.readFileSync(path.join(__dirname, 'migrate.sql'), 'utf-8')

  console.log('Running migrations...')
  await db.unsafe(sql)
  console.log('Migrations complete.')
  await db.end()
}

migrate().catch(console.error)
