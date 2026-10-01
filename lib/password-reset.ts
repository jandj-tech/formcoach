import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import type { Sql, TransactionSql } from 'postgres'
import { db } from '@/lib/db'
import { applyEmailEntitlement } from '@/lib/email-entitlements'
import { MAX_PLAYERS_PER_EMAIL } from '@/lib/player-accounts'
import { recordResetInboxProof } from '@/lib/team-auth'

// Password resets work across every account type — players (`users`),
// organizations, founding coaches (`teams`) and additional coaches
// (`team_coaches`). The forgot-password and reset-password routes share this
// module so the lookup logic stays in one place.

export type AccountKind = 'user' | 'org' | 'team' | 'team_coach'

const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

/** A player account as the reset / setup flows name it. */
interface ResetPlayerRow {
  id: string
  first_name: string | null
  nickname: string | null
  login_group_id: string | null
  /** A roster-pending account's live setup token (lib/roster-players issuePlayerSetupToken), kept by a forgot-password request. */
  setup_token?: string | null
}

function norm(email: string): string {
  return email.toLowerCase().trim()
}

/** Postgres "undefined_column" — users.login_group_id before migrate-family-email.sql. */
function isMissingColumn(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '42703'
}

/** First name a family recognises a player account by ("Liam"), or null. */
export function playerFirstName(p: { first_name: string | null; nickname: string | null }): string | null {
  return p.first_name?.trim() || p.nickname?.trim().split(/\s+/)[0] || null
}

/**
 * Player rows on an address, oldest first (lib/player-accounts.ts order),
 * capped at MAX_PLAYERS_PER_EMAIL, with the shared-login group when the
 * column exists.
 */
async function playerRowsForReset(email: string): Promise<ResetPlayerRow[]> {
  const e = norm(email)
  // A token outliving a 1-hour reset can only be a setup link.
  const setupFloor = new Date(Date.now() + TOKEN_TTL_MS)
  try {
    return (await db`
      SELECT id, first_name, nickname, login_group_id,
             CASE WHEN roster_pending = true AND password_hash IS NULL AND reset_token IS NOT NULL
                       AND reset_token_expires > ${setupFloor}
                  THEN reset_token END AS setup_token
      FROM users
      WHERE LOWER(email) = ${e}
      ORDER BY created_at ASC NULLS LAST, id ASC
      LIMIT ${MAX_PLAYERS_PER_EMAIL}
    `) as unknown as ResetPlayerRow[]
  } catch (err) {
    if (!isMissingColumn(err)) throw err
    return (await db`
      SELECT id, first_name, nickname, NULL::uuid AS login_group_id FROM users
      WHERE LOWER(email) = ${e}
      ORDER BY created_at ASC NULLS LAST, id ASC
      LIMIT ${MAX_PLAYERS_PER_EMAIL}
    `) as unknown as ResetPlayerRow[]
  }
}

/** One reset link / code in a family email: one per account (or shared login). */
export interface PlayerResetLink {
  userId: string
  token: string
  /** "Liam", or "Liam and Harper" for one shared login; null when unnamed. */
  label: string | null
  /** More than one account opens with this password (a shared login). */
  shared: boolean
}

export type ResetIssue =
  /** Org, coach, or the only player account on the address: one link / code, as before. */
  | { kind: 'single'; token: string }
  /** Several player accounts on the address (siblings): one link / code each. */
  | { kind: 'players'; accounts: PlayerResetLink[] }

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Issues password-reset tokens for whatever account owns `email`. Account
 * types are checked in the same priority order as login (org → founding
 * coach → additional coach → player). Returns null if no account uses this
 * email — callers should stay silent either way so the response can't be used
 * to probe which emails are registered.
 *
 * Several PLAYER accounts may share one address (siblings). Each gets its OWN
 * token, so each emailed link / app code resets exactly one child. Accounts in
 * one opted-in shared login (users.login_group_id) share one password, so the
 * group gets one token (on its oldest row) and consuming it moves the whole
 * group (consumeResetToken). The 6-digit codes derived from the tokens are
 * kept distinct within one email, so a typed code names one account.
 */
