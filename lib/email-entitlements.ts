/**
 * Email-keyed entitlements: a complimentary membership an admin grants to an
 * address (email_list.subscription_type), and guest ball credits bought under
 * an address.
 *
 * The rule: an entitlement keyed on an email only lands on an account whose
 * owner has PROVEN that inbox (users.email_verified_at). Signup does not prove
 * anything — anyone can type any address — so before this, whoever signed up
 * first with a comped address got the comp. Proof comes from:
 *   - the signed confirmation link below (emailed to the address),
 *   - a consumed reset/setup link (lib/password-reset.ts),
 *   - a provider that verified the address (lib/oauth-account.ts),
 *   - signing up through the signed /signup?comp= link with that same address.
 *
 * Tokens here are signed with a key DERIVED from JWT_SECRET, never JWT_SECRET
 * itself: session verifiers accept any JWT under that secret, so a
 * confirmation token signed with it would double as a session cookie.
 */

import crypto from 'crypto'
import { SignJWT, jwtVerify } from 'jose'
import { db } from '@/lib/db'
import { requireEnv } from '@/lib/env'
import { resolveBaseUrl } from '@/lib/base-url'
import { rateLimit } from '@/lib/rate-limit'
import { sendEntitlementConfirmEmail } from '@/lib/email'

const CONFIRM_TTL = '7d'
const COMP_SIGNUP_TTL = '30d'
const SETUP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
// Minted when the confirm link is clicked and used on the page it redirects
// to, so it only has to outlive filling in one form (one hour).
const OWNERSHIP_TOKEN_TTL_MS = 60 * 60 * 1000

let key: Uint8Array | undefined
function signingKey(): Uint8Array {
  if (!key) key = new Uint8Array(crypto.createHmac('sha256', requireEnv('JWT_SECRET')).update('email-entitlement-v1').digest())
  return key
}

function norm(email: string): string {
  return email.toLowerCase().trim()
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** Link that proves `email` belongs to account `userId`. Stateless, 7 days. */
export async function signEmailConfirmToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ kind: 'email-confirm', userId, email: norm(email) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(CONFIRM_TTL)
    .sign(signingKey())
}

export async function verifyEmailConfirmToken(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey())
    if (payload.kind !== 'email-confirm' || typeof payload.userId !== 'string' || typeof payload.email !== 'string') return null
    return { userId: payload.userId, email: payload.email }
  } catch {
    return null
  }
}

/**
 * Signup link for an address that has a comp but no account. Only ever emailed
 * to that address, so signing up through it with the SAME address proves the
 * inbox. 30 days; after that the normal confirm-after-signup path still works.
 */
