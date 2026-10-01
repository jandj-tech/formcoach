import crypto from 'crypto'
import { emailBelongsToCoachOrOrg, markCoachInviteEmailedOnly, sameOrgCoachCredential } from '@/lib/team-auth'
import { db } from '@/lib/db'
import { addToEmailList } from '@/lib/email-list'
import { grantFreeOrgTokensIfEligible } from '@/lib/team-tokens'
import { sendPlayerSetupEmail, sendCoachSignupEmail, sendCoachAddedToTeamEmail } from '@/lib/email'
import { resolveBaseUrl } from '@/lib/base-url'
import { cleanDisplayText, cleanOptionalDisplayText } from '@/lib/moderation'
import { isValidEmail as isValidEmailShared, importRowProblem } from '@/lib/csv'
import { rateLimit } from '@/lib/rate-limit'
import { MAX_PLAYERS_PER_EMAIL } from '@/lib/player-accounts'
import { safeLocalPath } from '@/lib/safe-next'

// Adds a player to a team the way a coach or org would: no password required.
//
// The account model (chosen 2026-09-23): when an email is given we create a
// real users row up front with roster_pending = true, plus a team_membership,
// so the player is a first-class roster entry immediately — the org can give
// them tokens and upload for them. Without an email we fall back to the
// name-only pending_team_members placeholder (claimed by invite link).
//
// Security rules (QA 2026-09-28, C2/C4):
//  - The setup link is only ever EMAILED to the address. It is never returned
//    to the coach/org who added the player — otherwise adding a stranger's
//    email would hand the adder that stranger's account.
//  - Creating a stub never adopts earlier submissions made under that email.
//    Only the person who proves the inbox (setup link / signup / OAuth) owns
//    that history.
//  - Family email (sibling accounts, 2026-09-29): several PLAYER accounts may
//    share one address (see lib/player-accounts.ts). An email that already
//    belongs to a player with a DIFFERENT first name gets a NEW password-less
//    stub for this child on the same address ('created' + sharedEmail) and a
//    setup email naming this child. The same first name is the same child
//    (e.g. on a second team) and is linked. Nothing is ever merged across
//    first names — not here, and not when an invite is claimed.
//  - The older name-only "contact_email" workaround (a sibling added without
//    an account, emailed at the family address) is no longer created. Rows
//    that already carry one keep working, and giveOwnAccount turns them into
//    a real account.

const SETUP_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 days — an invite, not a reset

export type AddPlayerStatus =
  | 'created'          // new stub account created + membership (setup email if requested)
  | 'linked'           // an account with this email (same player) already existed → added to the team
  | 'already_on_team'  // already on this team (same email, or same name with no email to tell apart)
  | 'invited'          // no email → name-only pending invite created

export interface AddPlayerResult {
  status: AddPlayerStatus
  userId?: string
  /**
   * The account was created on an address another player account already
   * uses (a sibling sharing the parent's email). Each child still has their
   * own account and their own setup email.
   */
  sharedEmail?: boolean
  /**
   * The sibling accounts on that address the adder may see named (players on
   * this team or elsewhere in this organization), e.g. ["Liam S."].
   */
  sharesWith?: string[]
  /** A name-only entry for this child already on the team was turned into this account. */
  converted?: boolean
  /** Shots moved from the name-only entry onto the account (converted only). */
  movedShots?: number
  /** Only for name-only players: the link they use to claim their spot. */
  inviteUrl?: string
  emailed?: boolean
  displayName: string
  /** Plain-language outcome to show the coach. */
  message: string
  /** Added, but worth a second look (possible duplicate). */
  warning?: string
  /**
   * already_on_team because a player with the same first name and last
   * initial is on the team and there is no email to tell them apart. The
   * caller can retry with allowDuplicateName when it really is someone else.
   */
  nameMatch?: boolean
}

export interface AddPlayerInput {
  teamId: string
  firstName: string
  lastName?: string | null
  email?: string | null
  parentName?: string | null
  phone?: string | null
  /** Email the player/parent the setup link. Ignored when there is no email. */
  sendEmail?: boolean
  /** Team name for the setup email. Looked up when omitted. */
  teamName?: string | null
  /** Organization name for the setup email. Looked up when omitted. */
  orgName?: string | null
  /** Who added the player, for the setup email ("Coach Derek", or the org's name). */
  addedBy?: string | null
  /** Add even though a same-named, email-less player is already on the team. */
  allowDuplicateName?: boolean
}

export class AddPlayerError extends Error {}

function cleanName(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ')
}

type Sql = typeof db

function lastInitial(lastName: string | null | undefined): string | null {
  const c = cleanName(lastName).charAt(0)
  return c ? c.toUpperCase() : null
}

function nameLabel(first: string, li: string | null): string {
  return `${first}${li ? ' ' + li + '.' : ''}`
}

export function isValidEmail(email: string): boolean {
  return isValidEmailShared(email)
}

/**
 * A setup token issued within this window is re-sent as-is rather than
 * replaced, so every recent setup / results email for the player keeps
 * working. An older one is rotated to a fresh 14-day token, so one leaked link
 * doesn't stay good for the full 14 days however many emails follow it; a
 * shorter-lived token (a 1-hour forgot-password one) is always replaced.
 * Issue time is read off the expiry (expires = issued + SETUP_TOKEN_TTL_MS).
 */
const SETUP_TOKEN_REUSE_WINDOW_MS = 72 * 60 * 60 * 1000

/**
 * One daily cap across EVERY setup-link email to a player (add, import,
 * resend, send-to-all, finish-setup-to-see-results), on top of each path's own
 * hourly limit, so no mix of buttons can mail a family inbox all day.
 */
const SETUP_EMAILS_PER_DAY = 10

/** Records one setup-link email to `userId`; false once today's cap is used up. */
export async function setupEmailDailyOk(userId: string): Promise<boolean> {
  return (await rateLimit(`player-setup-day:${userId}`, SETUP_EMAILS_PER_DAY, 86400)).ok
}

/**
 * Returns the link that lets a roster-pending player set a password, issuing
 * a 14-day setup token when needed. Reuses the reset_token column so the
 * existing /reset-password flow completes the account.
 *
 * Several emails can carry a setup link (the setup email, a resend, a "finish
 * setup to see your results" email): they all carry the SAME current token,
 * so an earlier email's button still works after a later one arrives. The
 * token is still single-use (consuming it clears it), still expires, and is
 * still only ever emailed to the account's own (unchangeable) address.
 *
 * `next` (a same-site path) is where the player lands once the password is
 * set, e.g. their results. It never carries anything secret.
 *
 * The link must only ever be emailed to the player's own address.
 */
export async function issuePlayerSetupToken(
  userId: string,
  opts: { next?: string | null } = {},
): Promise<string | null> {
  const fresh = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SETUP_TOKEN_TTL_MS)
  const reuseUntil = new Date(Date.now() + SETUP_TOKEN_TTL_MS - SETUP_TOKEN_REUSE_WINDOW_MS)
  // One statement, so two sends racing each other agree on the token. SET
  // expressions read the row's values from before the update.
  const rows = (await db`
    UPDATE users SET
      reset_token = CASE
        WHEN reset_token IS NOT NULL AND reset_token_expires > ${reuseUntil} THEN reset_token
        ELSE ${fresh}
      END,
      reset_token_expires = CASE
        WHEN reset_token IS NOT NULL AND reset_token_expires > ${reuseUntil} THEN reset_token_expires
        ELSE ${expires}
      END
    WHERE id = ${userId} AND roster_pending = true AND password_hash IS NULL
    RETURNING reset_token
  `) as unknown as Array<{ reset_token: string }>
  if (rows.length === 0 || !rows[0].reset_token) return null
  const next = safeLocalPath(opts.next)
  return `${resolveBaseUrl()}/reset-password?token=${rows[0].reset_token}&setup=1${next ? `&next=${encodeURIComponent(next)}` : ''}`
}

export type ResendSetupOutcome =
  | { ok: true; email: string; teamName: string | null }
  | { ok: false; reason: 'not_pending' | 'rate_limited' | 'send_failed'; email?: string; teamName?: string | null; daily?: boolean }

/**
 * (Re)sends the setup email to a roster-pending player — the only way a setup
 * link ever leaves the server. Rate-limited per player (3 an hour) so neither a
 * coach's button nor the public signup form can be used to flood an inbox.
 * `teamId` picks which team the email is about; otherwise the most recent.
 */
