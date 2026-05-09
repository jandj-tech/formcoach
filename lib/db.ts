import postgres from 'postgres'

const globalForDb = globalThis as unknown as { db: ReturnType<typeof postgres> | undefined }

export const db =
  globalForDb.db ??
  postgres(process.env.DATABASE_URL!, {
    ssl: 'require',
    max: 10,
  })

if (process.env.NODE_ENV !== 'production') globalForDb.db = db