export async function signCompSignupToken(email: string): Promise<string> {
  return new SignJWT({ kind: 'comp-signup', email: norm(email) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(COMP_SIGNUP_TTL)
    .sign(signingKey())
}

/** The address the comp-signup token is bound to, or null. */
export async function verifyCompSignupToken(token: unknown): Promise<string | null> {
  if (typeof token !== 'string' || !token) return null
  try {
    const { payload } = await jwtVerify(token, signingKey())
    if (payload.kind !== 'comp-signup' || typeof payload.email !== 'string') return null
    return payload.email
  } catch {
    return null
  }
}

/**
 * Rides along a /reset-password link minted from a link bound to ONE account
 * (the confirm link's "set your password to activate" step, or a comp setup
 * link): proof that the family chose this account, so setting the password
 * both verifies it AND gives it the comp on a shared address — no second
 * click on the confirm link. Bound to the reset token it travels with (a hash,
 * never the token itself), so it cannot be moved onto another link.
 */
function resetTokenHash(resetToken: string): string {
  return crypto.createHash('sha256').update(resetToken).digest('hex').slice(0, 32)
}

export async function signChosenAccountToken(userId: string, resetToken: string, ttlMs: number): Promise<string> {
  return new SignJWT({ kind: 'comp-chosen', userId, th: resetTokenHash(resetToken) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + ttlMs) / 1000))
    .sign(signingKey())
}

/** The account a `chosen` token names, when it was minted for `resetToken`; else null. */
export async function verifyChosenAccountToken(chosen: unknown, resetToken: string): Promise<string | null> {
  if (typeof chosen !== 'string' || !chosen || !resetToken) return null
  try {
    const { payload } = await jwtVerify(chosen, signingKey())
    if (payload.kind !== 'comp-chosen' || typeof payload.userId !== 'string' || typeof payload.th !== 'string') return null
    return payload.th === resetTokenHash(resetToken) ? payload.userId : null
  } catch {
    return null
  }
}

export function confirmEmailUrl(token: string): string {
  return `${resolveBaseUrl()}/api/auth/confirm-email?token=${encodeURIComponent(token)}`
}

export function compSignupUrl(token: string): string {
  return `${resolveBaseUrl()}/signup?comp=${encodeURIComponent(token)}`
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Records proof of inbox ownership. When `email` is given the mark only lands
 * if the account still carries that address (a link for an old address must
 * not verify a new one). Returns whether the account is now verified.
 */
export async function markEmailVerified(userId: string, email?: string | null): Promise<boolean> {
  const e = email ? norm(email) : null
  const rows = (await db`
    UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW())
    WHERE id = ${userId} AND (${e}::text IS NULL OR LOWER(email) = ${e}::text)
    RETURNING id
  `) as unknown as Array<{ id: string }>
  return rows.length > 0
}

/** Postgres "undefined_column": email_list.comp_user_id before migrate-family-email.sql. */
function isMissingColumn(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '42703'
}

/**
 * True when email_list holds a live comp for this account's address that the
 * account does not have yet — whether or not the account is verified — and
 * that has not already gone to another account on the same address (several
 * player accounts may share one; email_list.comp_user_id records which one
 * got the comp).
 */
export async function hasPendingEntitlement(userId: string): Promise<boolean> {
  try {
    const rows = (await db`
      SELECT 1 FROM users u
      JOIN email_list el ON el.email = LOWER(u.email)
      WHERE u.id = ${userId}
        AND el.subscription_type IS NOT NULL
        AND el.subscription_expires_at > NOW()
        AND NOT (u.subscription_type IS NOT NULL AND u.subscription_expires_at > NOW())
        AND (el.comp_user_id IS NULL OR el.comp_user_id = u.id
             OR NOT EXISTS (SELECT 1 FROM users c WHERE c.id = el.comp_user_id))
      LIMIT 1
    `) as unknown as unknown[]
    return rows.length > 0
  } catch (err) {
    if (isMissingColumn(err)) return hasPendingEntitlementLegacy(userId)
    // email_list may lack the columns on a very old schema.
    return false
  }
}

async function hasPendingEntitlementLegacy(userId: string): Promise<boolean> {
  try {
    const rows = (await db`
      SELECT 1 FROM users u
      JOIN email_list el ON el.email = LOWER(u.email)
      WHERE u.id = ${userId}
        AND el.subscription_type IS NOT NULL
        AND el.subscription_expires_at > NOW()
        AND NOT (u.subscription_type IS NOT NULL AND u.subscription_expires_at > NOW())
      LIMIT 1
    `) as unknown as unknown[]
    return rows.length > 0
  } catch {
    return false
  }
}

/**
 * Copies a live comp from email_list onto the account — ONLY when the account
 * is verified (the guard is in the SQL, so no caller can skip it). Returns
 * whether anything was applied.
 *
 * A comp is keyed by address, and several player accounts may share one
 * (siblings), so it lands on EXACTLY ONE account, recorded in
 * email_list.comp_user_id in the same statement:
 *   - the account it already went to (re-applying is harmless), or, while it
 *     has gone to nobody (or to an account since deleted),
 *   - this account when it is the ONLY verified account on the address, or
 *   - this account when `chosen` — the caller acted on a link bound to this
 *     very account (the confirm link the comp email carries for each account,
 *     app/api/auth/confirm-email), which is the family's choice.
 * Otherwise the comp stays pending for the family to choose.
 */
export async function applyEmailEntitlement(userId: string, opts: { chosen?: boolean } = {}): Promise<boolean> {
  const chosen = opts.chosen === true
  try {
    const rows = (await db`
      WITH target AS (
        SELECT id, LOWER(email) AS e FROM users
        WHERE id = ${userId}
          AND email_verified_at IS NOT NULL
          AND NOT (subscription_type IS NOT NULL AND subscription_expires_at > NOW())
      ),
      comp AS (
        UPDATE email_list el SET comp_user_id = t.id
        FROM target t
        WHERE el.email = t.e
          AND el.subscription_type IS NOT NULL
          AND el.subscription_expires_at > NOW()
          AND (
            el.comp_user_id = t.id
            OR (
              (el.comp_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM users c WHERE c.id = el.comp_user_id))
              AND (
                ${chosen}::boolean
                OR (SELECT COUNT(*) FROM users o WHERE LOWER(o.email) = t.e AND o.email_verified_at IS NOT NULL) = 1
              )
            )
          )
        RETURNING el.subscription_type, el.subscription_expires_at
      )
      UPDATE users u
      SET subscription_type = comp.subscription_type,
          subscription_expires_at = comp.subscription_expires_at
      FROM comp
      WHERE u.id = ${userId}
      RETURNING u.id
    `) as unknown as Array<{ id: string }>
    return rows.length > 0
  } catch (err) {
    if (isMissingColumn(err)) return applyEmailEntitlementLegacy(userId, chosen)
    console.error('[email-entitlements] apply failed:', err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Before migrate-family-email.sql adds email_list.comp_user_id: the old apply,
 * plus the one-account rule where it can be checked without the column (only
 * verified account on the address, or chosen). Addresses with one account —
 * every address before siblings can exist — behave exactly as before.
 */
async function applyEmailEntitlementLegacy(userId: string, chosen: boolean): Promise<boolean> {
  try {
    const rows = (await db`
      UPDATE users u
      SET subscription_type = el.subscription_type,
          subscription_expires_at = el.subscription_expires_at
      FROM email_list el
      WHERE u.id = ${userId}
        AND u.email_verified_at IS NOT NULL
        AND el.email = LOWER(u.email)
        AND el.subscription_type IS NOT NULL
        AND el.subscription_expires_at > NOW()
        AND NOT (u.subscription_type IS NOT NULL AND u.subscription_expires_at > NOW())
        AND (${chosen}::boolean
             OR (SELECT COUNT(*) FROM users o WHERE LOWER(o.email) = el.email AND o.email_verified_at IS NOT NULL) = 1)
      RETURNING u.id
    `) as unknown as Array<{ id: string }>
    return rows.length > 0
  } catch (err) {
    console.error('[email-entitlements] apply failed:', err instanceof Error ? err.message : err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type EntitlementNotice =
  | 'applied' // account already verified — activated on the spot
  | 'confirm_sent' // confirmation link emailed
  | 'setup_sent' // password-less account: setup link emailed
  | 'nothing_pending'
  | 'rate_limited'
  | 'send_failed'
  | 'no_account'

/**
 * Activates, or emails the proof link for, the pending comp on one account.
 * A password-less account with no provider identity (an old admin stub) gets a
 * password-setup link instead — confirming alone would leave it unable to log
 * in. Rate-limited 3/hour per account (shared by every caller).
 */
export async function sendEntitlementConfirmation(
  userId: string,
  opts: { requirePending?: boolean } = {},
): Promise<EntitlementNotice> {
  const [u] = (await db`
    SELECT u.id, u.email, u.email_verified_at, u.password_hash IS NULL AS no_password,
           EXISTS (SELECT 1 FROM user_oauth_identities oi WHERE oi.user_id = u.id) AS has_oauth
    FROM users u WHERE u.id = ${userId}
  `) as unknown as [{ id: string; email: string; email_verified_at: string | null; no_password: boolean; has_oauth: boolean } | undefined]
  if (!u) return 'no_account'

  if (u.email_verified_at) {
    if (await applyEmailEntitlement(u.id)) return 'applied'
    // Re-granting a comp to a verified account that is already a member (the
    // comp from an earlier grant, or a membership of its own): nothing new to
    // apply, but the grant IS in effect — report it as such rather than as
    // "waiting for confirmation", which is what the admin page would show.
    const [live] = (await db`
      SELECT 1 FROM users u JOIN email_list el ON el.email = LOWER(u.email)
      WHERE u.id = ${u.id}
        AND el.subscription_type IS NOT NULL AND el.subscription_expires_at > NOW()
        AND u.subscription_type IS NOT NULL AND u.subscription_expires_at > NOW()
    `) as unknown as [unknown | undefined]
    return live ? 'applied' : 'nothing_pending'
  }
  if (opts.requirePending !== false && !(await hasPendingEntitlement(u.id))) return 'nothing_pending'

  const limit = await rateLimit(`entitlement-confirm:${u.id}`, 3, 3600)
  if (!limit.ok) return 'rate_limited'

  try {
    if (u.no_password && !u.has_oauth) {
      await sendAccountSetupLink(u.id, u.email)
      return 'setup_sent'
    }
    const token = await signEmailConfirmToken(u.id, u.email)
    await sendEntitlementConfirmEmail(u.email, confirmEmailUrl(token), 'confirm')
    return 'confirm_sent'
  } catch (err) {
    console.error('[email-entitlements] send failed:', err instanceof Error ? err.message : err)
    return 'send_failed'
  }
}

/**
 * Emails a 24-hour password-setup link (the /reset-password flow) to a
 * password-less account's own address. Consuming it sets the password, marks
 * the address verified and applies any pending comp (see consumeResetToken).
 * Caller rate-limits.
 */
export async function sendAccountSetupLink(userId: string, email: string): Promise<void> {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SETUP_TOKEN_TTL_MS)
  const rows = (await db`
    UPDATE users SET reset_token = ${token}, reset_token_expires = ${expires}
    WHERE id = ${userId} AND password_hash IS NULL
    RETURNING id
  `) as unknown as Array<{ id: string }>
  if (rows.length === 0) throw new Error('account already has a password')
  // This link is for this one account (its pending comp): setting the
  // password gives it the comp even when a sibling on the address is verified.
  const chosen = await signChosenAccountToken(userId, token, SETUP_TOKEN_TTL_MS)
  await sendEntitlementConfirmEmail(
    email,
    `${resolveBaseUrl()}/reset-password?token=${token}&setup=1&chosen=${encodeURIComponent(chosen)}`,
    'setup',
  )
}

/**
 * The confirm link, clicked for an account whose password was never proven by
 * an inbox link. Anyone could have registered the address and chosen that
 * password, so confirming alone would activate the comp for whoever did. The
 * clicker proves the inbox; making them set the password is what makes the
 * inbox's owner the account's owner (and locks a squatter's password out).
 *
 * Mints a short reset token on THIS users row and returns the /reset-password
 * URL for it (carrying a `chosen` token for this account). consumeResetToken
 * then sets the password, marks the address verified and applies the comp to
 * this account — also when a sibling on the address is already verified. The row is targeted by id rather than through
 * issueResetToken(email), which checks org/coach rows first and would put the
 * token on a coach account that shares the address. Null when the account no
 * longer carries `email` or is already verified.
 */
export async function issueOwnershipSetupUrl(userId: string, email: string): Promise<string | null> {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + OWNERSHIP_TOKEN_TTL_MS)
  const rows = (await db`
    UPDATE users SET reset_token = ${token}, reset_token_expires = ${expires}
    WHERE id = ${userId} AND LOWER(email) = ${norm(email)} AND email_verified_at IS NULL
    RETURNING id
  `) as unknown as Array<{ id: string }>
  if (rows.length === 0) return null
  // The confirm link was bound to this account — the family's choice — so the
  // comp lands on it the moment the password is set (consumeResetToken).
  const chosen = await signChosenAccountToken(userId, token, OWNERSHIP_TOKEN_TTL_MS)
  return `/reset-password?token=${token}&activate=1&chosen=${encodeURIComponent(chosen)}`
}

/**
 * Comp for an address several player accounts share (siblings), none of which
 * it has gone to: one email to the inbox with a confirm link per account, so
 * the family picks which account gets it (the confirm route applies it to the
 * account whose link was used — `chosen`). Rate-limited 3/hour per address.
 */
export async function sendEntitlementChoice(
  email: string,
  accounts: Array<{ id: string; first_name: string | null; nickname: string | null; created_at: Date | null }>,
): Promise<'choice_sent' | 'rate_limited' | 'send_failed'> {
  const e = norm(email)
  const limit = await rateLimit(`entitlement-choice:${e}`, 3, 3600)
  if (!limit.ok) return 'rate_limited'
  try {
    const choices = await Promise.all(
      accounts.map(async (a, i) => {
        const who = a.first_name?.trim() || a.nickname?.trim().split(/\s+/)[0] || null
        const label = who ? `Give it to ${who}` : `Give it to player account ${i + 1}`
        return { label, url: confirmEmailUrl(await signEmailConfirmToken(a.id, e)) }
      }),
    )
    await sendEntitlementConfirmEmail(e, '', 'choose', choices)
    return 'choice_sent'
  } catch (err) {
    console.error('[email-entitlements] choice send failed:', err instanceof Error ? err.message : err)
    return 'send_failed'
  }
}

/** Comp for an address with no account: email the signed signup link. */
export async function sendCompSignupInvite(email: string): Promise<void> {
  const token = await signCompSignupToken(email)
  await sendEntitlementConfirmEmail(norm(email), compSignupUrl(token), 'signup')
}