export async function resendPlayerSetup(
  userId: string,
  opts: { teamId?: string | null; addedBy?: string | null } = {},
): Promise<ResendSetupOutcome> {
  const [u] = (await db`
    SELECT id, email, parent_name,
           NULLIF(TRIM(first_name), '') AS first_name,
           NULLIF(TRIM(last_initial), '') AS last_initial,
           NULLIF(split_part(TRIM(COALESCE(nickname, '')), ' ', 1), '') AS nick_first
    FROM users
    WHERE id = ${userId} AND roster_pending = true AND password_hash IS NULL
  `) as unknown as [{
    id: string
    email: string
    parent_name: string | null
    first_name: string | null
    last_initial: string | null
    nick_first: string | null
  } | undefined]
  if (!u) return { ok: false, reason: 'not_pending' }

  const [m] = (await db`
    SELECT tm.first_name, tm.last_name_initial, t.id AS team_id, t.name AS team_name, o.name AS org_name
    FROM team_memberships tm
    JOIN teams t ON t.id = tm.team_id
    LEFT JOIN organizations o ON o.id = t.organization_id
    WHERE tm.user_id = ${userId}
      AND (${opts.teamId ?? null}::uuid IS NULL OR tm.team_id = ${opts.teamId ?? null}::uuid)
    ORDER BY tm.joined_at DESC
    LIMIT 1
  `) as unknown as [{
    first_name: string | null
    last_name_initial: string | null
    team_id: string
    team_name: string
    org_name: string | null
  } | undefined]

  const limit = await rateLimit(`player-setup:${userId}`, 3, 3600)
  if (!limit.ok) return { ok: false, reason: 'rate_limited', email: u.email, teamName: m?.team_name ?? null }
  if (!(await setupEmailDailyOk(userId))) {
    return { ok: false, reason: 'rate_limited', daily: true, email: u.email, teamName: m?.team_name ?? null }
  }

  const url = await issuePlayerSetupToken(u.id)
  if (!url) return { ok: false, reason: 'not_pending' }
  // The team's name for the child, else the account's own (a stub with no
  // membership yet), else its nickname — several children may share this
  // inbox, so the email must say which one it is for.
  const playerName = m?.first_name?.trim()
    ? nameLabel(m.first_name.trim(), m.last_name_initial?.trim() || null)
    : u.first_name
      ? nameLabel(u.first_name, u.last_initial?.toUpperCase() || null)
      : u.nick_first
        ? nameLabel(u.nick_first, u.last_initial?.toUpperCase() || null)
        : null
  try {
    await sendPlayerSetupEmail(u.email, m?.team_name ?? null, url, u.parent_name, {
      playerName,
      addedBy: opts.addedBy ?? m?.org_name ?? null,
      orgName: m?.org_name ?? null,
    })
  } catch (err) {
    console.error('[roster] setup resend failed:', err instanceof Error ? err.message : err)
    return { ok: false, reason: 'send_failed', email: u.email, teamName: m?.team_name ?? null }
  }
  return { ok: true, email: u.email, teamName: m?.team_name ?? null }
}

export interface TeamContext {
  id: string
  name: string
  orgName: string | null
}

export async function getTeamContext(teamId: string): Promise<TeamContext | null> {
  const [row] = (await db`
    SELECT t.id, t.name, o.name AS org_name
    FROM teams t LEFT JOIN organizations o ON o.id = t.organization_id
    WHERE t.id = ${teamId}
  `) as unknown as [{ id: string; name: string; org_name: string | null } | undefined]
  return row ? { id: row.id, name: row.name, orgName: row.org_name } : null
}

/**
 * How a coach is named in a player's setup email: "Coach Derek" when they set
 * a display name, otherwise null (the email then says "Your coach").
 */
export async function coachDisplayName(teamId: string, email: string): Promise<string | null> {
  const e = email.toLowerCase().trim()
  try {
    const [head] = (await db`
      SELECT coach_nickname FROM teams WHERE id = ${teamId} AND LOWER(admin_email) = ${e}
    `) as unknown as [{ coach_nickname: string | null } | undefined]
    let nick = head?.coach_nickname ?? null
    if (!head) {
      const [c] = (await db`
        SELECT nickname FROM team_coaches WHERE team_id = ${teamId} AND LOWER(email) = ${e} LIMIT 1
      `) as unknown as [{ nickname: string | null } | undefined]
      nick = c?.nickname ?? null
    }
    nick = (nick ?? '').trim()
    if (!nick) return null
    return /^coach\b/i.test(nick) ? nick : `Coach ${nick}`
  } catch {
    return null
  }
}

interface SameNameMatch {
  kind: 'pending' | 'player' | 'member'
  id: string
  inviteToken: string | null
  hasEmail: boolean
}

// Everyone on the team already known by this first name + last initial:
// name-only invites, coach-upload players and account members.
async function findSameNameOnTeam(teamId: string, first: string, li: string | null): Promise<SameNameMatch[]> {
  const f = first.toLowerCase()
  const i = li ?? ''
  const out: SameNameMatch[] = []
  const pending = (await db`
    SELECT id, invite_token FROM pending_team_members
    WHERE team_id = ${teamId} AND LOWER(TRIM(first_name)) = ${f}
      AND UPPER(COALESCE(TRIM(last_name_initial), '')) = ${i}
    ORDER BY created_at ASC
  `) as unknown as Array<{ id: string; invite_token: string | null }>
  for (const p of pending) {
    out.push({ kind: 'pending', id: p.id, inviteToken: p.invite_token, hasEmail: false })
  }
  try {
    const players = (await db`
      SELECT id FROM team_players
      WHERE team_id = ${teamId} AND LOWER(TRIM(first_name)) = ${f}
        AND UPPER(COALESCE(TRIM(last_name_initial), '')) = ${i}
    `) as unknown as Array<{ id: string }>
    for (const p of players) out.push({ kind: 'player', id: p.id, inviteToken: null, hasEmail: false })
  } catch {
    // team_players may not exist on an old schema
  }
  const members = (await db`
    SELECT user_id AS id FROM team_memberships
    WHERE team_id = ${teamId} AND LOWER(TRIM(first_name)) = ${f}
      AND UPPER(COALESCE(TRIM(last_name_initial), '')) = ${i}
  `) as unknown as Array<{ id: string }>
  for (const m of members) out.push({ kind: 'member', id: m.id, inviteToken: null, hasEmail: true })
  return out
}

function inviteLink(token: string): string {
  return `${resolveBaseUrl()}/signup?teamInvite=${token}`
}

// ── Class teams (the 10-week program) ─────────────────────────────────────
//
// A team created by a class purchase (teams.class_package_id) counts a
// player's shots only through an org_class_enrollments row. /api/team/join
// makes one when a player joins with the code; adding the player to the
// roster here (single add, CSV import, the Program Manager) makes the same
// row, within the package's places. A name-only player's row has no user_id
// and is matched by first name + last initial.

interface ClassSeats { packageId: string; places: number; enrolled: number }

/** The active class package behind a team, with its places, or null. */
async function classSeatsForTeam(teamId: string): Promise<ClassSeats | null> {
  const [row] = (await db`
    SELECT p.id, p.player_count,
           (SELECT COUNT(*)::int FROM org_class_enrollments e WHERE e.package_id = p.id) AS enrolled
    FROM teams t JOIN org_class_packages p ON p.id = t.class_package_id
    WHERE t.id = ${teamId} AND p.status = 'active'
  `) as unknown as [{ id: string; player_count: number; enrolled: number } | undefined]
  return row ? { packageId: row.id, places: row.player_count, enrolled: row.enrolled } : null
}

type ClassWho = { userId: string } | { firstName: string; li: string | null }

/** The enrolment this player already holds in the package (an account's, or a name-only one by name). */
async function heldEnrollment(sql: Sql, packageId: string, who: ClassWho): Promise<string | null> {
  const [row] = ('userId' in who
    ? await sql`
        SELECT id FROM org_class_enrollments WHERE package_id = ${packageId} AND user_id = ${who.userId}
      `
    : await sql`
        SELECT id FROM org_class_enrollments
        WHERE package_id = ${packageId} AND user_id IS NULL
          AND LOWER(TRIM(first_name)) = ${who.firstName.toLowerCase()}
          AND UPPER(COALESCE(TRIM(last_name_initial), '')) = ${who.li ?? ''}
        ORDER BY created_at ASC LIMIT 1
      `) as unknown as [{ id: string } | undefined]
  return row?.id ?? null
}

function classFullError(places: number): AddPlayerError {
  return new AddPlayerError(`This class is full — all ${places} places are taken.`)
}

/** Throws when the class is full and none of `who` already holds a place. */
async function assertClassPlace(seats: ClassSeats | null, who: ClassWho[], sql?: Sql): Promise<void> {
  if (!seats) return
  // Inside the caller's locked transaction the count is re-read there, not
  // taken from the earlier snapshot.
  const enrolled = sql
    ? ((await sql`
        SELECT COUNT(*)::int AS n FROM org_class_enrollments WHERE package_id = ${seats.packageId}
      `) as unknown as [{ n: number }])[0].n
    : seats.enrolled
  if (enrolled < seats.places) return
  for (const w of who) if (await heldEnrollment(sql ?? db, seats.packageId, w)) return
  throw classFullError(seats.places)
}

export type ClassEnrollOutcome =
  | { outcome: 'none' }                              // not a class team (or the package isn't active)
  | { outcome: 'full'; places: number }
  | { outcome: 'enrolled' | 'already'; enrollmentId: string }

/**
 * Enrols a roster player in the team's class, as /api/team/join does for a
 * player joining by code: same columns, same place limit (checked under a
 * per-package lock), idempotent. An account with no enrolment of its own
 * takes over a name-only enrolment of the same name when nothing else on the
 * team could own it (an older Program Manager entry with no roster player).
 */
export async function ensureClassEnrollment(
  teamId: string,
  who: { userId: string | null; firstName: string; li: string | null; newName?: boolean },
): Promise<ClassEnrollOutcome> {
  return (await db.begin(async (tx) => enrollInTx(tx as unknown as Sql, teamId, who))) as ClassEnrollOutcome
}

