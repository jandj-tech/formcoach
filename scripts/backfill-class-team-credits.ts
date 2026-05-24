// One-off: classs teams auto-created by an earlier version of the webhook
// landed with teams.credits = 0, so the org leader/coach can't upload for
// players (analyze deducts from credits). Backfill any class team whose
// credits is still 0 to player_count * 2 (matches the new webhook default).
//
// Idempotent: only touches credits=0 rows. Safe to re-run.
import postgres from 'postgres'

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set; run via `npx tsx --env-file=.env.local scripts/backfill-class-team-credits.ts`')
    process.exit(1)
  }
  const db = postgres(process.env.DATABASE_URL, { ssl: 'require' })
  try {
    const rows = (await db`
      UPDATE teams
      SET credits = (
        SELECT p.player_count * 2 FROM org_class_packages p WHERE p.id = teams.class_package_id
      )
      WHERE class_package_id IS NOT NULL
        AND COALESCE(credits, 0) = 0
      RETURNING id, name, credits
    `) as unknown as Array<{ id: string; name: string; credits: number }>

    if (rows.length === 0) {
      console.log('No class teams needed a backfill — all already had credits.')
    } else {
      console.log(`Backfilled ${rows.length} class team(s):`)
      for (const r of rows) console.log(`  ${r.name}  →  ${r.credits} credits  (${r.id})`)
    }
  } finally {
    await db.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
