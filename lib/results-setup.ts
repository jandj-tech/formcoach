// Results for a player who hasn't set up their account yet.
//
// Coaches and orgs can add a player by email without sending the setup email
// (lib/roster-players.ts). When they later EMAIL SHOT RESULTS to that player,
// the player gets a "finish setting up to see your results" email instead
// (lib/email.ts renderPlayerResultsSetupEmail): no score, no report, no
// /results link — just their own setup link, which lands them on their
// results once a password is set. Set-up players' results emails are
// untouched. Shared by the composer (lib/player-email.ts) and the legacy org
// Results send (/api/org/send-results).

import { db } from '@/lib/db'
import { BASE_URL } from '@/lib/email'
import { rateLimit } from '@/lib/rate-limit'
import { issuePlayerSetupToken } from '@/lib/roster-players'

/**
 * Shown in previews in place of the player's real setup link: the setup link
 * is only ever emailed to the player, never shown to the coach/org. It opens
 * the setup page's "missing token" message, nothing else.
 */
export const RESULTS_SETUP_PREVIEW_URL = `${BASE_URL}/reset-password?setup=1&preview=1`

/**
 * Per-player caps on these emails (separate from the 3/hour setup-resend
 * limit, so a results send never eats the coach's "Resend setup" budget, and
 * vice versa). Each sender already has its own per-hour send limits; this
 * stops several senders, or one sender sending again and again, from
 * flooding one inbox with setup links.
 */
const PER_HOUR = 4
const PER_DAY = 8

/** Where the player lands after setting a password: their shot, or their list of shots. */
export function resultsLandingPath(submissionIds: string[]): string {
  const ids = [...new Set(submissionIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))]
  return ids.length === 1 ? `/dashboard/shots/${ids[0]}` : '/dashboard'
}

export interface SetupRecipientFacts {
  /** Another player account uses the same address (siblings). */
  sharedInbox: boolean
  /** "Ava O." from the account itself, when the roster has no better name. */
  accountLabel: string | null
}

/** Facts the setup email states about each player, in one query for any number of players. */
export async function setupRecipientFacts(userIds: string[]): Promise<Map<string, SetupRecipientFacts>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  const out = new Map<string, SetupRecipientFacts>()
  if (ids.length === 0) return out
  const rows = (await db`
    SELECT u.id,
           NULLIF(TRIM(u.first_name), '') AS first_name,
           NULLIF(TRIM(u.last_initial), '') AS last_initial,
           EXISTS (SELECT 1 FROM users o WHERE LOWER(o.email) = LOWER(u.email) AND o.id <> u.id) AS shared
    FROM users u
    WHERE u.id = ANY(${ids}::uuid[])
  `) as unknown as Array<{
    id: string
    first_name: string | null
    last_initial: string | null
    shared: boolean
  }>
  for (const r of rows) {
    const li = r.last_initial?.charAt(0).toUpperCase()
    out.set(r.id, {
      sharedInbox: r.shared,
      accountLabel: r.first_name ? `${r.first_name}${li ? ` ${li}.` : ''}` : null,
    })
  }
  return out
}

/**
 * Checks the per-player cap, then returns the player's setup link (landing on
 * `landing`). null when the cap is reached or the account no longer needs
 * setup — either way the caller sends nothing to this player.
 */
export async function resultsSetupLink(
  userId: string,
  landing: string,
): Promise<{ ok: true; url: string } | { ok: false; reason: 'rate_limited' | 'not_pending' }> {
  const hour = await rateLimit(`results-setup:${userId}`, PER_HOUR, 3600)
  if (!hour.ok) return { ok: false, reason: 'rate_limited' }
  const day = await rateLimit(`results-setup-day:${userId}`, PER_DAY, 86400)
  if (!day.ok) return { ok: false, reason: 'rate_limited' }
  const url = await issuePlayerSetupToken(userId, { next: landing })
  return url ? { ok: true, url } : { ok: false, reason: 'not_pending' }
}