/** The per-package lock every place check + enrolment runs under (re-entrant within one transaction). */
async function lockClassPackage(sql: Sql, packageId: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext(${'class-package:' + packageId}))`
}

/**
 * ensureClassEnrollment inside the caller's transaction, so a roster add can
 * check the place, insert the roster row and enrol under ONE lock: checked
 * separately, parallel adds all saw a free place and the extras landed on the
 * roster with no enrolment (their shots never counted).
 */
async function enrollInTx(
  sql: Sql,
  teamId: string,
  who: { userId: string | null; firstName: string; li: string | null; newName?: boolean },
): Promise<ClassEnrollOutcome> {
  const [pkg] = (await sql`
    SELECT p.id, p.player_count
    FROM teams t JOIN org_class_packages p ON p.id = t.class_package_id
    WHERE t.id = ${teamId} AND p.status = 'active'
  `) as unknown as [{ id: string; player_count: number } | undefined]
  if (!pkg) return { outcome: 'none' } as ClassEnrollOutcome
  await lockClassPackage(sql, pkg.id)

  const first = cleanName(who.firstName)
  const byName = { firstName: first, li: who.li }
  if (who.userId) {
    const own = await heldEnrollment(sql, pkg.id, { userId: who.userId })
    if (own) return { outcome: 'already', enrollmentId: own } as ClassEnrollOutcome
    const orphan = await heldEnrollment(sql, pkg.id, byName)
    if (orphan) {
      const others = (await findSameNameOnTeam(teamId, first, who.li)).filter(m => m.kind !== 'member' || m.id !== who.userId)
      if (others.length === 0) {
        await sql`UPDATE org_class_enrollments SET user_id = ${who.userId} WHERE id = ${orphan} AND user_id IS NULL`
        return { outcome: 'already', enrollmentId: orphan } as ClassEnrollOutcome
      }
    }
  } else if (!who.newName) {
    const named = await heldEnrollment(sql, pkg.id, byName)
    if (named) return { outcome: 'already', enrollmentId: named } as ClassEnrollOutcome
  }

  const [{ n }] = (await sql`
    SELECT COUNT(*)::int AS n FROM org_class_enrollments WHERE package_id = ${pkg.id}
  `) as unknown as [{ n: number }]
  if (n >= pkg.player_count) return { outcome: 'full', places: pkg.player_count } as ClassEnrollOutcome

  // First-time class flag, as the Program Manager sets it: drives the small
  // display-score boost in analyze for a player's first class.
  let isFirstClass = true
  if (who.userId) {
    const [prior] = (await sql`
      SELECT id FROM org_class_enrollments
      WHERE user_id = ${who.userId} AND final_submission_id IS NOT NULL
      LIMIT 1
    `) as unknown as [{ id: string } | undefined]
    isFirstClass = !prior
  }
  const [row] = (await sql`
    INSERT INTO org_class_enrollments (package_id, user_id, first_name, last_name_initial, is_first_class)
    VALUES (${pkg.id}, ${who.userId}, ${first}, ${who.li}, ${isFirstClass})
    ON CONFLICT DO NOTHING
    RETURNING id
  `) as unknown as [{ id: string } | undefined]
  if (!row) {
    const again = who.userId ? await heldEnrollment(sql, pkg.id, { userId: who.userId }) : null
    return again ? { outcome: 'already', enrollmentId: again } : { outcome: 'none' }
  }
  return { outcome: 'enrolled', enrollmentId: row.id } as ClassEnrollOutcome
}

/**
 * The Program Manager's "already on the class team" case: enrols whoever the
 * roster already has by this first name + last initial — the account when the
 * only match is one account, else the name-only player.
 */
export async function ensureClassEnrollmentByName(
  teamId: string,
  firstNameRaw: string,
  lastNameRaw: string | null,
): Promise<ClassEnrollOutcome> {
  const first = cleanDisplayText(firstNameRaw, 50)
  if (!first.ok) throw new AddPlayerError(first.error)
  const li = lastInitial(lastNameRaw)
  const matches = await findSameNameOnTeam(teamId, first.value, li)
  const members = matches.filter(m => m.kind === 'member')
  const userId = members.length === 1 && matches.length === 1 ? members[0].id : null
  return ensureClassEnrollment(teamId, { userId, firstName: first.value, li })
}

/** ensureClassEnrollment for the add paths: never fails the add itself. */
async function enrolIfClassTeam(
  teamId: string,
  who: { userId: string | null; firstName: string; li: string | null; newName?: boolean },
): Promise<void> {
  try {
    const out = await ensureClassEnrollment(teamId, who)
    if (out.outcome === 'full') console.warn('[roster] class full, player not enrolled', { teamId })
  } catch (err) {
    console.error('[roster] class enrolment failed:', err instanceof Error ? err.message : err)
  }
}

// Name-only placeholder, with the same-name duplicate check.
async function addNameOnly(
  teamId: string,
  firstName: string,
  li: string | null,
  allowDuplicateName: boolean,
): Promise<AddPlayerResult> {
  const displayName = nameLabel(firstName, li)
  const matches = await findSameNameOnTeam(teamId, firstName, li)
  if (matches.length > 0 && !allowDuplicateName) {
    const pending = matches.find(m => m.kind === 'pending' && m.inviteToken)
    return {
      status: 'already_on_team',
      nameMatch: true,
      displayName,
      inviteUrl: pending?.inviteToken ? inviteLink(pending.inviteToken) : undefined,
      message: `${displayName} is already on this team. If this is a different player with the same name, choose "Add anyway".`,
    }
  }

  // A second same-named player needs a place of their own. On a class team
  // the place is taken (enrolment) and the roster row inserted in one
  // transaction under the package lock: a full class adds nobody.
  const newName = matches.length > 0
  const inviteToken = crypto.randomBytes(24).toString('hex')
  await db.begin(async (tx) => {
    const sql = tx as unknown as Sql
    const out = await enrollInTx(sql, teamId, { userId: null, firstName, li, newName })
    if (out.outcome === 'full') throw classFullError(out.places)
    await sql`
      INSERT INTO pending_team_members (team_id, first_name, last_name_initial, invite_token)
      VALUES (${teamId}, ${firstName}, ${li}, ${inviteToken})
    `
  })
  return {
    status: 'invited',
    inviteUrl: inviteLink(inviteToken),
    displayName,
    message: `${displayName} was added without an email. Share their invite link so they can join, or add an email later to send results.`,
    warning: matches.length > 0
      ? `Another player on this team is also ${displayName} — check this isn’t a duplicate.`
      : undefined,
  }
}

// ── Accounts on one family email ─────────────────────────────────────────

/** A player account on an address, with the one child it belongs to. */
interface EmailAccount {
  id: string
  passwordHash: string | null
  rosterPending: boolean
  /**
   * Lower-cased first name of the child this account belongs to: the name the
   * player gave themselves (users.first_name), else the first team that added
   * them, else the nickname the stub was created with. Later memberships
   * don't count — they may be exactly a sibling mix-up. '' when unknown.
   */
  ownerFirst: string
  /** "Liam S." (or "Liam"); '' when unknown. */
  label: string
  /** On this team, or on another team of the same organization. */
  visibleToAdder: boolean
  onThisTeam: boolean
}

function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/**
 * Serialises roster writes for one address, so two adds of the same child
 * (a double submit, two coaches at once) can't both create a stub now that
 * users.email is no longer unique. Held until the transaction ends.
 */
async function lockEmail(sql: Sql, email: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext(${'roster-email:' + email}))`
}

async function accountsOnEmail(sql: Sql, email: string, teamId: string): Promise<EmailAccount[]> {
  const rows = (await sql`
    SELECT u.id, u.password_hash, COALESCE(u.roster_pending, false) AS roster_pending,
           NULLIF(TRIM(u.first_name), '') AS first_name,
           NULLIF(TRIM(u.last_initial), '') AS last_initial,
           NULLIF(split_part(TRIM(COALESCE(u.nickname, '')), ' ', 1), '') AS nick_first,
           fm.first_name AS m_first, fm.last_name_initial AS m_initial,
           EXISTS (SELECT 1 FROM team_memberships tm WHERE tm.user_id = u.id AND tm.team_id = ${teamId}) AS on_team,
           EXISTS (
             SELECT 1 FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
             WHERE tm.user_id = u.id
               AND (tm.team_id = ${teamId}
                    OR (t.organization_id IS NOT NULL
                        AND t.organization_id = (SELECT organization_id FROM teams WHERE id = ${teamId})))
           ) AS visible
    FROM users u
    LEFT JOIN LATERAL (
      SELECT NULLIF(TRIM(first_name), '') AS first_name, NULLIF(TRIM(last_name_initial), '') AS last_name_initial
      FROM team_memberships
      WHERE user_id = u.id AND COALESCE(TRIM(first_name), '') <> ''
      ORDER BY joined_at ASC
      LIMIT 1
    ) fm ON TRUE
    WHERE LOWER(u.email) = ${email}
    ORDER BY u.created_at ASC NULLS LAST, u.id ASC
  `) as unknown as Array<{
    id: string
    password_hash: string | null
    roster_pending: boolean
    first_name: string | null
    last_initial: string | null
    nick_first: string | null
    m_first: string | null
    m_initial: string | null
    on_team: boolean
    visible: boolean
  }>
  return rows.map((r) => {
    const first = (r.first_name || r.m_first || r.nick_first || '').trim()
    const initial = (r.first_name ? r.last_initial : r.m_first ? r.m_initial : r.last_initial) || null
    return {
      id: r.id,
      passwordHash: r.password_hash,
      rosterPending: !!r.roster_pending,
      ownerFirst: first.toLowerCase(),
      label: first ? nameLabel(capFirst(first), initial?.trim().toUpperCase() || null) : '',
      visibleToAdder: !!r.visible,
      onThisTeam: !!r.on_team,
    }
  })
}