export async function issueResetTokens(email: string): Promise<ResetIssue | null> {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + TOKEN_TTL_MS)

  const orgs = (await db`
    UPDATE organizations SET reset_token = ${token}, reset_token_expires = ${expires}
    WHERE admin_email = ${email} RETURNING id
  `) as unknown as Array<{ id: string }>
  if (orgs.length > 0) return { kind: 'single', token }

  // A founding coach can own several teams; the token goes on every team row
  // so the reset link resolves no matter which row is read back.
  const teams = (await db`
    UPDATE teams SET reset_token = ${token}, reset_token_expires = ${expires}
    WHERE LOWER(admin_email) = LOWER(${email}) AND password_hash IS NOT NULL RETURNING id
  `) as unknown as Array<{ id: string }>
  if (teams.length > 0) return { kind: 'single', token }

  const coaches = (await db`
    UPDATE team_coaches SET reset_token = ${token}, reset_token_expires = ${expires}
    WHERE LOWER(email) = LOWER(${email}) AND password_hash IS NOT NULL RETURNING id
  `) as unknown as Array<{ id: string }>
  if (coaches.length > 0) return { kind: 'single', token }

  const rows = await playerRowsForReset(email)
  if (rows.length === 0) return null

  // Group rows by shared login; an ungrouped row is its own group.
  const groups: ResetPlayerRow[][] = []
  const byGroup = new Map<string, ResetPlayerRow[]>()
  for (const r of rows) {
    if (!r.login_group_id) { groups.push([r]); continue }
    const g = byGroup.get(r.login_group_id)
    if (g) g.push(r)
    else { const ng = [r]; byGroup.set(r.login_group_id, ng); groups.push(ng) }
  }

  const usedCodes = new Set<string>()
  const links: PlayerResetLink[] = []
  for (const g of groups) {
    const [rep, ...rest] = g
    // An account still waiting to be set up keeps its live setup link: a
    // 1-hour reset token in its place broke every setup / results email
    // already sent to the family. The same token is re-sent here instead.
    const kept = rest.length === 0 && rep.setup_token && !usedCodes.has(resetCodeFromToken(rep.setup_token))
      ? rep.setup_token
      : null
    let t = kept ?? (groups.length === 1 ? token : crypto.randomBytes(32).toString('hex'))
    // Distinct codes per email: a typed code must name exactly one account.
    while (!kept && usedCodes.has(resetCodeFromToken(t))) t = crypto.randomBytes(32).toString('hex')
    usedCodes.add(resetCodeFromToken(t))
    if (!kept) await db`UPDATE users SET reset_token = ${t}, reset_token_expires = ${expires} WHERE id = ${rep.id}`
    if (rest.length > 0) {
      // The rest of a shared login resets with the group's link; a stale
      // token of their own would only make a typed code ambiguous.
      await db`
        UPDATE users SET reset_token = NULL, reset_token_expires = NULL
        WHERE id = ANY(${rest.map((r) => r.id)}::uuid[])
      `
    }
    const names = g.map(playerFirstName).filter((n): n is string => !!n)
    links.push({ userId: rep.id, token: t, label: names.length ? joinNames(names) : null, shared: g.length > 1 })
  }

  if (links.length === 1) return { kind: 'single', token: links[0].token }
  return { kind: 'players', accounts: links }
}

/**
 * The 6-digit code the iOS app flow emails instead of a link. Derived from the
 * stored token, so no extra column is needed and the emailed link keeps
 * working too. Brute force is covered by the reset-password route's per-email
 * and per-IP rate limits.
 */
export function resetCodeFromToken(token: string): string {
  return String(parseInt(token.slice(0, 12), 16) % 1_000_000).padStart(6, '0')
}

function codeMatches(token: string, code: string): boolean {
  const expected = resetCodeFromToken(token)
  return code.length === expected.length && crypto.timingSafeEqual(Buffer.from(code), Buffer.from(expected))
}

/**
 * The live reset token on `email` whose 6-digit code is `code` (the app's
 * code-entry flow turns email+code back into the full token), without
 * consuming it. Account types are checked in the same priority order as
 * issueResetTokens: an org / coach address compares against its one token, as
 * before. A player address may hold several live tokens (one per sibling):
 * whichever sibling's code matches is returned. Null when none does.
 *
 * Every candidate is compared (constant-time), so the time taken does not
 * say which sibling — or whether any — was close. The caller's per-email
 * attempt limit is what bounds guessing.
 */
