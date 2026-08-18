import postgres from 'postgres'
import fs from 'fs'
import path from 'path'

// SQL files are applied in order. Each must be idempotent
// (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
const FILES = ['migrate.sql', 'migrate-teams.sql', 'migrate-organizations.sql', 'migrate-coach-invite.sql', 'migrate-multi-team-coach.sql', 'migrate-pending-players.sql', 'migrate-team-tokens.sql', 'migrate-class-packages.sql', 'migrate-self-coach.sql', 'migrate-coach-credits.sql', 'migrate-shipping-link.sql', 'migrate-free-org-token.sql', 'migrate-class-package-shipping.sql', 'migrate-class-package-team.sql', 'migrate-class-package-team-id.sql', 'migrate-class-package-ball-sizes.sql', 'migrate-user-display-name.sql', 'migrate-processed-sessions.sql', 'migrate-org-applications.sql', 'migrate-org-token-balance.sql', 'migrate-coach-password-reset.sql', 'migrate-pending-credit-claims.sql', 'migrate-backfill-account-emails.sql', 'migrate-support-requests.sql', 'migrate-team-chat.sql', 'migrate-team-schedule.sql', 'migrate-frames-hash.sql', 'migrate-shipping-cost.sql', 'migrate-grader-metadata.sql', 'migrate-eval-fixtures.sql', 'migrate-eval-json-repair.sql', 'migrate-coach-notes.sql', 'migrate-analysis-notes.sql', 'migrate-analysis-notes-per-criterion.sql', 'migrate-filming-tips-email.sql', 'migrate-orders-all-purchases.sql']

async function migrate() {
  if (!process.env.DATABASE_URL) {
    // With --skip-if-no-db (used by the build script), a missing DATABASE_URL
    // is fine: local `npm run build` has no DB env and just builds. On Vercel
    // the env var is injected, so deploys migrate the live database.
    if (process.argv.includes('--skip-if-no-db')) {
      console.log('DATABASE_URL not set — skipping migrations.')
      return
    }
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