/** "Liam S.", "Liam S. and Ava S.", "Liam S., Ava S. and Noah S." */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * "(shares Dave Smith’s email with Liam S.)" — as in "Harper gets their own
 * account (shares …)". Siblings are named only when the adder can already see
 * them on a roster of this team or organization: an address alone never
 * reveals who else uses it.
 */
function sharesNote(parentName: string | null, siblings: EmailAccount[]): string {
  const names = siblings.filter(s => s.visibleToAdder && s.label).map(s => s.label)
  const whose = parentName ? `${parentName}’s email` : 'a family email'
  const withWhom = names.length ? ` with ${joinNames(names)}` : parentName ? '' : ' with another player'
  return `(shares ${whose}${withWhom})`
}

/** Most accounts one address may hold (sign-in checks each one's password). */
function emailFullError(email: string): AddPlayerError {
  return new AddPlayerError(
    `${email} is already used by ${MAX_PLAYERS_PER_EMAIL} player accounts, the most one email can hold. Use a different email for this player, or leave it blank.`,
  )
}

async function insertStub(
  sql: Sql,
  v: { email: string; firstName: string; li: string | null; parentName: string | null; phone: string | null },
): Promise<string> {
  const [row] = (await sql`
    INSERT INTO users (email, nickname, first_name, last_initial, parent_name, phone, roster_pending, free_analysis_used)
    VALUES (${v.email}, ${v.firstName}, ${v.firstName}, ${v.li}, ${v.parentName}, ${v.phone}, true, true)
    RETURNING id
  `) as unknown as [{ id: string }]
  return row.id
}

/** A unique-violation: the old users_email_key constraint is still in place. */
function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === '23505'
}

const FAMILY_EMAIL_NOT_READY =
  'This email already belongs to another player’s account, and giving each child their own account on one email isn’t switched on yet. Use a different email for this player, or leave it blank.'

export async function addPlayerToTeam(input: AddPlayerInput): Promise<AddPlayerResult> {
  if (!cleanName(input.firstName)) throw new AddPlayerError('Enter the player’s first name.')

  // Display-name hygiene (security audit item 6): NFC, invisible/bidi
  // characters stripped, markup characters rejected, length capped, then the
  // profanity check. users.nickname (set to the first name) is 50 chars.
  const first = cleanDisplayText(input.firstName, 50)
  if (!first.ok) throw new AddPlayerError(first.error)
  const firstName = first.value
  const last = cleanOptionalDisplayText(input.lastName ?? null, 100)
  if (!last.ok) throw new AddPlayerError(last.error)
  const lastNameRaw = last.value ?? ''
  const parent = cleanOptionalDisplayText(input.parentName ?? null, 150)
  if (!parent.ok) throw new AddPlayerError(parent.error)
  const parentName = parent.value
  const phone = cleanName(input.phone).slice(0, 40) || null
  const email = input.email ? input.email.toLowerCase().trim() : ''

  const li = lastInitial(lastNameRaw)
  const displayName = nameLabel(firstName, li)

  // ── No email: name-only pending invite ───────────────────────────────────
  if (!email) return addNameOnly(input.teamId, firstName, li, !!input.allowDuplicateName)

  if (!isValidEmail(email)) {
    throw new AddPlayerError('That email doesn’t look right. Check it for a typo, or leave it blank to add the player without an email.')
  }

  let teamName = input.teamName ?? null
  let orgName = input.orgName ?? null
  if (!teamName || orgName === undefined || orgName === null) {
    const ctx = await getTeamContext(input.teamId)
    teamName = teamName ?? ctx?.name ?? null
    orgName = orgName ?? ctx?.orgName ?? null
  }

  const sendSetup = async (userId: string): Promise<boolean> => {
    if (!input.sendEmail) return false
    if (!(await setupEmailDailyOk(userId))) return false
    const url = await issuePlayerSetupToken(userId)
    if (!url) return false
    try {
      await sendPlayerSetupEmail(email, teamName, url, parentName, {
        // The same "Maya E." form the resend uses (resendPlayerSetup): only
        // the last initial is stored, so a resend can't repeat a full surname.
        playerName: displayName,
        addedBy: input.addedBy ?? null,
        orgName,
      })
      return true
    } catch (err) {
      console.error('[roster] setup email failed:', err instanceof Error ? err.message : err)
      return false
    }
  }

  // A class team only takes a new player while it has places left.
  const seats = await classSeatsForTeam(input.teamId)

  // ── Email given: which account on it (if any) is this child's? ───────────
  // Decided, and any new stub created, under a per-address lock.
  type Plan =
    | { kind: 'link'; account: EmailAccount }
    | { kind: 'create'; userId: string; siblings: EmailAccount[]; converted: { movedShots: number } | null }
  let plan: Plan
  try {
    plan = (await db.begin(async (tx) => {
      const sql = tx as unknown as Sql
      await lockEmail(sql, email)
      const accounts = await accountsOnEmail(sql, email, input.teamId)
      const want = firstName.toLowerCase()
      const same = accounts.filter(a => a.ownerFirst === want)
      if (same.length > 0) {
        // Normally one. Prefer the one already on this team, else the oldest.
        return { kind: 'link', account: same.find(a => a.onThisTeam) ?? same[0] } as Plan
      }
      // An account nobody has named yet, alone on its address: as before, it
      // is taken to be this child's (e.g. a self-signup that never set a name).
      if (accounts.length === 1 && !accounts[0].ownerFirst) {
        return { kind: 'link', account: accounts[0] } as Plan
      }
      if (accounts.length >= MAX_PLAYERS_PER_EMAIL) throw emailFullError(email)
      // Checked under the package lock, and the enrolment below is made in
      // this same transaction, so parallel adds can't overfill the class.
      if (seats) await lockClassPackage(sql, seats.packageId)
      await assertClassPlace(seats, [{ firstName, li }], sql)

      // A new account for this child. When the team already lists this child
      // name-only at this very family address (the old workaround), that entry
      // becomes the account — shots included — instead of a second copy.
      const userId = await insertStub(sql, { email, firstName, li, parentName, phone })
      let converted: { movedShots: number } | null = null
      const legacy = (await sql`
        SELECT id FROM pending_team_members
        WHERE team_id = ${input.teamId}
          AND LOWER(TRIM(first_name)) = ${want}
          AND UPPER(COALESCE(TRIM(last_name_initial), '')) = ${li ?? ''}
          AND LOWER(TRIM(contact_email)) = ${email}
      `) as unknown as Array<{ id: string }>
      if (legacy.length === 1) {
        const claimed = await claimInTx(sql, userId, { pendingId: legacy[0].id })
        if (claimed.ok) converted = { movedShots: claimed.movedShots }
      }
      if (seats) await enrollInTx(sql, input.teamId, { userId, firstName, li })
      return { kind: 'create', userId, siblings: accounts.filter(a => a.ownerFirst !== want), converted } as Plan
    })) as Plan
  } catch (err) {
    if (err instanceof AddPlayerError) throw err
    if (isUniqueViolation(err)) throw new AddPlayerError(FAMILY_EMAIL_NOT_READY)
    throw err
  }

  if (plan.kind === 'link') {
    // Same player (e.g. the same kid on a second team). Fill in contact
    // details we didn't have, without clobbering anything set.
    const existing = plan.account
    const userId = existing.id
    // Joining a class team: the place is taken (atomically, under the
    // package lock) before the membership, so a full class adds nobody.
    if (seats && !existing.onThisTeam) {
      const out = await ensureClassEnrollment(input.teamId, { userId, firstName, li })
      if (out.outcome === 'full' && !(await heldEnrollment(db, seats.packageId, { firstName, li }))) throw classFullError(out.places)
    }
    await db`
      UPDATE users
      SET parent_name = COALESCE(parent_name, ${parentName}),
          phone = COALESCE(phone, ${phone}),
          nickname = COALESCE(NULLIF(nickname, ''), ${firstName})
      WHERE id = ${userId}
    `
    const attached = await attachMembership(userId, input.teamId, firstName, li)
    await addToEmailList(email)
    // Also fills in a missing enrolment for a player already on the team.
    if (seats) await enrolIfClassTeam(input.teamId, { userId, firstName: attached.firstName, li: attached.li })

    if (!attached.inserted) {
      // Named as the team already has them: a re-add never renames anyone.
      const onTeamAs = nameLabel(attached.firstName, attached.li)
      return { status: 'already_on_team', userId, displayName: onTeamAs, message: `${onTeamAs} is already on this team.` }
    }

    // M5: an account that never finished setup gets the setup email for this
    // team too — it may be the first one that reaches a parent who ignored the
    // last. (This replaces the earlier link; only the newest email works.)
    const pendingSetup = existing.rosterPending && !existing.passwordHash
    const emailed = pendingSetup ? await sendSetup(userId) : false
    const warning = await sameNameTwinWarning(input.teamId, firstName, li, userId)
    return {
      status: 'linked',
      userId,
      emailed,
      displayName,
      warning,
      message: pendingSetup
        ? emailed
          ? `Added. ${displayName} is also on another team but hasn’t finished setting up, so we emailed the setup link again for this team.`
          : `Added. ${displayName} is also on another team and hasn’t finished setting up yet — use Email setup link on the roster to send it.`
        : `Added. ${displayName} already has an account, so this team shows up next time they log in.`,
    }
  }

  // ── Brand-new stub account ───────────────────────────────────────────────
  // Deliberately NOT adopting earlier anonymous submissions under this email
  // here: the adder hasn't proven they own the inbox. The player's own signup
  // (or setup link) does that.
  const { userId, siblings, converted } = plan
  await addToEmailList(email)
  if (converted) {
    // claimInTx already made the membership; the joining gift follows it.
    try { await grantFreeOrgTokensIfEligible(input.teamId) } catch {}
  } else {
    await attachMembership(userId, input.teamId, firstName, li)
  }
  if (seats) await enrolIfClassTeam(input.teamId, { userId, firstName, li })
  const emailed = await sendSetup(userId)
  const warning = converted ? undefined : await sameNameTwinWarning(input.teamId, firstName, li, userId)
  const shared = siblings.length > 0
  const shares = shared ? ` ${sharesNote(parentName, siblings)}` : ''
  const sent = emailed
    ? shared
      ? `We emailed ${email} a link to set up ${firstName}’s account.`
      : `We emailed ${email} a link to finish setting up the account.`
    : `They haven’t been emailed yet — use Email setup link on the roster when you’re ready.`
  const moved = converted && converted.movedShots > 0
    ? ` ${converted.movedShots} shot${converted.movedShots === 1 ? '' : 's'} moved to it.`
    : ''

  return {
    status: 'created',
    userId,
    emailed,
    displayName,
    warning,
    ...(shared
      ? { sharedEmail: true, sharesWith: siblings.filter(s => s.visibleToAdder && s.label).map(s => s.label) }
      : {}),
    ...(converted ? { converted: true, movedShots: converted.movedShots } : {}),
    message: converted
      ? `${displayName} was on this team by name only and now has their own account${shares}. ${sent}${moved}`
      : shared
        ? `Added. ${firstName} gets their own account${shares}. ${sent}`
        : `Added. ${sent}`,
  }
}