export async function peekResetTokenByEmail(email: string, code: string): Promise<string | null> {
  const [org] = (await db`
    SELECT reset_token FROM organizations
    WHERE admin_email = ${email} AND reset_token IS NOT NULL AND reset_token_expires > NOW()
  `) as unknown as [{ reset_token: string } | undefined]
  if (org?.reset_token) return codeMatches(org.reset_token, code) ? org.reset_token : null

  const [team] = (await db`
    SELECT reset_token FROM teams
    WHERE LOWER(admin_email) = LOWER(${email}) AND password_hash IS NOT NULL
      AND reset_token IS NOT NULL AND reset_token_expires > NOW()
    LIMIT 1
  `) as unknown as [{ reset_token: string } | undefined]
  if (team?.reset_token) return codeMatches(team.reset_token, code) ? team.reset_token : null

  const [coach] = (await db`
    SELECT reset_token FROM team_coaches
    WHERE LOWER(email) = LOWER(${email}) AND password_hash IS NOT NULL
      AND reset_token IS NOT NULL AND reset_token_expires > NOW()
    LIMIT 1
  `) as unknown as [{ reset_token: string } | undefined]
  if (coach?.reset_token) return codeMatches(coach.reset_token, code) ? coach.reset_token : null

  const users = (await db`
    SELECT reset_token FROM users
    WHERE LOWER(email) = ${norm(email)} AND reset_token IS NOT NULL AND reset_token_expires > NOW()
    ORDER BY reset_token_expires DESC, id ASC
    LIMIT ${MAX_PLAYERS_PER_EMAIL}
  `) as unknown as Array<{ reset_token: string }>
  let found: string | null = null
  for (const u of users) {
    if (codeMatches(u.reset_token, code) && found === null) found = u.reset_token
  }
  return found
}

/**
 * The PLAYER account a reset / setup token belongs to (null for an org or
 * coach token, or an unknown / expired one), without consuming it. Lets the
 * reset route check the new password against the account's siblings, and the
 * reset page name the child.
 */
export async function playerForResetToken(
  token: string,
): Promise<{
  id: string
  email: string
  first_name: string | null
  nickname: string | null
  setup: boolean
  /** Other player accounts on the same address. */
  siblings: number
} | null> {
  if (typeof token !== 'string' || !token) return null
  const [other] = (await db`
    SELECT 1 FROM organizations WHERE reset_token = ${token} AND reset_token_expires > NOW()
    UNION ALL
    SELECT 1 FROM teams WHERE reset_token = ${token} AND reset_token_expires > NOW()
    UNION ALL
    SELECT 1 FROM team_coaches WHERE reset_token = ${token} AND reset_token_expires > NOW()
    LIMIT 1
  `) as unknown as [unknown | undefined]
  if (other) return null
  const [u] = (await db`
    SELECT u.id, u.email, u.first_name, u.nickname, u.password_hash IS NULL AS setup,
           (SELECT COUNT(*)::int FROM users o WHERE LOWER(o.email) = LOWER(u.email) AND o.id <> u.id) AS siblings
    FROM users u
    WHERE u.reset_token = ${token} AND u.reset_token_expires > NOW()
  `) as unknown as [{ id: string; email: string; first_name: string | null; nickname: string | null; setup: boolean; siblings: number } | undefined]
  return u ?? null
}

/**
 * Read-only: is this reset / setup token live (any account kind), and, for a
 * player, the facts the page may show. Never consumes or rotates the token.
 * `rosterSetup`: a coach/org-added player finishing setup (roster_pending, no
 * password yet), labelled "First L." for the page heading.
 */
export async function resetTokenStatus(token: string): Promise<
  | { valid: false }
  | { valid: true; player: null }
  | {
      valid: true
      player: { firstName: string | null; label: string | null; rosterSetup: boolean; siblings: number; setup: boolean }
    }
