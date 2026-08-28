/**
 * Audits — and optionally removes — the accounts created by the bot signup
 * flood that ran roughly 2026-05-18 through 2026-08-15.
 *
 *   npx tsx --env-file=.env.local scripts/purge-bot-signups.ts          # dry run
 *   npx tsx --env-file=.env.local scripts/purge-bot-signups.ts --apply  # delete
 *
 * The signature is the giveaway the bot never bothered to hide: a nickname of
 * 14+ mixed-case letters with no spaces, digits, or word structure
 * ("VhxCMCLOtFNkbfGLDuzOP"). Real nicknames are short handles — "Buckets",
 * "Jax", "mike". Accounts that ever paid, held credits, joined a team, or
 * uploaded a video are excluded no matter what their nickname looks like, so
 * a false positive cannot destroy a real customer.
 */
import { writeFileSync } from 'node:fs'
import { db } from '@/lib/db'

const APPLY = process.argv.includes('--apply')

async function main() {
  const candidates = (await db`
    SELECT u.id, u.email, u.nickname, u.created_at
    FROM users u
    WHERE u.nickname ~ '^[A-Za-z]{14,}$'
      AND u.nickname ~ '[A-Z]'
      AND u.nickname ~ '[a-z]'
      -- Never touch an account with any sign of real use or real money.
      AND COALESCE(u.analysis_tokens, 0) = 0
      AND u.subscription_type IS NULL
      AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM team_memberships m WHERE m.user_id = u.id)
    ORDER BY u.created_at
  `) as unknown as { id: string; email: string; nickname: string; created_at: string }[]

  console.log(`${candidates.length} bot-signature accounts with no usage, no credits, no team:\n`)
  for (const c of candidates) {
    console.log(`  ${String(c.created_at).slice(0, 10)}  ${c.email.padEnd(45)} ${c.nickname}`)
  }

  const skipped = (await db`
    SELECT COUNT(*)::int AS c FROM users u
    WHERE u.nickname ~ '^[A-Za-z]{14,}$' AND u.nickname ~ '[A-Z]' AND u.nickname ~ '[a-z]'
      AND (COALESCE(u.analysis_tokens, 0) > 0
           OR u.subscription_type IS NOT NULL
           OR EXISTS (SELECT 1 FROM submissions s WHERE s.user_id = u.id)
           OR EXISTS (SELECT 1 FROM team_memberships m WHERE m.user_id = u.id))
  `) as unknown as [{ c: number }]
  if (skipped[0].c > 0) {
    console.log(`\n${skipped[0].c} matched the signature but show real usage — left alone, review by hand.`)
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to delete these accounts and drop them from the email list.')
    return
  }

  const ids = candidates.map(c => c.id)
  const emails = candidates.map(c => c.email)
  if (ids.length === 0) {
    console.log('\nNothing to delete.')
    return
  }

  // Dump every row about to be deleted first. There is no pg_dump on the
  // deploy box and the database is hosted, so this file is the only way back
  // if the heuristic turns out to have caught something real.
  const backupPath = `bot-purge-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const userRows = await db`SELECT * FROM users WHERE id = ANY(${ids})`
  const listRows = await db`SELECT * FROM email_list WHERE email = ANY(${emails})`
  writeFileSync(backupPath, JSON.stringify({ users: userRows, email_list: listRows }, null, 2))
  console.log(`\nBacked up ${userRows.length} users and ${listRows.length} email_list rows to ${backupPath}`)

  // The marketing list is the part that actually matters: these are scraped
  // third-party addresses whose owners never asked to hear from LearnHoops.
  // Mailing them would earn spam complaints against the sending domain.
  const removedFromList = await db`DELETE FROM email_list WHERE email = ANY(${emails}) RETURNING email`
  const removedUsers = await db`DELETE FROM users WHERE id = ANY(${ids}) RETURNING id`

  console.log(`\nDeleted ${removedUsers.length} accounts.`)
  console.log(`Removed ${removedFromList.length} addresses from the marketing email list.`)
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