// Attach to the team (idempotent). `inserted` is true when the player is new
// to the roster (xmax = 0 on a freshly inserted row). Re-adding someone
// already on the team never renames them: a name the team already has is
// kept, and only a missing one is filled in. Returns the name on the team.
async function attachMembership(
  userId: string,
  teamId: string,
  firstName: string,
  li: string | null,
): Promise<{ inserted: boolean; firstName: string; li: string | null }> {
  const membership = (await db`
    INSERT INTO team_memberships (user_id, team_id, first_name, last_name_initial)
    VALUES (${userId}, ${teamId}, ${firstName}, ${li})
    ON CONFLICT (user_id, team_id) DO UPDATE
      SET first_name = COALESCE(NULLIF(TRIM(team_memberships.first_name), ''), EXCLUDED.first_name),
          last_name_initial = COALESCE(NULLIF(TRIM(team_memberships.last_name_initial), ''), EXCLUDED.last_name_initial)
    RETURNING (xmax = 0) AS inserted, first_name, last_name_initial
  `) as unknown as [{ inserted: boolean; first_name: string | null; last_name_initial: string | null }]
  const newlyOnTeam = membership[0]?.inserted ?? true
  if (newlyOnTeam) {
    try { await grantFreeOrgTokensIfEligible(teamId) } catch {}
  }
  return {
    inserted: newlyOnTeam,
    firstName: cleanName(membership[0]?.first_name) || firstName,
    li: cleanName(membership[0]?.last_name_initial).toUpperCase() || li,
  }
}

// A player just added with an email may be the same child as another entry
// with the same first name and last initial already on the team: one added
// name-only earlier, or another account. We can't be sure — only the last
// initial is stored — so we point it out rather than merge. The add stands.
async function sameNameTwinWarning(
  teamId: string,
  first: string,
  li: string | null,
  userId: string,
): Promise<string | undefined> {
  const matches = (await findSameNameOnTeam(teamId, first, li)).filter(m => !(m.kind === 'member' && m.id === userId))
  if (matches.length === 0) return undefined
  const label = nameLabel(first, li)
  if (matches.some(m => m.kind === 'pending')) {
    return `There’s also a ${label} on this team without an email. If that’s the same player, use Add email on that row with this same email — their shots move to this account and the extra entry goes away.`
  }
  if (matches.some(m => !m.hasEmail)) {
    return `There’s also a ${label} on this team without an email. If that’s the same player, remove the extra entry.`
  }
  return `Another player on this team is also ${label} — check this isn’t a duplicate. Their emails tell them apart.`
}

// ── Ownership of earlier shots (security audit 2026-09-28, items 1 + 7) ──

/**
 * Adopts the anonymous shots this address made before it had an account —
 * the ONLY place an email match is still allowed to move ownership, and only
 * for the one kind of row where the email really was the uploader's:
 *   - never a team upload (team_id / team_player_id set: the email there, if
 *     any, is the coach's, not the player's),
 *   - never a coach's or org admin's self-upload (entitlement_source
 *     coach_credit / org_balance store the COACH's address in email),
 *   - never when the address belongs to a coach or org admin at all: signup
 *     does not verify the inbox, so a stranger signing up with a coach's email
 *     must not collect (and then delete) that coach's shots.
 * The same predicate is used by the one-time backfill in
 * scripts/migrate-email-list-legacy-sub.sql — keep the two in step.
 */
export async function adoptLegacySubmissions(userId: string, email: string): Promise<number> {
  const e = email.toLowerCase().trim()
  if (!e) return 0
  const rows = (await db`
    UPDATE submissions s SET user_id = ${userId}
    WHERE LOWER(s.email) = ${e}
      AND s.user_id IS NULL
      AND s.team_id IS NULL
      AND s.team_player_id IS NULL
      AND COALESCE(s.entitlement_source, '') NOT IN ('coach_credit', 'org_balance')
      AND NOT EXISTS (SELECT 1 FROM teams t WHERE LOWER(t.admin_email) = ${e})
      AND NOT EXISTS (SELECT 1 FROM team_coaches c WHERE LOWER(c.email) = ${e})
      AND NOT EXISTS (SELECT 1 FROM organizations o WHERE LOWER(o.admin_email) = ${e})
    RETURNING s.id
  `) as unknown as Array<{ id: string }>
  return rows.length
}

type ClaimOutcome =
  | { ok: true; teamId: string; movedShots: number }
  | { ok: false; reason: 'not_found' | 'different_player' }

/**
 * The claim itself, inside the caller's transaction: the invite row is locked
 * (so a double submit claims once), then the membership, the shots, and the
 * invite's removal. Shared by claimPendingInvite and giveOwnAccount.
 *
 * Never merges siblings: when the account already belongs to a child by
 * another first name (its own name, or the first team that added it), the
 * invite is left untouched for that other child. This was how siblings got
 * merged — Harper's invite link, "account exists, log in", signing in as
 * Liam, and Liam's account claiming Harper's spot.
 */
async function claimInTx(
  sql: Sql,
  userId: string,
  target: { inviteToken: string } | { pendingId: string },
): Promise<ClaimOutcome> {
  const [pending] = ('inviteToken' in target
    ? await sql`
        SELECT id, team_id, first_name, last_name_initial
        FROM pending_team_members WHERE invite_token = ${target.inviteToken}
        FOR UPDATE
      `
    : await sql`
        SELECT id, team_id, first_name, last_name_initial
        FROM pending_team_members WHERE id = ${target.pendingId}
        FOR UPDATE
      `) as unknown as [{
    id: string
    team_id: string
    first_name: string
    last_name_initial: string | null
  } | undefined]
  if (!pending) return { ok: false, reason: 'not_found' }

  const [who] = (await sql`
    SELECT COALESCE(
      NULLIF(TRIM(u.first_name), ''),
      (SELECT NULLIF(TRIM(tm.first_name), '') FROM team_memberships tm
        WHERE tm.user_id = u.id AND COALESCE(TRIM(tm.first_name), '') <> ''
        ORDER BY tm.joined_at ASC LIMIT 1)
    ) AS known_first
    FROM users u WHERE u.id = ${userId}
  `) as unknown as [{ known_first: string | null } | undefined]
  if (!who) return { ok: false, reason: 'not_found' }
  const known = (who.known_first ?? '').trim().toLowerCase()
  if (known && known !== pending.first_name.trim().toLowerCase()) {
    return { ok: false, reason: 'different_player' }
  }

  await sql`
    INSERT INTO team_memberships (user_id, team_id, first_name, last_name_initial)
    VALUES (${userId}, ${pending.team_id}, ${pending.first_name}, ${pending.last_name_initial})
    ON CONFLICT (user_id, team_id) DO UPDATE
      SET first_name = EXCLUDED.first_name, last_name_initial = EXCLUDED.last_name_initial
  `

  // Mirrors loadPendingShotLinks (lib/team-roster-refs.ts) for one invite.
  const [link] = (await sql`
    SELECT tp.id::text AS team_player_id,
           (tp.created_at >= (p.created_at AT TIME ZONE current_setting('TimeZone'))) AS created_after,
           (SELECT COUNT(*)::int FROM pending_team_members p2
             WHERE p2.team_id = p.team_id AND p2.id <> p.id
               AND LOWER(TRIM(p2.first_name)) = LOWER(TRIM(p.first_name))
               AND UPPER(COALESCE(NULLIF(TRIM(p2.last_name_initial), ''), '?'))
                 = UPPER(COALESCE(NULLIF(TRIM(p.last_name_initial), ''), '?'))) AS same_name_pending
    FROM pending_team_members p
    LEFT JOIN LATERAL (
      SELECT t.id, t.created_at FROM team_players t
      WHERE t.team_id = p.team_id
        AND LOWER(t.first_name) = LOWER(TRIM(p.first_name))
        AND UPPER(t.last_name_initial) = UPPER(COALESCE(NULLIF(TRIM(p.last_name_initial), ''), '?'))
      ORDER BY (t.first_name = TRIM(p.first_name)) DESC, t.created_at ASC
      LIMIT 1
    ) tp ON TRUE
    WHERE p.id = ${pending.id}
  `) as unknown as [{ team_player_id: string | null; created_after: boolean | null; same_name_pending: number } | undefined]

  // On a class team the invite's name-only class enrolment (and its progress)
  // becomes the account's, unless the account already has one there.
  if (link?.same_name_pending === 0) {
    await sql`
      UPDATE org_class_enrollments e SET user_id = ${userId}
      WHERE e.id = (
        SELECT e2.id FROM org_class_enrollments e2
        JOIN teams t ON t.class_package_id = e2.package_id AND t.id = ${pending.team_id}
        WHERE e2.user_id IS NULL
          AND LOWER(TRIM(e2.first_name)) = ${pending.first_name.trim().toLowerCase()}
          AND UPPER(COALESCE(TRIM(e2.last_name_initial), '')) = ${(pending.last_name_initial ?? '').trim().toUpperCase()}
          AND NOT EXISTS (SELECT 1 FROM org_class_enrollments e3 WHERE e3.package_id = e2.package_id AND e3.user_id = ${userId})
        ORDER BY e2.created_at ASC
        LIMIT 1
      )
    `
  }

  let movedShots = 0
  const linked = !!link?.team_player_id && !!link.created_after && link.same_name_pending === 0
  if (linked) {
    const moved = (await sql`
      UPDATE submissions SET user_id = ${userId}, team_player_id = NULL
      WHERE team_id = ${pending.team_id} AND team_player_id = ${link!.team_player_id}
        AND user_id IS NULL
      RETURNING id
    `) as unknown as Array<{ id: string }>
    movedShots = moved.length
    // The name-only row existed only to hold this invite's shots.
    await sql`
      DELETE FROM team_players tp
      WHERE tp.id = ${link!.team_player_id}
        AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.team_player_id = tp.id)
    `
  }

  await sql`DELETE FROM pending_team_members WHERE id = ${pending.id}`
  return { ok: true, teamId: pending.team_id, movedShots }
}