> {
  if (typeof token !== 'string' || !/^[0-9a-f]{16,128}$/i.test(token)) return { valid: false }
  const [other] = (await db`
    SELECT 1 FROM organizations WHERE reset_token = ${token} AND reset_token_expires > NOW()
    UNION ALL
    SELECT 1 FROM teams WHERE reset_token = ${token} AND reset_token_expires > NOW()
    UNION ALL
    SELECT 1 FROM team_coaches WHERE reset_token = ${token} AND reset_token_expires > NOW()
    LIMIT 1
  `) as unknown as [unknown | undefined]
  if (other) return { valid: true, player: null }
  const [u] = (await db`
    SELECT u.first_name, u.nickname, NULLIF(TRIM(u.last_initial), '') AS last_initial,
           u.password_hash IS NULL AS setup,
           (COALESCE(u.roster_pending, false) AND u.password_hash IS NULL) AS roster_setup,
           (SELECT COUNT(*)::int FROM users o WHERE LOWER(o.email) = LOWER(u.email) AND o.id <> u.id) AS siblings
    FROM users u
    WHERE u.reset_token = ${token} AND u.reset_token_expires > NOW()
  `) as unknown as [{
    first_name: string | null
    nickname: string | null
    last_initial: string | null
    setup: boolean
    roster_setup: boolean
    siblings: number
  } | undefined]
  if (!u) return { valid: false }
  const first = playerFirstName(u)
  const li = u.last_initial ? u.last_initial.charAt(0).toUpperCase() : null
  return {
    valid: true,
    player: {
      firstName: first,
      label: first ? (li ? `${first} ${li}.` : first) : null,
      rosterSetup: u.roster_setup,
      siblings: u.siblings,
      setup: u.setup,
    },
  }
}

/** Stable machine code for the different-password refusal. */
export const SIBLING_PASSWORD_CODE = 'password_matches_sibling'

/**
 * The different-password rule (SIBLING-DECISIONS): siblings on one address
 * are told apart by their passwords, so a player account may not take a
 * password that already opens ANOTHER player account on the same address —
 * unless the two opted into one shared login (same users.login_group_id).
 * Returns the plain refusal to show, or null when the password is fine.
 *
 * `selfId` is the account being given the password (null for a signup that
 * has not created it yet). At most MAX_PLAYERS_PER_EMAIL rows are compared
 * (bcrypt is slow on purpose). Pass `sql` to run inside a transaction.
 */
export async function siblingPasswordClash(
  email: string,
  password: string,
  selfId: string | null,
  sql: Sql | TransactionSql = db,
): Promise<string | null> {
  if (typeof password !== 'string' || !password) return null
  const e = norm(email)
  let rows: Array<{ first_name: string | null; nickname: string | null; password_hash: string }>
  try {
    rows = (await sql`
      SELECT o.first_name, o.nickname, o.password_hash FROM users o
      WHERE LOWER(o.email) = ${e} AND o.password_hash IS NOT NULL
        AND (${selfId}::uuid IS NULL OR o.id <> ${selfId}::uuid)
        AND NOT EXISTS (
          SELECT 1 FROM users me
          WHERE me.id = ${selfId}::uuid AND me.login_group_id IS NOT NULL
            AND me.login_group_id = o.login_group_id
        )
      ORDER BY o.created_at ASC NULLS LAST, o.id ASC
      LIMIT ${MAX_PLAYERS_PER_EMAIL}
    `) as unknown as typeof rows
  } catch (err) {
    if (!isMissingColumn(err)) throw err
    rows = (await sql`
      SELECT o.first_name, o.nickname, o.password_hash FROM users o
      WHERE LOWER(o.email) = ${e} AND o.password_hash IS NOT NULL
        AND (${selfId}::uuid IS NULL OR o.id <> ${selfId}::uuid)
      ORDER BY o.created_at ASC NULLS LAST, o.id ASC
      LIMIT ${MAX_PLAYERS_PER_EMAIL}
    `) as unknown as typeof rows
  }
  if (rows.length === 0) return null
  const hits = await Promise.all(rows.map((r) => bcrypt.compare(password, r.password_hash)))
  const i = hits.indexOf(true)
  if (i < 0) return null
  const name = playerFirstName(rows[i])
  return name
    ? `Pick a different password from ${name}'s. Each player on a family email has their own password. (Families who want one shared login can set that up later in Settings → Family, after confirming their email.)`
    : 'Pick a different password from the other player on this email. Each player on a family email has their own password. (Families who want one shared login can set that up later in Settings → Family, after confirming their email.)'
}

