// One-off: fold every remaining legacy teams.token_pool balance into the
// head coach's coach_credits — the single balance system. The pool column
// stays in the schema (harmlessly at 0) but nothing reads or writes it
// anymore.
//
// Idempotent: the drain and the credit happen in one statement, and a team
// whose pool is already 0 is never touched. Safe to re-run.
import postgres from 'postgres'

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set; run via `npx tsx --env-file=.env.local scripts/backfill-token-pool-to-coach-credits.ts`')
    process.exit(1)
  }
  const db = postgres(process.env.DATABASE_URL, { ssl: 'require' })
  try {
    const rows = (await db`
      WITH pools AS (
        SELECT id, LOWER(admin_email) AS email, token_pool
        FROM teams
        WHERE COALESCE(token_pool, 0) > 0
        FOR UPDATE
      ),
      drained AS (
        UPDATE teams SET token_pool = 0
        WHERE id IN (SELECT id FROM pools)
      )
      INSERT INTO coach_credits (email, credits)
      SELECT email, SUM(token_pool)::int FROM pools GROUP BY email
      ON CONFLICT (email) DO UPDATE
      SET credits = COALESCE(coach_credits.credits, 0) + EXCLUDED.credits
      RETURNING email, credits
    `) as unknown as Array<{ email: string; credits: number }>

    if (rows.length === 0) {
      console.log('No team pools to fold — every teams.token_pool is already 0.')
    } else {
      console.log(`Folded pool tokens into ${rows.length} coach balance(s):`)
      for (const r of rows) console.log(`  ${r.email}  →  now ${r.credits} credits`)
    }
  } finally {
    await db.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