/**
 * Claims a name-only invite (pending_team_members) for an account: the
 * membership, AND the shots a coach already uploaded for that invite.
 *
 * Coach uploads for an invite (playerRef=pending:<id>) are filed on a
 * name-only team_players row (see lib/team-roster-refs.ts). Claiming used to
 * create the membership and delete the invite but leave those shots on the
 * name-only row, so the player saw none of them and the leaderboard listed
 * them twice. The link is computed exactly as loadPendingShotLinks does —
 * same first name + initial, row created at/after the invite, and no other
 * invite on the team sharing the name. When that is ambiguous, nothing moves.
 *
 * An account that already belongs to a child with a different first name
 * never claims the invite (see claimInTx): the invite stays for its own child,
 * who signs up with it or gets their own account from the coach.
 *
 * Returns the team id when an invite was claimed, else null.
 */
export async function claimPendingInvite(
  userId: string,
  inviteToken: string,
): Promise<{ teamId: string; movedShots: number } | null> {
  const out = (await db.begin(async (tx) => claimInTx(tx as unknown as Sql, userId, { inviteToken }))) as ClaimOutcome
  if (!out.ok) {
    if (out.reason === 'different_player') {
      console.warn('[roster] invite not claimed: it is for a different player than this account')
    }
    return null
  }
  try { await grantFreeOrgTokensIfEligible(out.teamId) } catch {}
  return { teamId: out.teamId, movedShots: out.movedShots }
}

// ── Give a name-only sibling their own account ────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type GiveOwnAccountResult =
  | {
      ok: true
      /** 'created': a new account; 'linked': this child already had one on that email. */
      status: 'created' | 'linked'
      userId: string
      displayName: string
      email: string
      movedShots: number
      emailed: boolean
      sharedEmail: boolean
      message: string
    }
  | { ok: false; httpStatus: number; error: string }

/**
 * Turns a name-only player who is emailed at a sibling's family address (the
 * old contact_email workaround) into a real, password-less account on that
 * address: the membership and the invite's shots move exactly as when the
 * invite is claimed (claimInTx), and the setup email naming this child goes
 * to that inbox — never to the coach/org who clicked.
 *
 * When the address already has an account for a child of the same first name
 * (they joined elsewhere), that account is used instead of a second one.
 *
 * The same move backs "Add email" on a name-only row that has no email saved
 * (`input.email`): re-adding the player with an email and removing the
 * name-only entry used to strand that entry's shots on a hidden row.
 *
 * `teamId` is the team the caller is allowed to manage; an invite on any other
 * team is refused with 403.
 */
export async function giveOwnAccount(input: {
  teamId: string
  pendingId: string
  addedBy?: string | null
  sendEmail?: boolean
  /**
   * "Add email" on a name-only row with no family email saved: the address
   * to give them an account on. Ignored when the row already has one.
   */
  email?: string | null
}): Promise<GiveOwnAccountResult> {
  if (!UUID_RE.test(input.pendingId ?? '')) return { ok: false, httpStatus: 400, error: 'Pick a player.' }

  const [p] = (await db`
    SELECT id, team_id, first_name, last_name_initial, NULLIF(LOWER(TRIM(contact_email)), '') AS contact_email
    FROM pending_team_members WHERE id = ${input.pendingId}
  `) as unknown as [{ id: string; team_id: string; first_name: string; last_name_initial: string | null; contact_email: string | null } | undefined]
  if (!p) return { ok: false, httpStatus: 404, error: 'That player is no longer on the roster — reload the page.' }
  if (p.team_id !== input.teamId) return { ok: false, httpStatus: 403, error: 'That player isn’t on your team.' }
  const given = typeof input.email === 'string' ? input.email.toLowerCase().trim() : ''
  // A row with no family email saved takes the one typed into "Add email".
  const fromInput = !p.contact_email
  const email = p.contact_email ?? given
  if (!email) {
    return { ok: false, httpStatus: 400, error: 'Enter their email.' }
  }
  if (!isValidEmail(email)) {
    return { ok: false, httpStatus: 400, error: 'That email doesn’t look right. Check it for a typo.' }
  }

  const limit = await rateLimit(`give-own-account:${input.teamId}`, 30, 3600)
  if (!limit.ok) return { ok: false, httpStatus: 429, error: 'Too many accounts created in the last hour. Try again later.' }

  const firstName = cleanName(p.first_name)
  const li = lastInitial(p.last_name_initial)
  const displayName = nameLabel(firstName, li)

  type Done = { status: 'created' | 'linked'; account: EmailAccount | null; userId: string; movedShots: number; siblings: EmailAccount[]; parentName: string | null }
  let done: Done
  try {
    done = (await db.begin(async (tx) => {
      const sql = tx as unknown as Sql
      // Address lock first (the same order as addPlayerToTeam), then the invite.
      await lockEmail(sql, email)
      const [still] = (await sql`
        SELECT id FROM pending_team_members
        WHERE id = ${p.id} AND team_id = ${input.teamId}
          AND (LOWER(TRIM(contact_email)) = ${email} OR (${fromInput} AND COALESCE(TRIM(contact_email), '') = ''))
        FOR UPDATE
      `) as unknown as [{ id: string } | undefined]
      if (!still) throw new AddPlayerError('This player changed in the meantime — reload the page and try again.')

      const accounts = await accountsOnEmail(sql, email, input.teamId)
      const want = firstName.toLowerCase()
      const same = accounts.filter(a => a.ownerFirst === want)
      const [fam] = (await sql`
        SELECT parent_name FROM users
        WHERE LOWER(email) = ${email} AND COALESCE(TRIM(parent_name), '') <> ''
        ORDER BY created_at ASC NULLS LAST, id ASC LIMIT 1
      `) as unknown as [{ parent_name: string } | undefined]
      const parentName = fam?.parent_name?.trim() || null

      let status: 'created' | 'linked'
      let account: EmailAccount | null = null
      let userId: string
      if (same.length > 0) {
        account = same.find(a => a.onThisTeam) ?? same[0]
        userId = account.id
        status = 'linked'
      } else {
        if (accounts.length >= MAX_PLAYERS_PER_EMAIL) throw emailFullError(email)
        // The family's parent name (already on their other accounts at this
        // same inbox) greets them in the setup email.
        userId = await insertStub(sql, { email, firstName, li, parentName, phone: null })
        status = 'created'
      }
      const claimed = await claimInTx(sql, userId, { pendingId: p.id })
      if (!claimed.ok) throw new AddPlayerError('This player changed in the meantime — reload the page and try again.')
      return {
        status,
        account,
        userId,
        movedShots: claimed.movedShots,
        siblings: accounts.filter(a => a.ownerFirst !== want),
        parentName,
      } as Done
    })) as Done
  } catch (err) {
    if (err instanceof AddPlayerError) return { ok: false, httpStatus: 409, error: err.message }
    if (isUniqueViolation(err)) return { ok: false, httpStatus: 409, error: FAMILY_EMAIL_NOT_READY }
    throw err
  }

  await addToEmailList(email)
  try { await grantFreeOrgTokensIfEligible(input.teamId) } catch {}

  const needsSetup = done.status === 'created' || (!!done.account?.rosterPending && !done.account.passwordHash)
  let emailed = false
  if (needsSetup && input.sendEmail !== false && (await setupEmailDailyOk(done.userId))) {
    const url = await issuePlayerSetupToken(done.userId)
    if (url) {
      const ctx = await getTeamContext(input.teamId)
      try {
        await sendPlayerSetupEmail(email, ctx?.name ?? null, url, done.parentName, {
          playerName: displayName,
          addedBy: input.addedBy ?? ctx?.orgName ?? null,
          orgName: ctx?.orgName ?? null,
        })
        emailed = true
      } catch (err) {
        console.error('[roster] give-own-account setup email failed:', err instanceof Error ? err.message : err)
      }
    }
  }

  const moved = done.movedShots > 0
    ? ` ${done.movedShots} shot${done.movedShots === 1 ? '' : 's'} moved to it.`
    : ''
  const sent = !needsSetup
    ? ''
    : emailed
      ? ` We emailed ${email} a link to set up ${firstName}’s account.`
      : ' Use Email setup link on the roster to send it.'
  const shared = done.siblings.length > 0
  const message = done.status === 'created'
    ? `${displayName} now has their own account${shared ? ` ${sharesNote(null, done.siblings)}` : ''}.${sent}${moved}`
    : `${displayName} already had an account on ${email}, so this entry now uses it.${sent}${moved}`

  return {
    ok: true,
    status: done.status,
    userId: done.userId,
    displayName,
    email,
    movedShots: done.movedShots,
    emailed,
    sharedEmail: shared,
    message,
  }
}

