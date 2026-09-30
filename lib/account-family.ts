/**
 * Family accounts — OPT-IN shared login between player accounts on one email.
 *
 * Several player accounts may share a parent's address (lib/player-accounts.ts);
 * each child has their own account, with their own password, tokens, seats,
 * shots and memberships. Most families keep it that way. This module is the
 * niche opt-in on top: two (or more) accounts on the same address join one
 * login group (users.login_group_id) and get the SAME password, so one
 * password opens the group and the sign-in page asks which player (P2's
 * chooser). Nothing else moves — data always stays on its own account.
 *
 * Rules every entry point here enforces:
 *   - Player session only (the route checks it) and the caller's address must
 *     be PROVEN (email_verified_at). Signup does not prove the inbox, so an
 *     unproven account must not even learn which first names share the email.
 *   - Only accounts on the caller's own address, never the caller itself.
 *   - Nothing beyond a first name ever leaves this module.
 *   - Joining needs proof for the account that joins: the OTHER account's
 *     password ("share"), or a click on a link mailed to the family inbox
 *     ("share-by-inbox"). The account whose password changes is the one that
 *     moves groups: with "share" the caller adopts the other's password; with
 *     the inbox link the other account adopts the caller's.
 *   - "Stop sharing" gives the caller a NEW password — different from the
 *     group's and from every other account on the address (a shared password
 *     outside a group would put the shipped iOS app, which has no chooser, in
 *     front of two accounts) — and takes the caller out of the group.
 *
 * Password hashes are copied between rows, never re-derived: the inbox flow
 * never sees a plaintext, and a copied bcrypt hash verifies the same password.
 * Every session is bound to its own row's hash (lib/auth.ts `cv`), so whichever
 * account's hash changes has its older sessions end; the route re-issues the
 * caller's.
 */

import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { Resend } from 'resend'
import { SignJWT, jwtVerify } from 'jose'
import { db } from '@/lib/db'
import { requireEnv } from '@/lib/env'
import { playerCredentialFingerprint } from '@/lib/auth'
import { fingerprintMatches } from '@/lib/org-auth'
import { BCRYPT_COST } from '@/lib/password'
import { rateLimit } from '@/lib/rate-limit'
import { resolveBaseUrl } from '@/lib/base-url'
import { NOTIFICATION_FROM } from '@/lib/email-senders'
import { MAX_PLAYERS_PER_EMAIL } from '@/lib/player-accounts'
import { siblingPasswordClash } from '@/lib/password-reset'

export const MIN_PASSWORD_LENGTH = 6
const SHARE_TTL_DAYS = 7
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class FamilyError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message)
  }
}

export interface FamilyMember {
  /** Opaque handle for the POST actions. */
  id: string
  firstName: string
  /** In the caller's login group (one password opens both). */
  shared: boolean
  /** False for a roster stub whose setup link hasn't been used yet. */
  setupComplete: boolean
}

export interface FamilyView {
  /** The caller's first name, for the card's wording. */
  me: string
  inGroup: boolean
  accounts: FamilyMember[]
}

interface Row {
  id: string
  email: string
  password_hash: string | null
  email_verified_at: Date | null
  roster_pending: boolean | null
  first_name: string | null
  nickname: string | null
  login_group_id: string | null
}

type Sql = typeof db

function norm(email: string): string {
  return email.toLowerCase().trim()
}

function firstNameOf(r: { first_name: string | null; nickname: string | null }): string {
  return r.first_name?.trim() || r.nickname?.trim() || 'Another player'
}

function fp(r: { id: string; password_hash: string | null }): string {
  return playerCredentialFingerprint(r.id, r.password_hash)
}

async function loadUser(id: string, sql: Sql = db, lock = false): Promise<Row | null> {
  if (!UUID.test(id)) return null
  const rows = lock
    ? await sql`
        SELECT id, email, password_hash, email_verified_at, roster_pending, first_name, nickname, login_group_id
        FROM users WHERE id = ${id} FOR UPDATE`
    : await sql`
        SELECT id, email, password_hash, email_verified_at, roster_pending, first_name, nickname, login_group_id
        FROM users WHERE id = ${id}`
  return ((rows as unknown as Row[])[0]) ?? null
}

/** The caller, who must have proven the inbox the family shares. */
async function loadCaller(userId: string): Promise<Row> {
  const me = await loadUser(userId)
  if (!me) throw new FamilyError('Not signed in', 401, 'unauthorized')
  if (!me.email_verified_at) {
    throw new FamilyError('Confirm your email address before managing family accounts.', 403, 'unverified')
  }
  return me
}

