import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  LAUNCH_OFFER_MAX_GRANTS,
  LAUNCH_OFFER_WINDOW_SECONDS,
  type OrgPlan,
} from '@/lib/org-subscription-pricing'

/**
 * The pre-payment signup handoff.
 *
 * An organization must not exist until its first payment succeeds, but the
 * admin chooses their password before checkout. So the details — including the
 * bcrypt hash — live in a `pending_org_signups` row, and only an opaque token
 * travels: to the pricing page in an httpOnly cookie, and to Stripe in
 * checkout metadata. Plaintext never leaves the /start handler.
 *
 * A cookie rather than ?token= in the URL: a URL token lands in browser
 * history, in the Referer header sent to Stripe, and in server access logs.
 * Reading a cookie in a Server Component is allowed — only WRITING one during
 * render is not (see node_modules/next/dist/docs on `cookies`), which is why
 * the write happens in the route handler and the read happens on the page.
 *
 * Stealing the token buys an attacker only the right to pay for someone else's
 * organization: the resulting account's password is still the one the original
 * applicant chose, which the attacker does not know.
 */

const COOKIE = 'fc_org_pending'
const TTL = 60 * 60 * 24 // 24 hours, matching pending_org_signups.expires_at

export interface PendingOrgSignup {
  id: string
  token: string
  orgName: string
  adminEmail: string
  playerCount: number | null
  passwordHash: string
  offerExpiresAt: Date | null
  offerGrants: number
  consumedAt: Date | null
}

interface PendingRow {
  id: string
  token: string
  org_name: string
  admin_email: string
  player_count: number | null
  password_hash: string
  offer_expires_at: Date | null
  offer_grants: number
  consumed_at: Date | null
}

function toPending(row: PendingRow): PendingOrgSignup {
  return {
    id: row.id,
    token: row.token,
    orgName: row.org_name,
    adminEmail: row.admin_email,
    playerCount: row.player_count,
    passwordHash: row.password_hash,
    offerExpiresAt: row.offer_expires_at,
    offerGrants: row.offer_grants,
    consumedAt: row.consumed_at,
  }
}

export function pendingCookieOptions(token: string) {
  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: TTL,
  }
}

/** Clear the cookie once the signup is consumed or abandoned. */
export function clearPendingCookieOptions() {
  return { ...pendingCookieOptions(''), maxAge: 0 }
}

/**
 * Create the pending row. `passwordHash` must already be bcrypt-hashed by the
 * caller — this function never sees a plaintext password.
 */
export async function createPendingOrgSignup(input: {
  orgName: string
  adminEmail: string
  playerCount: number | null
  passwordHash: string
}): Promise<PendingOrgSignup> {
  // 32 bytes base64url = 43 chars, comfortably inside Stripe's 500-char
  // metadata value limit and far beyond guessing.
  const token = randomBytes(32).toString('base64url')

  const [row] = (await db`
    INSERT INTO pending_org_signups (token, org_name, admin_email, player_count, password_hash)
    VALUES (${token}, ${input.orgName}, ${input.adminEmail}, ${input.playerCount}, ${input.passwordHash})
    RETURNING id, token, org_name, admin_email, player_count, password_hash,
              offer_expires_at, offer_grants, consumed_at
  `) as unknown as [PendingRow]

  return toPending(row)
}

/** Look up an unconsumed, unexpired signup by its token. */
export async function getPendingByToken(token: string): Promise<PendingOrgSignup | null> {
  if (!token) return null
  const [row] = (await db`
    SELECT id, token, org_name, admin_email, player_count, password_hash,
           offer_expires_at, offer_grants, consumed_at
    FROM pending_org_signups
    WHERE token = ${token} AND consumed_at IS NULL AND expires_at > NOW()
  `) as unknown as [PendingRow | undefined]
  return row ? toPending(row) : null
}

/** The same lookup, keyed off the httpOnly cookie. For Server Components. */
export async function getPendingFromCookie(): Promise<PendingOrgSignup | null> {
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  return token ? getPendingByToken(token) : null
}

/** The same lookup inside a route handler. */
export async function getPendingFromRequest(req: NextRequest): Promise<PendingOrgSignup | null> {
  const token = req.cookies.get(COOKIE)?.value
  return token ? getPendingByToken(token) : null
}