// ── Removing a name-only entry ────────────────────────────────────────────

/**
 * Removes a name-only player (pending_team_members) from `teamId` — a team the
 * caller has already been allowed to manage. Their shots on this team (filed
 * on the name-only team_players row made for them, the same link claimInTx
 * moves) go with them: they used to stay behind on that row, which the roster
 * no longer listed but the upload picker and leaderboard still did. The shots
 * are only taken off the team; nothing is deleted.
 */
export async function removeNameOnlyEntry(
  teamId: string,
  pendingId: string,
): Promise<{ removed: boolean; removedShots: number }> {
  if (!UUID_RE.test(pendingId ?? '') || !UUID_RE.test(teamId ?? '')) return { removed: false, removedShots: 0 }
  return (await db.begin(async (tx) => {
    const sql = tx as unknown as Sql
    const [p] = (await sql`
      SELECT id FROM pending_team_members WHERE id = ${pendingId} AND team_id = ${teamId} FOR UPDATE
    `) as unknown as [{ id: string } | undefined]
    if (!p) return { removed: false, removedShots: 0 }
    // Mirrors loadPendingShotLinks (lib/team-roster-refs.ts) for one invite.
    const [link] = (await sql`
      SELECT tp.id::text AS team_player_id,
             (tp.created_at >= (p.created_at AT TIME ZONE current_setting('TimeZone'))) AS created_after,
             (SELECT COUNT(*)::int FROM pending_team_members p2
               WHERE p2.team_id = p.team_id AND p2.id <> p.id
                 AND LOWER(TRIM(p2.first_name)) = LOWER(TRIM(p.first_name))
                 AND UPPER(COALESCE(NULLIF(TRIM(p2.last_name_initial), ''), '?'))
                   = UPPER(COALESCE(NULLIF(TRIM(p.last_name_initial), ''), '?'))) AS same_name_pending
      FROM pending_team_members p
      LEFT JOIN LATERAL (
        SELECT t.id, t.created_at FROM team_players t
        WHERE t.team_id = p.team_id
          AND LOWER(t.first_name) = LOWER(TRIM(p.first_name))
          AND UPPER(t.last_name_initial) = UPPER(COALESCE(NULLIF(TRIM(p.last_name_initial), ''), '?'))
        ORDER BY (t.first_name = TRIM(p.first_name)) DESC, t.created_at ASC
        LIMIT 1
      ) tp ON TRUE
      WHERE p.id = ${pendingId}
    `) as unknown as [{ team_player_id: string | null; created_after: boolean | null; same_name_pending: number } | undefined]
    let removedShots = 0
    if (link?.team_player_id && link.created_after && link.same_name_pending === 0) {
      const off = (await sql`
        UPDATE submissions SET team_id = NULL, team_player_id = NULL
        WHERE team_id = ${teamId} AND team_player_id = ${link.team_player_id} AND user_id IS NULL
        RETURNING id
      `) as unknown as Array<{ id: string }>
      removedShots = off.length
      await sql`
        DELETE FROM team_players tp
        WHERE tp.id = ${link.team_player_id}
          AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.team_player_id = tp.id)
      `
    }
    await sql`DELETE FROM pending_team_members WHERE id = ${pendingId}`
    return { removed: true, removedShots }
  })) as { removed: boolean; removedShots: number }
}

// ── Roster exits (security audit 2026-09-28, item 4) ──────────────────────

/**
 * The roster stubs (added by a coach/org by email, setup never finished) on a
 * team. Collect them BEFORE the team is deleted, then pass the result to
 * retireOrphanStubs once the memberships are gone.
 */
export async function rosterStubIds(teamId: string): Promise<string[]> {
  const rows = (await db`
    SELECT u.id FROM users u
    JOIN team_memberships tm ON tm.user_id = u.id AND tm.team_id = ${teamId}
    WHERE u.roster_pending = true AND u.password_hash IS NULL
  `) as unknown as Array<{ id: string }>
  return rows.map(r => r.id)
}

/**
 * A stub left on no team must not keep a live setup link: a deleted team (or a
 * removed player) would otherwise still let whoever holds the emailed link
 * take an account nobody manages, with the parent's name and phone on it.
 *
 * For each stub that is still roster_pending, password-less and on no team:
 *   - nothing hangs off it (no shots, purchases, provider sign-in, released
 *     results, unlocks, enrolments, tokens beyond the free joining gift)
 *     → the row is deleted;
 *   - otherwise → it is kept, but the setup token is revoked.
 * submissions.user_id has no FK, so the "no shots" check is what keeps a
 * delete from orphaning history.
 */
export async function retireOrphanStubs(userIds: string[]): Promise<{ deleted: number; revoked: number }> {
  if (userIds.length === 0) return { deleted: 0, revoked: 0 }
  const orphans = (await db`
    SELECT u.id FROM users u
    WHERE u.id = ANY(${userIds})
      AND u.roster_pending = true AND u.password_hash IS NULL
      AND NOT EXISTS (SELECT 1 FROM team_memberships tm WHERE tm.user_id = u.id)
  `) as unknown as Array<{ id: string }>
  if (orphans.length === 0) return { deleted: 0, revoked: 0 }
  const ids = orphans.map(o => o.id)

  let deleted = 0
  try {
    const gone = (await db`
      DELETE FROM users u
      WHERE u.id = ANY(${ids})
        -- re-checked here: a coach may have re-added them in the meantime
        AND u.roster_pending = true AND u.password_hash IS NULL
        AND NOT EXISTS (SELECT 1 FROM team_memberships tm WHERE tm.user_id = u.id)
        -- Tokens: only the automatic one-per-team joining gift (minted, not
        -- paid for) may be thrown away. Anything an org/coach assigned on
        -- top of that keeps the account.
        AND COALESCE(u.analysis_tokens, 0) <= (SELECT COUNT(*) FROM team_free_token_grants g WHERE g.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM iap_events i WHERE i.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM user_oauth_identities oi WHERE oi.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM result_releases rr WHERE rr.recipient_user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM org_player_unlocks pu WHERE pu.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM org_class_enrollments ce WHERE ce.user_id = u.id)
      RETURNING u.id
    `) as unknown as Array<{ id: string }>
    deleted = gone.length
    if (deleted > 0) {
      // No FK on the gift ledger; drop the deleted accounts' rows with them.
      const goneIds = gone.map(g => g.id)
      await db`DELETE FROM team_free_token_grants WHERE user_id = ANY(${goneIds})`
    }
  } catch (err) {
    // A table missing on an older schema: fall through and only revoke.
    console.warn('[roster] stub delete skipped:', err instanceof Error ? err.message : err)
  }

  const revoked = (await db`
    UPDATE users SET reset_token = NULL, reset_token_expires = NULL
    WHERE id = ANY(${ids}) AND roster_pending = true AND password_hash IS NULL
      AND reset_token IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM team_memberships tm WHERE tm.user_id = users.id)
    RETURNING id
  `) as unknown as Array<{ id: string }>
  return { deleted, revoked: revoked.length }
}

// ── Bulk import (CSV) ─────────────────────────────────────────────────────

export const MAX_IMPORT_ROWS = 200

export interface ImportRowInput {
  /** Row number in the original file, echoed back so results line up with it. */
  rowNumber?: number
  firstName?: string
  lastName?: string
  email?: string
  parentName?: string
  phone?: string
  /** The person confirmed this same-named player is someone different. */
  allowDuplicateName?: boolean
}

export interface ImportRowResult {
  /** Position in the submitted list. */
  index: number
  /** Row number in the original file (falls back to index + 2, header = row 1). */
  rowNumber: number
  name: string
  status: AddPlayerStatus | 'error'
  detail?: string
  warning?: string
  inviteUrl?: string
  nameMatch?: boolean
  /** Created as its own account on an email a sibling's account also uses. */
  sharedEmail?: boolean
  /** A name-only entry for this child on the team became this account. */
  converted?: boolean
}