/** Another account on the caller's address — the only kind this module touches. */
async function loadSibling(me: Row, withUserId: unknown): Promise<Row> {
  const other = typeof withUserId === 'string' ? await loadUser(withUserId) : null
  if (!other || other.id === me.id || norm(other.email) !== norm(me.email)) {
    throw new FamilyError('You can only share a login with a player account on your own email.', 403, 'not_sibling')
  }
  return other
}

function sameGroup(a: Row, b: Row): boolean {
  return !!a.login_group_id && a.login_group_id === b.login_group_id
}

/** Clears a group left with one member (a group of one means nothing). */
async function tidyGroup(sql: Sql, groupId: string | null) {
  if (!groupId) return
  await sql`
    UPDATE users SET login_group_id = NULL
    WHERE login_group_id = ${groupId}
      AND (SELECT COUNT(*) FROM users WHERE login_group_id = ${groupId}) = 1
  `
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** The other player accounts on my address: first names + whether we share a login. */
export async function familyForUser(userId: string): Promise<FamilyView> {
  const me = await loadUser(userId)
  if (!me) throw new FamilyError('Not signed in', 401, 'unauthorized')
  // An unproven address sees an empty family — not even a count.
  if (!me.email_verified_at) return { me: firstNameOf(me), inGroup: false, accounts: [] }
  const rows = (await db`
    SELECT id, first_name, nickname, roster_pending, password_hash IS NOT NULL AS has_password, login_group_id
    FROM users
    WHERE LOWER(email) = ${norm(me.email)} AND id <> ${me.id}
    ORDER BY created_at ASC NULLS LAST, id ASC
    LIMIT ${MAX_PLAYERS_PER_EMAIL}
  `) as unknown as Array<{
    id: string
    first_name: string | null
    nickname: string | null
    roster_pending: boolean | null
    has_password: boolean
    login_group_id: string | null
  }>
  const accounts = rows.map((r) => ({
    id: r.id,
    firstName: firstNameOf(r),
    shared: !!me.login_group_id && r.login_group_id === me.login_group_id,
    setupComplete: !(r.roster_pending && !r.has_password),
  }))
  return {
    me: firstNameOf(me),
    inGroup: accounts.some((a) => a.shared),
    accounts,
  }
}

/**
 * Every account in this user's login group, the user included (just the user
 * when not grouped). For the sign-in chooser / switcher: two accounts may be
 * offered together only when they are in one group.
 */
export async function loginGroupMembers(userId: string): Promise<Array<{ id: string; firstName: string }>> {
  if (!UUID.test(userId)) return []
  const rows = (await db`
    SELECT u.id, u.first_name, u.nickname
    FROM users me
    JOIN users u ON u.id = me.id
      OR (me.login_group_id IS NOT NULL AND u.login_group_id = me.login_group_id AND LOWER(u.email) = LOWER(me.email))
    WHERE me.id = ${userId}
    ORDER BY u.created_at ASC NULLS LAST, u.id ASC
  `) as unknown as Array<{ id: string; first_name: string | null; nickname: string | null }>
  return rows.map((r) => ({ id: r.id, firstName: firstNameOf(r) }))
}

// ---------------------------------------------------------------------------
// Share with the other account's password
// ---------------------------------------------------------------------------

/**
 * Joins the caller to `withUserId`'s login group, proven by that account's
 * password. The caller adopts that password (its hash is copied), so the
 * other account — and anyone already grouped with it — is untouched.
 * Returns the caller's new password hash (the route re-signs the session).
 */
export async function shareWithPassword(
  callerId: string,
  withUserId: unknown,
  password: unknown,
): Promise<{ passwordHash: string; sharedWith: string }> {
  const me = await loadCaller(callerId)
  const other = await loadSibling(me, withUserId)
  const name = firstNameOf(other)
  if (sameGroup(me, other)) throw new FamilyError(`You already share a login with ${name}.`, 409, 'already_shared')
  if (typeof password !== 'string' || !password) {
    throw new FamilyError(`Enter ${name}'s password.`, 400, 'password_required')
  }

  // A password check is a guessing oracle — budget it per caller and per target.
  const [byCaller, byTarget] = await Promise.all([
    rateLimit(`family-share:${me.id}`, 5, 900),
    rateLimit(`family-share-target:${other.id}`, 10, 3600),
  ])
  if (!byCaller.ok || !byTarget.ok) {
    throw new FamilyError('Too many attempts. Try again later.', 429, 'rate_limited')
  }

  if (!other.password_hash || !(await bcrypt.compare(password, other.password_hash))) {
    throw new FamilyError(`That password doesn't match ${name}'s account.`, 401, 'wrong_password')
  }

  const out = await db.begin(async (tx) => {
    const sql = tx as unknown as Sql
    // Lock in id order so two concurrent shares can't deadlock.
    const [a, b] = [me.id, other.id].sort()
    const la = await loadUser(a, sql, true)
    const lb = await loadUser(b, sql, true)
    const cur = la?.id === me.id ? la : lb
    const oth = la?.id === other.id ? la : lb
    // Re-checked under the lock: the password we verified is still theirs.
    if (!cur || !oth || !oth.password_hash || oth.password_hash !== other.password_hash || norm(cur.email) !== norm(oth.email)) {
      throw new FamilyError('That account changed while you were sharing. Try again.', 409, 'changed')
    }
    if (sameGroup(cur, oth)) throw new FamilyError(`You already share a login with ${name}.`, 409, 'already_shared')
    const groupId = oth.login_group_id ?? crypto.randomUUID()
    if (!oth.login_group_id) await sql`UPDATE users SET login_group_id = ${groupId} WHERE id = ${oth.id}`
    await sql`UPDATE users SET password_hash = ${oth.password_hash}, login_group_id = ${groupId} WHERE id = ${cur.id}`
    if (cur.login_group_id && cur.login_group_id !== groupId) await tidyGroup(sql, cur.login_group_id)
    return { passwordHash: oth.password_hash }
  })
  return { passwordHash: out.passwordHash, sharedWith: name }
}

// ---------------------------------------------------------------------------
// Share through the family inbox
// ---------------------------------------------------------------------------

/**
 * A mailed confirmation. Binds both accounts to the password hashes they had
 * when it was sent (credential fingerprints — keyed HMACs, never the hash), so
 * the link dies if either password changes: after the join itself, after
 * "Stop sharing", or after a reset. Signed with a key derived from JWT_SECRET,
 * never JWT_SECRET itself, so it can never pass as a session.
 */
interface ShareClaims {
  kind: 'family-share'
  email: string
  fromUserId: string
  toUserId: string
  fromCv: string
  toCv: string
}

let shareKey: Uint8Array | undefined
function shareSigningKey(): Uint8Array {
  if (!shareKey) {
    shareKey = new Uint8Array(crypto.createHmac('sha256', requireEnv('JWT_SECRET')).update('family-share-v1').digest())
  }
  return shareKey
}

async function signShare(from: Row, to: Row): Promise<string> {
  const claims: ShareClaims = {
    kind: 'family-share',
    email: norm(from.email),
    fromUserId: from.id,
    toUserId: to.id,
    fromCv: fp(from),
    toCv: fp(to),
  }
  return new SignJWT(claims as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SHARE_TTL_DAYS}d`)
    .sign(shareSigningKey())
}

async function verifyShare(token: unknown): Promise<ShareClaims | null> {
  if (typeof token !== 'string' || !token || token.length > 2048) return null
  try {
    const { payload } = await jwtVerify(token, shareSigningKey(), { algorithms: ['HS256'] })
    const c = payload as unknown as ShareClaims
    if (c.kind !== 'family-share') return null
    for (const k of ['email', 'fromUserId', 'toUserId', 'fromCv', 'toCv'] as const) {
      if (typeof c[k] !== 'string' || !c[k]) return null
    }
    return c
  } catch {
    return null
  }
}

/**
 * Emails the family inbox a link that joins `withUserId` to the caller's
 * login group. The caller re-types their own password: that is the password
 * that will open both accounts.
 */
export async function requestShareByInbox(callerId: string, withUserId: unknown, ownPassword: unknown): Promise<{ sentTo: string; sharedWith: string }> {
  const me = await loadCaller(callerId)
  const other = await loadSibling(me, withUserId)
  const name = firstNameOf(other)
  if (sameGroup(me, other)) throw new FamilyError(`You already share a login with ${name}.`, 409, 'already_shared')
  if (other.roster_pending && !other.password_hash) {
    throw new FamilyError(`${name} hasn't finished setting up their account yet.`, 409, 'setup_incomplete')
  }
  if (!me.password_hash) {
    throw new FamilyError(
      `Your account signs in with Google or Apple, so it has no password to share. Use ${name}'s password instead.`,
      400,
      'no_password',
    )
  }
  if (typeof ownPassword !== 'string' || !ownPassword) {
    throw new FamilyError('Enter your password.', 400, 'password_required')
  }
  const guess = await rateLimit(`family-share:${me.id}`, 5, 900)
  if (!guess.ok) throw new FamilyError('Too many attempts. Try again later.', 429, 'rate_limited')
  if (!(await bcrypt.compare(ownPassword, me.password_hash))) {
    throw new FamilyError("That isn't your current password.", 401, 'wrong_password')
  }
  const mail = await rateLimit(`family-share-mail:${me.id}`, 3, 3600)
  if (!mail.ok) throw new FamilyError('We already sent a few links this hour. Check the inbox (and spam folder).', 429, 'rate_limited')

  const token = await signShare(me, other)
  const link = `${resolveBaseUrl()}/api/account/family/confirm?token=${encodeURIComponent(token)}`
  await sendFamilyShareEmail(me.email, firstNameOf(me), name, link)
  return { sentTo: me.email, sharedWith: name }
}