/**
 * Start (or restart) the launch-offer countdown, returning the deadline.
 *
 * The server owns the clock. The client renders a countdown to whatever
 * timestamp comes back and never invents one of its own, and
 * /api/org/subscribe re-reads this column rather than trusting anything the
 * client claims.
 *
 * The countdown deliberately re-arms on each visit — that is the product
 * decision — but `offer_grants` bounds how many times, so the discount is not
 * infinitely renewable by a script. A real visitor never reaches the ceiling.
 * Returns the existing deadline unchanged once the ceiling is hit.
 */
export async function armLaunchOffer(token: string): Promise<Date | null> {
  try {
    const [row] = (await db`
      UPDATE pending_org_signups
      -- make_interval, not "$n * INTERVAL '1 second'": a bound parameter has no
      -- inferable type in that expression and Postgres rejects it as
      -- text * interval. make_interval takes a plain integer.
      SET offer_expires_at = NOW() + make_interval(secs => ${LAUNCH_OFFER_WINDOW_SECONDS}),
          offer_grants = offer_grants + 1
      WHERE token = ${token}
        AND consumed_at IS NULL
        AND expires_at > NOW()
        AND offer_grants < ${LAUNCH_OFFER_MAX_GRANTS}
      RETURNING offer_expires_at
    `) as unknown as [{ offer_expires_at: Date } | undefined]

    if (row) return row.offer_expires_at

    // Ceiling reached (or the row is gone) — report the stored deadline as-is
    // so an already-running countdown keeps counting down honestly.
    const [existing] = (await db`
      SELECT offer_expires_at FROM pending_org_signups WHERE token = ${token}
    `) as unknown as [{ offer_expires_at: Date | null } | undefined]
    return existing?.offer_expires_at ?? null
  } catch (err) {
    console.error('[pending-org] arming the launch offer failed:', err)
    return null
  }
}

/**
 * Whether the offer is genuinely live for this signup right now.
 *
 * The only place that decides this. Note the plan check: on a yearly interval
 * a `duration_in_months: 3` coupon covers the whole first invoice — 50% off an
 * entire year — so the offer is monthly-only and that is enforced here rather
 * than trusted from the client.
 */
export function offerIsLive(pending: PendingOrgSignup, plan: OrgPlan): boolean {
  if (plan !== 'monthly') return false
  if (!pending.offerExpiresAt) return false
  return new Date(pending.offerExpiresAt).getTime() > Date.now()
}

/** Record which plan the buyer took to checkout, and the Stripe session id. */
export async function markPendingCheckout(
  token: string,
  plan: OrgPlan,
  stripeSessionId: string,
): Promise<void> {
  try {
    await db`
      UPDATE pending_org_signups
      SET plan = ${plan}, stripe_session_id = ${stripeSessionId}
      WHERE token = ${token}
    `
  } catch (err) {
    // Bookkeeping only — never fail a checkout that Stripe already created.
    console.error('[pending-org] recording the checkout session failed:', err)
  }
}

/**
 * Mark a signup used and point it at the organization it produced.
 *
 * Single-use: the WHERE clause requires consumed_at IS NULL, so a replayed
 * webhook or a refreshed success page cannot create a second organization.
 * Returns false when the row was already consumed.
 */
export async function consumePendingOrgSignup(
  token: string,
  organizationId: string,
): Promise<boolean> {
  const rows = (await db`
    UPDATE pending_org_signups
    SET consumed_at = NOW(), organization_id = ${organizationId}
    WHERE token = ${token} AND consumed_at IS NULL
    RETURNING id
  `) as unknown as unknown[]
  return rows.length > 0
}

/** The organization a consumed signup produced, if any. */
export async function organizationForPendingToken(token: string): Promise<{
  organizationId: string
  adminEmail: string
  consumedAt: Date | null
} | null> {
  const [row] = (await db`
    SELECT organization_id, admin_email, consumed_at
    FROM pending_org_signups
    WHERE token = ${token}
  `) as unknown as [
    { organization_id: string | null; admin_email: string; consumed_at: Date | null } | undefined,
  ]
  if (!row?.organization_id) return null
  return {
    organizationId: row.organization_id,
    adminEmail: row.admin_email,
    consumedAt: row.consumed_at,
  }
}

/**
 * Drop abandoned signups. They hold a password hash, so they should not sit
 * around indefinitely. Called opportunistically from /start rather than on a
 * schedule, matching how lib/rate-limit.ts sweeps its own table.
 */
export async function purgeExpiredPendingSignups(): Promise<void> {
  try {
    await db`
      DELETE FROM pending_org_signups
      WHERE consumed_at IS NULL AND expires_at < NOW() - INTERVAL '7 days'
    `
  } catch (err) {
    console.error('[pending-org] purge failed:', err)
  }
}