export interface ImportSummary {
  added: number
  skipped: number
  failed: number
  total: number
}

/**
 * Adds many players to one team through the same path as a single add, so
 * dedupe-by-email, sibling handling and setup emails behave identically.
 * Sequential on purpose: one email per new stub, and a roster is tens of rows.
 */
export async function importPlayersToTeam(
  team: TeamContext,
  rows: ImportRowInput[],
  opts: { sendEmail: boolean; addedBy?: string | null },
): Promise<{ results: ImportRowResult[]; summary: ImportSummary }> {
  const results: ImportRowResult[] = []
  // Players seen earlier in this same file, by first name + last initial.
  const seen = new Map<string, Array<{ last: string; email: string; rowNumber: number }>>()
  // Whether the team already had someone by that name BEFORE this import
  // (looked up the first time the name comes up). A same-initial twin earlier
  // in the file must not wave a name-only row past a player who was already
  // on the team: re-importing a sheet used to re-add every name-only player.
  const onTeamBefore = new Map<string, boolean>()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? {}
    const rowNumber = Number.isInteger(row.rowNumber) && (row.rowNumber as number) > 0 ? (row.rowNumber as number) : i + 2
    const first = cleanName(row.firstName)
    const last = cleanName(row.lastName)
    const email = (row.email ?? '').trim().toLowerCase()
    const label = `${first} ${last}`.trim() || email || `Row ${rowNumber}`

    const problem = importRowProblem({ firstName: first, email })
    if (problem) {
      results.push({ index: i, rowNumber, name: label, status: 'error', detail: problem })
      continue
    }

    const key = `${first.toLowerCase()}|${lastInitial(last) ?? ''}`
    if (!onTeamBefore.has(key)) {
      onTeamBefore.set(key, (await findSameNameOnTeam(team.id, first, lastInitial(last))).length > 0)
    }
    const earlier = seen.get(key) ?? []
    const twin = earlier.find(e => e.last.toLowerCase() === last.toLowerCase() && e.email === email)
    if (twin) {
      results.push({
        index: i, rowNumber, name: label, status: 'already_on_team',
        detail: `Same player as row ${twin.rowNumber} in this file.`,
      })
      continue
    }
    // A different full last name (or a different email) with the same initial
    // is a different child — e.g. Liam Smith and Liam Stone.
    const differentSameInitial = earlier.length > 0
    // Only worth a warning when an email can't tell the two apart.
    const ambiguous = differentSameInitial && (!email || earlier.some(e => !e.email))

    try {
      const r = await addPlayerToTeam({
        teamId: team.id,
        firstName: first,
        lastName: last || null,
        email: email || null,
        parentName: row.parentName ?? null,
        phone: row.phone ?? null,
        sendEmail: opts.sendEmail,
        teamName: team.name,
        orgName: team.orgName,
        addedBy: opts.addedBy ?? null,
        allowDuplicateName: !!row.allowDuplicateName || (differentSameInitial && !onTeamBefore.get(key)),
      })
      const warning = r.warning ?? (ambiguous && r.status !== 'already_on_team'
        ? `Another player in this file is also ${r.displayName} — check this isn’t a duplicate.`
        : undefined)
      results.push({
        index: i,
        rowNumber,
        name: label,
        status: r.status,
        detail: r.message,
        warning,
        inviteUrl: r.status === 'invited' || r.nameMatch ? r.inviteUrl : undefined,
        nameMatch: r.nameMatch,
        ...(r.sharedEmail ? { sharedEmail: true } : {}),
        ...(r.converted ? { converted: true } : {}),
      })
      earlier.push({ last, email, rowNumber })
      seen.set(key, earlier)
    } catch (err) {
      results.push({
        index: i,
        rowNumber,
        name: label,
        status: 'error',
        detail: err instanceof AddPlayerError ? err.message : 'Could not add this player. Try again.',
      })
      if (!(err instanceof AddPlayerError)) console.error('import-players row error:', err)
    }
  }

  const added = results.filter(r => r.status === 'created' || r.status === 'linked' || r.status === 'invited').length
  const skipped = results.filter(r => r.status === 'already_on_team').length
  const failed = results.filter(r => r.status === 'error').length
  return { results, summary: { added, skipped, failed, total: results.length } }
}

/**
 * For the import preview: the rows without an email whose first name + last
 * initial is already on the team. The import skips exactly these (as
 * "already on team") unless the row says allowDuplicateName, so the preview
 * can say so before anything is added. Read-only.
 */
export async function importNameMatches(teamId: string, rows: ImportRowInput[]): Promise<number[]> {
  const out: number[] = []
  const cache = new Map<string, boolean>()
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? {}
    const first = cleanName(row.firstName)
    const last = cleanName(row.lastName)
    if ((row.email ?? '').trim() || importRowProblem({ firstName: first, email: '' })) continue
    const li = lastInitial(last)
    const key = `${first.toLowerCase()}|${li ?? ''}`
    if (!cache.has(key)) cache.set(key, (await findSameNameOnTeam(teamId, first, li)).length > 0)
    if (cache.get(key)) out.push(i)
  }
  return out
}

// ── Coaches ───────────────────────────────────────────────────────────────

export class AddCoachError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export interface AddCoachResult {
  /**
   * Present only for a brand-new address, who still needs to set a password.
   * An address already used by a coach/org elsewhere is invited by email only.
   */
  inviteToken?: string
  /** true when the email already had a coach password, reused for this team. */
  existingAccount: boolean
  emailed: boolean
}

/**
 * Adds an (assistant) coach to a team. A coach may coach several teams: only
 * a duplicate on the SAME team, or the team's own head coach, is rejected.
 * When the email already has a coach password on another team of the SAME
 * organization, that hash is copied onto the new row — one password works on
 * every team there — and they get a "you've been added" notice instead of a
 * new invite. Any other address gets the normal invite.
 */
export async function addCoachToTeam(input: {
  team: { id: string; name: string; adminEmail: string; orgName?: string | null }
  email: string
  nickname?: string | null
  sendEmail?: boolean
  addedBy?: string | null
}): Promise<AddCoachResult> {
  const email = (input.email ?? '').toLowerCase().trim()
  if (!email) throw new AddCoachError('Enter the coach’s email.')
  if (!isValidEmail(email)) {
    throw new AddCoachError('That email doesn’t look right. Check it for a typo (it should look like name@example.com).')
  }
  const nick = cleanOptionalDisplayText(input.nickname ?? null, 100)
  if (!nick.ok) throw new AddCoachError(nick.error)
  const nickname = nick.value

  if (input.team.adminEmail.toLowerCase().trim() === email) {
    throw new AddCoachError('That’s already this team’s head coach.', 409)
  }
  const [dup] = (await db`
    SELECT id FROM team_coaches WHERE team_id = ${input.team.id} AND LOWER(email) = ${email}
  `) as unknown as [{ id: string } | undefined]
  if (dup) throw new AddCoachError('That coach is already on this team.', 409)

  // Does this email already coach on another team of the SAME organization
  // (with a password set)? Only that credential may be copied — never one
  // from another org's team or from a team a stranger self-registered under
  // this address (see sameOrgCoachCredential). Everyone else is invited and
  // proves the inbox by opening the emailed link.
  const [teamOrg] = (await db`
    SELECT organization_id FROM teams WHERE id = ${input.team.id}
  `) as unknown as [{ organization_id: string | null } | undefined]
  const known = await sameOrgCoachCredential(email, teamOrg?.organization_id ?? null)

  await addToEmailList(email)

  if (known) {
    await db`
      INSERT INTO team_coaches (team_id, email, password_hash, nickname)
      VALUES (${input.team.id}, ${email}, ${known.hash}, ${nickname ?? known.nickname ?? null})
    `
    let emailed = false
    try {
      await sendCoachAddedToTeamEmail(email, input.team.name, {
        orgName: input.team.orgName ?? null,
        addedBy: input.addedBy ?? null,
        role: 'assistant',
      })
      emailed = true
    } catch (err) {
      console.error('[roster] coach notice failed:', err instanceof Error ? err.message : err)
    }
    return { existingAccount: true, emailed }
  }

  // An address that already belongs to a coach or an org elsewhere is only
  // ever invited by email: the inviter is not shown the link. Otherwise the
  // inviter could open it themselves and plant a second password under a
  // real coach's address (which freezes that coach's email-keyed tokens and
  // uploads — see provenCoachCreditsEmail).
  const emailOnly = await emailBelongsToCoachOrOrg(email)
  const inviteToken = crypto.randomBytes(32).toString('hex')
  const [invited] = (await db`
    INSERT INTO team_coaches (team_id, email, invite_token, nickname)
    VALUES (${input.team.id}, ${email}, ${inviteToken}, ${nickname})
    RETURNING id
  `) as unknown as [{ id: string }]
  // The link goes only to the inbox here, so accepting it proves the address
  // (lib/team-auth.ts recordInviteInboxProof).
  if (emailOnly && invited?.id) await markCoachInviteEmailedOnly(invited.id)
  let emailed = false
  if (input.sendEmail || emailOnly) {
    try {
      await sendCoachSignupEmail(email, input.team.name, inviteToken)
      emailed = true
    } catch (err) {
      console.error('Coach invite email failed:', err instanceof Error ? err.message : err)
    }
  }
  return emailOnly ? { existingAccount: false, emailed } : { inviteToken, existingAccount: false, emailed }
}