export type ShareLinkState =
  | { ok: true; from: string; to: string }
  | { ok: false; reason: 'invalid' | 'already_shared'; from?: string; to?: string }

/** What the mailed link would do, without doing it (the confirm page's GET). */
export async function inspectShareLink(token: unknown): Promise<ShareLinkState> {
  const c = await verifyShare(token)
  if (!c) return { ok: false, reason: 'invalid' }
  const [from, to] = await Promise.all([loadUser(c.fromUserId), loadUser(c.toUserId)])
  if (!from || !to || norm(from.email) !== c.email || norm(to.email) !== c.email) return { ok: false, reason: 'invalid' }
  const names = { from: firstNameOf(from), to: firstNameOf(to) }
  if (sameGroup(from, to)) return { ok: false, reason: 'already_shared', ...names }
  if (!fingerprintMatches(c.fromCv, fp(from)) || !fingerprintMatches(c.toCv, fp(to)) || !from.password_hash) {
    return { ok: false, reason: 'invalid' }
  }
  return { ok: true, ...names }
}

/**
 * Performs the join the link names: the other account adopts the requester's
 * password and joins the requester's group. Mints no session — a forwarded
 * link must not sign anyone in.
 */
export async function confirmShareLink(token: unknown): Promise<ShareLinkState> {
  const c = await verifyShare(token)
  if (!c) return { ok: false, reason: 'invalid' }
  return db.begin(async (tx) => {
    const sql = tx as unknown as Sql
    const [a, b] = [c.fromUserId, c.toUserId].sort()
    const la = await loadUser(a, sql, true)
    const lb = await loadUser(b, sql, true)
    const from = la?.id === c.fromUserId ? la : lb
    const to = la?.id === c.toUserId ? la : lb
    if (!from || !to || from.id === to.id || norm(from.email) !== c.email || norm(to.email) !== c.email) {
      return { ok: false, reason: 'invalid' } as const
    }
    const names = { from: firstNameOf(from), to: firstNameOf(to) }
    if (sameGroup(from, to)) return { ok: false, reason: 'already_shared', ...names } as const
    if (!from.password_hash || !fingerprintMatches(c.fromCv, fp(from)) || !fingerprintMatches(c.toCv, fp(to))) {
      return { ok: false, reason: 'invalid' } as const
    }
    const groupId = from.login_group_id ?? crypto.randomUUID()
    if (!from.login_group_id) await sql`UPDATE users SET login_group_id = ${groupId} WHERE id = ${from.id}`
    await sql`UPDATE users SET password_hash = ${from.password_hash}, login_group_id = ${groupId} WHERE id = ${to.id}`
    if (to.login_group_id && to.login_group_id !== groupId) await tidyGroup(sql, to.login_group_id)
    return { ok: true, ...names } as const
  })
}