export interface ResetTarget {
  kind: AccountKind
  email: string
  userId?: string // set when kind === 'user'
  orgId?: string // set when kind === 'org'
  teamId?: string // set when kind === 'team' | 'team_coach'
  /** Where the freshly-logged-in account should land. */
  redirect: string
  /**
   * True when this set the FIRST password on a coach/org-added player
   * (roster_pending stub finishing setup from its setup link) — not a reset,
   * so no "your password was changed" notice.
   */
  firstPassword?: boolean
}

/**
 * Verifies a reset token, writes `passwordHash` to the matching account,
 * clears the token, and reports which session the caller should issue.
 * Returns null if the token is unknown or expired.
 */
export async function consumeResetToken(
  token: string,
  passwordHash: string,
  opts: {
    /**
     * The link came from a confirm / setup link bound to THIS player account
     * (lib/email-entitlements.ts verifyChosenAccountToken): a comp on a shared
     * address goes to it without a second click.
     */
    chosenUserId?: string | null
  } = {},
): Promise<ResetTarget | null> {
  const [org] = (await db`
    SELECT id, admin_email FROM organizations
    WHERE reset_token = ${token} AND reset_token_expires > NOW()
  `) as unknown as [{ id: string; admin_email: string } | undefined]
  if (org) {
    await db`
      UPDATE organizations
      SET password_hash = ${passwordHash}, reset_token = NULL, reset_token_expires = NULL
      WHERE id = ${org.id}
    `
    // The token only travels to this inbox (link or app code): inbox proof.
    await recordResetInboxProof({ orgId: org.id }, passwordHash)
    return { kind: 'org', orgId: org.id, email: org.admin_email, redirect: '/org/dashboard' }
  }

  const [team] = (await db`
    SELECT id, admin_email FROM teams
    WHERE reset_token = ${token} AND reset_token_expires > NOW()
  `) as unknown as [{ id: string; admin_email: string } | undefined]
  if (team) {
    await setCoachPasswordEverywhere(team.admin_email, passwordHash)
    // Every row now on this hash was just set through the inbox: proof, so a
    // squatter row elsewhere on the address can't freeze coach tokens.
    await recordResetInboxProof({ coachEmail: team.admin_email }, passwordHash)
    return { kind: 'team', teamId: team.id, email: team.admin_email, redirect: '/team/dashboard' }
  }

  const [coach] = (await db`
    SELECT id, team_id, email FROM team_coaches
    WHERE reset_token = ${token} AND reset_token_expires > NOW()
  `) as unknown as [{ id: string; team_id: string; email: string } | undefined]
  if (coach) {
    await setCoachPasswordEverywhere(coach.email, passwordHash)
    await recordResetInboxProof({ coachEmail: coach.email }, passwordHash)
    return { kind: 'team_coach', teamId: coach.team_id, email: coach.email, redirect: '/team/dashboard' }
  }

  const [user] = (await db`
    SELECT id, email,
           (password_hash IS NULL AND (
              COALESCE(roster_pending, false)
              OR NOT EXISTS (SELECT 1 FROM user_oauth_identities oi WHERE oi.user_id = users.id)
           )) AS first_password
    FROM users
    WHERE reset_token = ${token} AND reset_token_expires > NOW()
  `) as unknown as [{ id: string; email: string; first_password: boolean } | undefined]
  if (user) {
    // roster_pending is cleared too: a coach/org-added player who sets a
    // password here has finished setup and should no longer read "incomplete".
    // The token only ever travels to this account's own inbox (reset email,
    // app reset code, setup link), so consuming it proves the address:
    // email_verified_at is set, and a comp waiting on the address activates.
    await db`
      UPDATE users
      SET password_hash = ${passwordHash}, roster_pending = false,
          reset_token = NULL, reset_token_expires = NULL,
          email_verified_at = COALESCE(email_verified_at, NOW())
      WHERE id = ${user.id}
    `
    // One shared login (users.login_group_id), one password: the group's
    // reset link (issueResetTokens puts it on the oldest member) moves every
    // member that already has a password, or the old password would keep
    // opening the rest of the group. Same address only.
    try {
      await db`
        UPDATE users o
        SET password_hash = ${passwordHash}, reset_token = NULL, reset_token_expires = NULL
        FROM users me
        WHERE me.id = ${user.id} AND me.login_group_id IS NOT NULL
          AND o.login_group_id = me.login_group_id AND o.id <> me.id
          AND LOWER(o.email) = LOWER(me.email) AND o.password_hash IS NOT NULL
      `
    } catch (err) {
      if (!isMissingColumn(err)) throw err
    }
    await applyEmailEntitlement(user.id, { chosen: !!opts.chosenUserId && opts.chosenUserId === user.id })
    return { kind: 'user', userId: user.id, email: user.email, redirect: '/dashboard', firstPassword: !!user.first_password }
  }

  return null
}