// ---------------------------------------------------------------------------
// Stop sharing
// ---------------------------------------------------------------------------

/**
 * Takes the caller out of their login group with a new password of their
 * own. Returns the new hash (the route re-signs the caller's session).
 */
export async function stopSharing(callerId: string, newPassword: unknown): Promise<{ passwordHash: string }> {
  const me = await loadCaller(callerId)
  if (!me.login_group_id) throw new FamilyError("You don't share a login with anyone.", 409, 'not_shared')
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new FamilyError(`Choose a new password (${MIN_PASSWORD_LENGTH}+ characters).`, 400, 'password_too_short')
  }
  if (newPassword.length > 200) throw new FamilyError('That password is too long.', 400, 'password_too_long')
  // Each attempt compares against the other accounts' passwords: budget it.
  const limit = await rateLimit(`family-stop:${me.id}`, 5, 900)
  if (!limit.ok) throw new FamilyError('Too many attempts. Try again later.', 429, 'rate_limited')

  if (me.password_hash && (await bcrypt.compare(newPassword, me.password_hash))) {
    throw new FamilyError('Pick a password that is different from the shared one.', 400, 'same_as_group')
  }
  // P3's different-password rule, run as if the caller were already out of
  // the group (selfId null: nobody is exempt), so the leaver's new password
  // differs from the group's AND from every other account on the address.
  // Its own wording suggests sharing, which is the opposite of what the
  // caller is doing, so only the verdict is used.
  if (await siblingPasswordClash(me.email, newPassword, null)) {
    throw new FamilyError('Another player on this email already uses that password. Pick a different one.', 400, 'same_as_sibling')
  }

  const hash = await bcrypt.hash(newPassword, BCRYPT_COST)
  await db.begin(async (tx) => {
    const sql = tx as unknown as Sql
    const cur = await loadUser(me.id, sql, true)
    if (!cur || cur.login_group_id !== me.login_group_id) {
      throw new FamilyError('Your account changed. Reload and try again.', 409, 'changed')
    }
    await sql`UPDATE users SET password_hash = ${hash}, login_group_id = NULL WHERE id = ${me.id}`
    await tidyGroup(sql, me.login_group_id)
  })
  return { passwordHash: hash }
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** "Confirm: one login for Harper and Liam" — sent to the shared inbox. */
export async function sendFamilyShareEmail(to: string, fromName: string, toName: string, link: string) {
  const subject = `Confirm a shared login for ${fromName} and ${toName}`
  const safeLink = esc(link)
  const { data, error } = await new Resend(process.env.RESEND_API_KEY!).emails.send({
    from: NOTIFICATION_FROM,
    to,
    subject,
    text: [
      `Hi there,`,
      ``,
      `${fromName}'s LearnHoops account asked to share one login with ${toName}'s account.`,
      ``,
      `If you confirm:`,
      `- ${fromName}'s password will open both accounts, and ${toName}'s old password stops working.`,
      `- After signing in, you pick which player to use.`,
      `- Each player keeps their own shots, tokens and memberships. Nothing is merged.`,
      `- You can stop sharing any time in Settings > Family.`,
      ``,
      `Confirm here (the link works for ${SHARE_TTL_DAYS} days):`,
      link,
      ``,
      `If you didn't ask for this, ignore this email. Nothing changes.`,
      ``,
      `LearnHoops.com`,
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="background:#F4F4F5;"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #E4E4E7;">
      <tr><td style="background:#000;padding:22px 32px;">
        <div style="color:#F97316;font-size:20px;font-weight:800;">LearnHoops<span style="color:#71717A;">.com</span></div>
      </td></tr>
      <tr><td style="padding:36px 32px 8px;">
        <h1 style="margin:0 0 10px;color:#111;font-size:22px;font-weight:800;">Share one login for ${esc(fromName)} and ${esc(toName)}?</h1>
        <p style="margin:0 0 14px;color:#52525B;font-size:15px;line-height:1.55;">
          ${esc(fromName)}&rsquo;s LearnHoops account asked to share one login with ${esc(toName)}&rsquo;s account. If you confirm:
        </p>
        <ul style="margin:0;padding-left:20px;color:#52525B;font-size:15px;line-height:1.6;">
          <li>${esc(fromName)}&rsquo;s password opens both accounts, and ${esc(toName)}&rsquo;s old password stops working.</li>
          <li>After signing in, you pick which player to use.</li>
          <li>Each player keeps their own shots, tokens and memberships. Nothing is merged.</li>
          <li>You can stop sharing any time in Settings &rsaquo; Family.</li>
        </ul>
      </td></tr>
      <tr><td style="padding:24px 32px 8px;">
        <a href="${safeLink}" style="display:inline-block;background:#F97316;color:#fff;padding:13px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">Review and confirm</a>
      </td></tr>
      <tr><td style="padding:8px 32px 32px;">
        <p style="margin:0 0 10px;color:#A1A1AA;font-size:13px;line-height:1.5;">
          If the button doesn't work, copy this link into your browser:<br/>
          <a href="${safeLink}" style="color:#71717A;word-break:break-all;">${safeLink}</a>
        </p>
        <p style="margin:0;color:#A1A1AA;font-size:13px;line-height:1.5;">This link works for ${SHARE_TTL_DAYS} days. If you didn't ask for this, ignore this email. Nothing changes.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`.trim(),
  })
  if (error) {
    console.error('[email] family share confirmation failed:', error)
    throw new FamilyError('Could not send the email. Try again later.', 502, 'email_failed')
  }
  console.log('[email] family share confirmation sent:', data?.id)
}