/**
 * One coach, one password. A coach can head some teams (teams.admin_email)
 * and assist on others (team_coaches), and add-coach copies the existing hash
 * onto every new row — so a reset has to move ALL of them together, or the
 * old password keeps opening the rows that were not touched and the new one
 * opens only one team.
 *
 * Only rows whose invite was already accepted (a password is set) are
 * updated: an invite still waiting in the inbox stays an invite, and is
 * accepted through its own link (see acceptCoachInvitePassword).
 * Case-insensitive on the email, and every reset token for it is cleared.
 */
export async function setCoachPasswordEverywhere(email: string, passwordHash: string): Promise<void> {
  const e = email.toLowerCase().trim()
  await db`
    UPDATE teams
    SET password_hash = ${passwordHash}, reset_token = NULL, reset_token_expires = NULL
    WHERE LOWER(admin_email) = ${e} AND password_hash IS NOT NULL
  `
  try {
    await db`
      UPDATE team_coaches
      SET password_hash = ${passwordHash}, reset_token = NULL, reset_token_expires = NULL
      WHERE LOWER(email) = ${e} AND password_hash IS NOT NULL
    `
  } catch (err) {
    // team_coaches may not exist on a very old schema.
    console.warn('[password-reset] team_coaches update failed:', err instanceof Error ? err.message : err)
  }
}

export type CoachInvitePassword =
  | { ok: true; hash: string }
  | { ok: false; error: string }

/**
 * The password hash to store when a coach accepts an invite (a head-coach
 * setup link on `teams`, or an added-coach signup link on `team_coaches`).
 *
 * A brand-new coach email has no other rows: the typed password is simply
 * hashed for this one row.
 *
 * An email that already coaches another team keeps ONE password. Invite links
 * can be shared (the inviting coach sees theirs), so an invite must never be
 * able to change the password on teams it wasn't for — the typed password has
 * to be the one the coach already uses, and that hash is copied onto the
 * invite row.
 */
export async function acceptCoachInvitePassword(
  email: string,
  password: string,
  cost: number,
  /** The invite row itself, which never counts as "another team". */
  self: { teamId: string } | { coachId: string },
): Promise<CoachInvitePassword> {
  const e = email.toLowerCase().trim()
  const selfTeam = 'teamId' in self ? self.teamId : null
  const selfCoach = 'coachId' in self ? self.coachId : null
  const existing = (await db`
    SELECT DISTINCT password_hash FROM (
      SELECT password_hash FROM teams
      WHERE LOWER(admin_email) = ${e} AND password_hash IS NOT NULL
        AND (${selfTeam}::uuid IS NULL OR id <> ${selfTeam}::uuid)
      UNION ALL
      SELECT password_hash FROM team_coaches
      WHERE LOWER(email) = ${e} AND password_hash IS NOT NULL
        AND (${selfCoach}::uuid IS NULL OR id <> ${selfCoach}::uuid)
    ) x
  `) as unknown as Array<{ password_hash: string }>

  if (existing.length === 0) return { ok: true, hash: await bcrypt.hash(password, cost) }

  for (const row of existing) {
    if (await bcrypt.compare(password, row.password_hash)) return { ok: true, hash: row.password_hash }
  }
  return {
    ok: false,
    error:
      'You already coach another team on LearnHoops with this email. Enter the password you use there — one password works for all your teams. Forgot it? Use “Forgot password” on the coach login page.',
  }
}
