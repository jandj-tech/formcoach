import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { jwtSecret } from '@/lib/env'
import { db } from '@/lib/db'
import {
  fingerprintMatches,
  sessionCredentialFingerprint,
  verifyOrgSession,
  type OrgSessionPayload,
} from '@/lib/org-auth'
import { ORG_COOKIE } from '@/lib/sessions'

const COOKIE = 'fc_team_session'
const TTL = 60 * 60 * 24 * 30 // 30 days

export interface TeamSessionPayload {
  teamId: string
  adminEmail: string
  // See lib/auth.ts — stamped so a team token is trusted over Bearer (the
  // mobile app) without a cookie name to identify it. Legacy tokens/cookies
  // lack it and are still honored on the cookie path.
  kind?: 'team'
  /**
   * Credential fingerprint (lib/org-auth.ts sessionCredentialFingerprint) of
   * the row this session was issued under: the head-coach row, the added-coach
   * row, or — for an org "open team" session — the organization's own
   * password. Re-derived from the CURRENT row on every request (stillCoaches),
   * so a password reset or change ends every session issued before it.
   */
  cv?: string
}

// One fingerprint per (team, email, row credential).
function teamFingerprint(teamId: string, email: string, passwordHash: string | null): string {
  return sessionCredentialFingerprint('team', teamId, email, passwordHash)
}

/**
 * `credential` is the password_hash of the row the caller just proved (the
 * row whose password matched, the invite/reset row it just wrote, the row an
 * OAuth email matched) — or, for an org "open team" session, the org's own
 * password_hash (null for a password-less OAuth org). Required, so no minting
 * site can forget to bind the session.
 */
export async function signTeamSession(
  payload: { teamId: string; adminEmail: string },
  credential: string | null,
): Promise<string> {
  const cv = teamFingerprint(payload.teamId, payload.adminEmail, credential)
  return new SignJWT({ teamId: payload.teamId, adminEmail: payload.adminEmail, kind: 'team', cv } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .sign(jwtSecret())
}

export async function verifyTeamSession(token: string): Promise<TeamSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), { algorithms: ['HS256'] })
    const claims = payload as unknown as TeamSessionPayload & { kind?: string }
    // Every token this app signs shares one HMAC key, so verifying the
    // signature only proves we minted it — not that we minted it for THIS
    // purpose. A team-choice token (below) carries `teamIds`, not `teamId`;
    // without this guard it would verify here and yield a session whose
    // teamId is undefined, which every downstream query would silently treat
    // as "no rows" rather than as the forgery it is.
    if (typeof claims.teamId !== 'string' || !claims.teamId) return null
    if (claims.kind !== undefined && claims.kind !== 'team') return null
    // Tokens minted before credential binding carry no `cv`: rejected, the
    // coach signs in again (the app treats that as signed out → login).
    if (typeof claims.cv !== 'string' || !claims.cv) return null
    return claims
  } catch {
    return null
  }
}

/**
 * Short-lived proof that a password check just succeeded for a coach who owns
 * more than one team, naming exactly the teams they may choose between.
 *
 * Login cannot issue a team session yet — it does not know which team the coach
 * wants — but the choice endpoint still has to know the password was checked.
 * Before this existed, /api/team/select minted a full session from a teamId and
 * an email alone, so anyone holding those two values had permanent passwordless
 * access to that team's roster, chat and credits.
 */
export interface TeamChoicePayload {
  teamIds: string[]
  adminEmail: string
  kind: 'team-choice'
  /** teamId → fingerprint of the row whose password matched at login. */
  cvs: Record<string, string>
}

const CHOICE_TTL = 60 * 10 // 10 minutes — long enough to pick from a list

export async function signTeamChoice(
  adminEmail: string,
  teams: Array<{ teamId: string; email: string; passwordHash: string }>,
): Promise<string> {
  const teamIds = teams.map((t) => t.teamId)
  const cvs: Record<string, string> = {}
  for (const t of teams) cvs[t.teamId] = teamFingerprint(t.teamId, t.email, t.passwordHash)
  return new SignJWT({ teamIds, adminEmail, kind: 'team-choice', cvs } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${CHOICE_TTL}s`)
    .sign(jwtSecret())
}

export async function verifyTeamChoice(token: string): Promise<TeamChoicePayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), { algorithms: ['HS256'] })
    const claims = payload as unknown as TeamChoicePayload
    if (claims.kind !== 'team-choice') return null
    if (!Array.isArray(claims.teamIds) || claims.teamIds.length === 0) return null
    if (typeof claims.adminEmail !== 'string' || !claims.adminEmail) return null
    if (!claims.cvs || typeof claims.cvs !== 'object') return null
    return claims
  } catch {
    return null
  }
}

/**
 * Path A of /api/team/select: the chosen team's credentialed row whose
 * CURRENT password hash is still the one that matched at login (the choice
 * token's fingerprint), so a reset in the ten minutes since voids the choice.
 * Returns the row's stored email + hash to sign with, or null.
 */
export async function choiceRowForTeam(
  choice: TeamChoicePayload,
  teamId: string,
): Promise<{ email: string; credential: string } | null> {
  if (!choice.teamIds.includes(teamId)) return null
  const want = choice.cvs[teamId]
  if (typeof want !== 'string') return null
  const e = choice.adminEmail.toLowerCase().trim()
  for (const r of await ownCredentialsOnTeam(e, teamId)) {
    if (fingerprintMatches(want, teamFingerprint(teamId, r.email, r.hash))) return { email: r.email, credential: r.hash }
  }
  return null
}

/**
 * Which current credential of (session.teamId, session.adminEmail) the
 * session's `cv` was issued under: one of the email's own credentialed rows
 * on the team (`row`), or the owning organization's password when the email
 * is that org's admin (`org`). A row match wins. Null when nothing current
 * matches — the password changed since, the row is gone, or the token is
 * forged/legacy.
 */
async function sessionCredential(
  session: TeamSessionPayload,
): Promise<{ email: string; hash: string | null; source: 'row' | 'org' } | null> {
  if (typeof session.cv !== 'string' || !session.cv) return null
  const e = session.adminEmail.toLowerCase().trim()
  let rows: Array<{ email: string; hash: string | null; source: 'row' | 'org' }>
  try {
    rows = (await db`
      SELECT admin_email AS email, password_hash AS hash, 'row' AS source FROM teams
      WHERE id = ${session.teamId} AND LOWER(admin_email) = ${e} AND password_hash IS NOT NULL
      UNION ALL
      SELECT email, password_hash AS hash, 'row' AS source FROM team_coaches
      WHERE team_id = ${session.teamId} AND LOWER(email) = ${e} AND password_hash IS NOT NULL
      UNION ALL
      SELECT o.admin_email AS email, o.password_hash AS hash, 'org' AS source FROM organizations o
      JOIN teams t ON t.organization_id = o.id
      WHERE t.id = ${session.teamId} AND LOWER(o.admin_email) = ${e}
    `) as unknown as typeof rows
  } catch {
    return null
  }
  const hits = rows.filter((r) => fingerprintMatches(session.cv, teamFingerprint(session.teamId, r.email, r.hash)))
  return hits.find((r) => r.source === 'row') ?? hits[0] ?? null
}

/**
 * The one rule for "may this email act as a coach of this team right now":
 * the team's head coach (teams.admin_email), an added coach with a
 * team_coaches row on that team, or the admin of the organization that owns
 * the team (the org dashboard's "open team" sessions sign with that email).
 * Coach rows only count once their invite was accepted (a password is set) —
 * an invite still sitting in someone's inbox grants nothing, and a coach who
 * was removed and re-invited does not get their old sessions back early.
 *
 * Returns the address as stored in the database so callers can sign from the
 * DB value rather than from anything the client sent. One query, every lookup
 * keyed by a primary key or the team id.
 */
export async function coachEmailForTeam(email: string, teamId: string): Promise<string | null> {
  const e = email.toLowerCase().trim()
  if (!e || !teamId) return null
  try {
    const [row] = (await db`
      SELECT COALESCE(
        CASE WHEN LOWER(t.admin_email) = ${e} AND t.password_hash IS NOT NULL THEN t.admin_email END,
        (SELECT tc.email FROM team_coaches tc
          WHERE tc.team_id = t.id AND LOWER(tc.email) = ${e} AND tc.password_hash IS NOT NULL
          LIMIT 1),
        (SELECT o.admin_email FROM organizations o
          WHERE o.id = t.organization_id AND LOWER(o.admin_email) = ${e})
      ) AS email
      FROM teams t
      WHERE t.id = ${teamId}
    `) as unknown as [{ email: string | null } | undefined]
    return row?.email ?? null
  } catch {
    // A malformed team id (not a uuid) or a database hiccup: fail closed.
    return null
  }
}

/**
 * True when this address already belongs to a coach or an organization: an
 * org admin, a head coach (any teams row, invite pending or not), or an added
 * coach (any team_coaches row, invite pending or not).
 *
 * Self-serve signup (/api/team/register, org signup) never proves the inbox,
 * so it must not be able to create a SECOND identity under an address that
 * already has one. It used to: registering a team as the Ridgeview director
 * (or an assistant) gave a stranger a team session carrying that person's
 * email, which the team switcher then honoured on the org's real teams and
 * which listed that person's own uploads. Fails closed on a database error.
 */
export async function emailBelongsToCoachOrOrg(email: string): Promise<boolean> {
  const e = email.toLowerCase().trim()
  if (!e) return false
  const [row] = (await db`
    SELECT (
      EXISTS (SELECT 1 FROM organizations WHERE LOWER(admin_email) = ${e})
      OR EXISTS (SELECT 1 FROM teams WHERE LOWER(admin_email) = ${e})
      OR EXISTS (SELECT 1 FROM team_coaches WHERE LOWER(email) = ${e})
    ) AS taken
  `) as unknown as [{ taken: boolean }]
  return row?.taken !== false
}

/**
 * The password hashes this email holds on its OWN rows for one team — the
 * head-coach row and/or an added-coach row. Org-admin access to a team is
 * not a row credential and is not included. Empty for a malformed team id.
 */
async function ownCredentialsOnTeam(e: string, teamId: string): Promise<Array<{ email: string; hash: string }>> {
  try {
    return (await db`
      SELECT admin_email AS email, password_hash AS hash FROM teams
      WHERE id = ${teamId} AND LOWER(admin_email) = ${e} AND password_hash IS NOT NULL
      UNION ALL
      SELECT email, password_hash AS hash FROM team_coaches
      WHERE team_id = ${teamId} AND LOWER(email) = ${e} AND password_hash IS NOT NULL
    `) as unknown as Array<{ email: string; hash: string }>
  } catch {
    return []
  }
}

/**
 * True when `orgSession` is a real, current login for the organization that
 * owns `teamId`, by the same email the team session carries.
 */
async function orgSessionOwnsTeam(
  e: string,
  teamId: string,
  orgSession: OrgSessionPayload | null,
): Promise<{ email: string; hash: string | null } | null> {
  if (!orgSession || typeof orgSession.orgId !== 'string' || !orgSession.orgId) return null
  if (typeof orgSession.adminEmail !== 'string' || orgSession.adminEmail.toLowerCase().trim() !== e) return null
  try {
    const [row] = (await db`
      SELECT o.admin_email, o.password_hash FROM organizations o
      JOIN teams t ON t.organization_id = o.id
      WHERE t.id = ${teamId} AND o.id = ${orgSession.orgId} AND LOWER(o.admin_email) = ${e}
    `) as unknown as [{ admin_email: string; password_hash: string | null } | undefined]
    return row ? { email: row.admin_email, hash: row.password_hash } : null
  } catch {
    return null
  }
}

/**
 * Path A of /api/team/select (the login page's team chooser): the chosen team
 * must hold a credentialed row of this email. Org-admin access does not count
 * here — the choice token was minted from a password match on a row.
 */
export async function coachRowEmailForTeam(email: string, teamId: string): Promise<string | null> {
  const e = email.toLowerCase().trim()
  if (!e || !teamId) return null
  const own = await ownCredentialsOnTeam(e, teamId)
  return own[0]?.email ?? null
}

/**
 * May a team session for (team X, email E) be re-scoped to team Y?
 *
 * An email alone is not an identity — self-serve team registration never
 * proved the inbox, so legacy data can hold a stranger's team whose "coach"
 * email is somebody else's. "E coaches Y" is therefore not enough; the
 * session has to carry the SAME credential E uses on Y:
 *
 *   - E's credentialed row on Y (head or added coach) has a password hash
 *     equal to one of E's credentialed rows on X. A coach keeps one password
 *     across all their rows (setCoachPasswordEverywhere, the add-coach hash
 *     copy from the same org, inviteAcceptPasswordHash when the coach types
 *     the password they already use), so a legitimate multi-team coach
 *     normally matches; a stranger who registered with E's address and their
 *     own password never does. Rows without a password never match.
 *   - or E is the admin of Y's organization AND the request also carries a
 *     valid org session for that org by E. Org "open team" sessions switch
 *     through org auth only — never through a team session that merely
 *     carries the director's address.
 *
 * Returns the address as stored in the database (sign with that), or null.
 */
export async function teamSwitchEmail(
  session: TeamSessionPayload,
  targetTeamId: string,
  orgSession: OrgSessionPayload | null,
): Promise<string | null> {
  return (await teamSwitchTarget(session, targetTeamId, orgSession))?.email ?? null
}

/**
 * teamSwitchEmail() plus the credential the new session is bound to. The
 * source side is the credential THIS session was issued under (its `cv`), not
 * merely any row the email holds on its team: the target row must carry that
 * same hash. The org path binds to the org's own password.
 */
export async function teamSwitchTarget(
  session: TeamSessionPayload,
  targetTeamId: string,
  orgSession: OrgSessionPayload | null,
): Promise<{ email: string; credential: string | null } | null> {
  const e = session.adminEmail.toLowerCase().trim()
  if (!e || !targetTeamId) return null

  const current = await sessionCredential(session)
  if (!current) return null

  if (targetTeamId === session.teamId) {
    if (current.source === 'row') return { email: current.email, credential: current.hash }
    const org = await orgSessionOwnsTeam(e, targetTeamId, orgSession)
    return org ? { email: org.email, credential: org.hash } : null
  }

  if (current.source === 'row' && current.hash) {
    const target = await ownCredentialsOnTeam(e, targetTeamId)
    const match = target.find((r) => r.hash === current.hash)
    if (match) return { email: match.email, credential: match.hash }
  }

  const org = await orgSessionOwnsTeam(e, targetTeamId, orgSession)
  return org ? { email: org.email, credential: org.hash } : null
}

/**
 * The team switcher's list (dashboard + the app's /api/team/session): every
 * team teamsCoachedBy() finds for the session's email, narrowed to the ones
 * teamSwitchEmail() would actually allow — so a session that cannot switch
 * into a team is not shown that team's name either. The current team is
 * always kept.
 */
export async function switchableTeams(
  session: TeamSessionPayload,
  orgSession: OrgSessionPayload | null,
): Promise<Array<{ id: string; name: string; role: CoachTeamRole }>> {
  const all = await teamsCoachedBy(session.adminEmail)
  const out: Array<{ id: string; name: string; role: CoachTeamRole }> = []
  for (const t of all) {
    if (t.id === session.teamId || (await teamSwitchEmail(session, t.id, orgSession))) out.push(t)
  }
  return out
}

/**
 * The email whose coach/org SELF-uploads (submissions with no user_id and no
 * team_player_id, keyed only by email) a team session may list or delete —
 * or null when the session does not prove it holds that email's credential.
 *
 * Invariant: a team session's email must be PROVEN, not merely present on a
 * team row. Since the register/switch fixes a stranger can no longer obtain a
 * team session carrying someone else's email, but legacy data may still hold
 * a self-registered team whose admin_email copies a real coach's address
 * (with the stranger's own password). stillCoaches() accepts that session for
 * the stranger's own team, so email-keyed personal data needs this extra
 * check:
 *
 *   - the session's own row on its team has a password, and EVERY credential
 *     that email holds anywhere (head rows, added-coach rows, org admin row)
 *     is that same hash. Two different hashes under one email mean at least
 *     one row is not the real owner's and we cannot tell which, so neither
 *     reads the other's uploads (a password reset — setCoachPasswordEverywhere
 *     — re-unifies the rows and restores access for the real owner);
 *   - or the credential this session was issued under (its `cv` row) is
 *     INBOX-PROVEN (credentialInboxProven): it was set by accepting an
 *     emailed-only invite or by an emailed reset. Other, unproven rows under
 *     the same address (a squatter's self-registered team) no longer freeze
 *     the real coach; the squatter's own row is never proven, so the squatter
 *     still fails. Two proven rows with different hashes both pass — the same
 *     inbox owner proved the address twice;
 *   - or the session has no own row (an org "open team" session) and the
 *     request also carries a valid org session for that team's org by the
 *     same email.
 */
export async function provenSelfUploadEmail(
  session: TeamSessionPayload,
  orgSession: OrgSessionPayload | null,
): Promise<string | null> {
  const e = session.adminEmail.toLowerCase().trim()
  if (!e) return null
  const own = await ownCredentialsOnTeam(e, session.teamId)
  if (own.length === 0) {
    return (await orgSessionOwnsTeam(e, session.teamId, orgSession)) ? e : null
  }
  const current = await sessionCredential(session)
  if (current?.source === 'row' && current.hash && (await credentialInboxProven(e, current.hash))) return e
  const only = await onlyCredentialOf(e)
  // Exactly one credential under this email, and it is the session row's.
  return only !== null && own.every((r) => r.hash === only) ? e : null
}

/**
 * True when (email, hash) is an inbox-proven credential: some coach/org row
 * under this address currently holds `hash` AND recorded inbox proof for that
 * same hash (scripts/migrate-coach-email-proof.sql). Keyed by the hash, not
 * the row, so a proven password the org copies onto a new team of the same
 * org (sameOrgCoachCredential) stays proven there; a bcrypt hash carries its
 * own random salt, so a stranger's password never shares it. Proof recorded
 * for an older hash does not count. False on any database error (including
 * the columns not existing yet) — callers then fall back to the legacy
 * one-credential rule.
 */
async function credentialInboxProven(e: string, hash: string): Promise<boolean> {
  if (!e || !hash) return false
  try {
    const [row] = (await db`
      SELECT (
        EXISTS (SELECT 1 FROM teams WHERE LOWER(admin_email) = ${e} AND password_hash = ${hash}
                AND coach_email_proven_at IS NOT NULL AND coach_email_proven_hash = ${hash})
        OR EXISTS (SELECT 1 FROM team_coaches WHERE LOWER(email) = ${e} AND password_hash = ${hash}
                AND email_proven_at IS NOT NULL AND email_proven_hash = ${hash})
        OR EXISTS (SELECT 1 FROM organizations WHERE LOWER(admin_email) = ${e} AND password_hash = ${hash}
                AND admin_email_proven_at IS NOT NULL AND admin_email_proven_hash = ${hash})
      ) AS proven
    `) as unknown as [{ proven: boolean } | undefined]
    return row?.proven === true
  } catch {
    return false
  }
}

/**
 * Records inbox proof when a coach accepts an emailed invite, for the hash
 * just written to the invited row. A head-coach setup link (teams) is only
 * ever emailed. An added-coach signup link (team_coaches) counts only when it
 * was never shown to the inviter (invite_emailed_only): a link shown on the
 * dashboard could have been opened by the inviter themselves. Never throws —
 * a missing column (before migrate) just records nothing.
 */
export async function recordInviteInboxProof(
  self: { teamId: string } | { coachId: string },
  hash: string,
): Promise<void> {
  try {
    if ('teamId' in self) {
      await db`
        UPDATE teams SET coach_email_proven_at = NOW(), coach_email_proven_hash = ${hash}
        WHERE id = ${self.teamId} AND password_hash = ${hash}
      `
    } else {
      await db`
        UPDATE team_coaches SET email_proven_at = NOW(), email_proven_hash = ${hash}
        WHERE id = ${self.coachId} AND password_hash = ${hash} AND invite_emailed_only = true
      `
    }
  } catch (err) {
    console.warn('[team-auth] invite inbox proof not recorded:', err instanceof Error ? err.message : err)
  }
}

/**
 * Records inbox proof after a password reset by emailed link or 6-digit code
 * (lib/password-reset.ts consumeResetToken): every coach row of the address
 * that now holds the new hash (setCoachPasswordEverywhere moved them all), or
 * the organization row. Never throws.
 */
export async function recordResetInboxProof(
  target: { coachEmail: string } | { orgId: string },
  hash: string,
): Promise<void> {
  try {
    if ('orgId' in target) {
      await db`
        UPDATE organizations SET admin_email_proven_at = NOW(), admin_email_proven_hash = ${hash}
        WHERE id = ${target.orgId} AND password_hash = ${hash}
      `
      return
    }
    const e = target.coachEmail.toLowerCase().trim()
    await db`
      UPDATE teams SET coach_email_proven_at = NOW(), coach_email_proven_hash = ${hash}
      WHERE LOWER(admin_email) = ${e} AND password_hash = ${hash}
    `
    await db`
      UPDATE team_coaches SET email_proven_at = NOW(), email_proven_hash = ${hash}
      WHERE LOWER(email) = ${e} AND password_hash = ${hash}
    `
  } catch (err) {
    console.warn('[team-auth] reset inbox proof not recorded:', err instanceof Error ? err.message : err)
  }
}

/**
 * Marks an added-coach invite row whose signup link went ONLY to the invitee's
 * inbox (the inviter was not shown it), so accepting it counts as inbox proof
 * (recordInviteInboxProof). Never throws.
 */
export async function markCoachInviteEmailedOnly(coachId: string): Promise<void> {
  try {
    await db`UPDATE team_coaches SET invite_emailed_only = true WHERE id = ${coachId} AND password_hash IS NULL`
  } catch (err) {
    console.warn('[team-auth] invite_emailed_only not recorded:', err instanceof Error ? err.message : err)
  }
}

/**
 * The single password hash this email holds across every coach/org row, or
 * null when it holds none or more than one (or on a database error). Two
 * different hashes under one address mean at least one row is not the real
 * owner's and we cannot tell which — so nothing keyed only by the email
 * (self-uploads, coach tokens) is released to either.
 */
async function onlyCredentialOf(e: string): Promise<string | null> {
  try {
    const hashes = (await db`
      SELECT DISTINCT password_hash AS hash FROM (
        SELECT password_hash FROM teams WHERE LOWER(admin_email) = ${e} AND password_hash IS NOT NULL
        UNION ALL
        SELECT password_hash FROM team_coaches WHERE LOWER(email) = ${e} AND password_hash IS NOT NULL
        UNION ALL
        SELECT password_hash FROM organizations WHERE LOWER(admin_email) = ${e} AND password_hash IS NOT NULL
      ) x
    `) as unknown as Array<{ hash: string }>
    return hashes.length === 1 ? hashes[0].hash : null
  } catch {
    return null
  }
}

/**
 * The email whose personal coach tokens (coach_credits, keyed only by email)
 * a team session may read or spend — assign to players, return to the org,
 * spend on a coach self-upload, buy into — or null.
 *
 * Same proof as provenSelfUploadEmail, for the same reason: legacy data can
 * hold a stranger's self-registered team whose admin_email copies a real
 * coach's address, and stillCoaches() accepts that stranger's session on the
 * stranger's own team. Without this gate that session spent the real coach's
 * tokens. When the email holds two different credentials, only a session on
 * an inbox-proven credential spends (the real coach who accepted the org's
 * emailed invite, immediately); otherwise neither does until a password reset
 * (setCoachPasswordEverywhere, via the real inbox) re-unifies the rows.
 */
export async function provenCoachCreditsEmail(
  session: TeamSessionPayload,
  orgSession: OrgSessionPayload | null,
): Promise<string | null> {
  return provenSelfUploadEmail(session, orgSession)
}

/**
 * The head-coach email whose coach_credits a team upload on `teamId` may
 * spend (the public /team/<code>/upload page charges the HEAD coach's tokens;
 * signed-in coach and org flows follow the uploader instead — see
 * teamUploadPayer), or null — then only the team's own budget (teams.credits)
 * funds the upload.
 *
 *   - the head-coach row has a password and it is that email's ONLY
 *     credential anywhere (a stranger's self-registered team under a real
 *     coach's address never is — its hash differs from the real coach's),
 *     or that password is an inbox-proven credential (credentialInboxProven
 *     — a squatter's self-registered row never is);
 *   - or the team belongs to an organization and its head-coach address is
 *     that organization's own admin (a self-coached org team, created by
 *     the org with its own address).
 *
 * A head coach whose invite is still pending holds no credential yet, so
 * their tokens are not spendable here until they finish setup.
 */
export async function provenTeamCoachCreditsEmail(teamId: string): Promise<string | null> {
  try {
    const [t] = (await db`
      SELECT t.admin_email, t.password_hash, o.admin_email AS org_admin_email
      FROM teams t LEFT JOIN organizations o ON o.id = t.organization_id
      WHERE t.id = ${teamId}
    `) as unknown as [{ admin_email: string; password_hash: string | null; org_admin_email: string | null } | undefined]
    if (!t?.admin_email) return null
    const e = t.admin_email.toLowerCase().trim()
    if (t.password_hash) {
      if ((await onlyCredentialOf(e)) === t.password_hash) return e
      return (await credentialInboxProven(e, t.password_hash)) ? e : null
    }
    return t.org_admin_email && t.org_admin_email.toLowerCase().trim() === e ? e : null
  } catch {
    return null
  }
}

/**
 * Who pays for a coach-flow team upload (/api/analyze with a playerRef, and
 * the balance the upload pages show), or null when neither session may
 * upload to this team:
 *
 *   - `org`: the organization that owns the team is uploading — its own
 *     login, or a director's "open team" session next to a live org login by
 *     the same email (orgSessionOwnsTeam). Funded by the team's tokens, then
 *     the org's own balance. Never any coach's personal tokens.
 *   - `coach`: a coach (head or added) on their own credentialed row of this
 *     team. Funded by the UPLOADER's personal coach_credits, then the team's
 *     tokens — never another coach's. `email` is the address whose personal
 *     tokens may be spent, under the same proof as every other spend of
 *     coach_credits (provenCoachCreditsEmail); null when this login can't
 *     prove it, so only the team's tokens pay.
 */
export type TeamUploadPayer =
  | { kind: 'org'; orgId: string }
  | { kind: 'coach'; email: string | null }

/** See TeamUploadPayer. */
export async function teamUploadPayer(
  team: { id: string; organization_id: string | null },
  teamSession: TeamSessionPayload | null,
  orgSession: OrgSessionPayload | null,
): Promise<TeamUploadPayer | null> {
  const orgOwnsTeam =
    !!orgSession && !!team.organization_id && orgSession.orgId === team.organization_id
  if (teamSession && teamSession.teamId === team.id) {
    const e = teamSession.adminEmail.toLowerCase().trim()
    // Checked first: a director who is also this team's head coach (same
    // address, same password) still uploads as the organization while their
    // org login is live — the org dashboard is where they came from.
    if (orgOwnsTeam && (await orgSessionOwnsTeam(e, team.id, orgSession))) {
      return { kind: 'org', orgId: orgSession!.orgId }
    }
    const current = await sessionCredential(teamSession)
    if (current?.source === 'row') {
      return { kind: 'coach', email: await provenCoachCreditsEmail(teamSession, orgSession) }
    }
  }
  return orgOwnsTeam ? { kind: 'org', orgId: orgSession!.orgId } : null
}

/**
 * The password hash an org may copy onto a NEW row for `email` so an existing
 * coach is "added" without a fresh invite — or null, meaning send the normal
 * emailed invite.
 *
 * Only a credential the email already holds on another team of the SAME
 * organization qualifies (its head-coach rows or added-coach rows there), and
 * only when all of those agree on one hash. Rows anywhere else — another
 * org's teams, or a team a stranger self-registered under this address before
 * the org added the real coach — are never copied: copying one handed the
 * stranger's password the org's new team (pre-registration hijack). An
 * independent team (no organization) never copies.
 *
 * The agreed hash must also be INBOX-PROVEN (credentialInboxProven). An
 * added-coach link the inviter was shown (team/add-coach for an address that
 * coaches nowhere yet) can be opened by the inviter themselves, so a head
 * coach could plant their own password under a real coach's address on their
 * own team; when the org later created a team for that coach, the planted
 * password was copied onto it with no invite (head-coach slot takeover).
 * Unproven → null → the real coach gets the emailed invite instead.
 */
export async function sameOrgCoachCredential(
  email: string,
  orgId: string | null,
): Promise<{ hash: string; nickname: string | null } | null> {
  const e = email.toLowerCase().trim()
  if (!e || !orgId) return null
  try {
    const rows = (await db`
      SELECT password_hash AS hash, coach_nickname AS nickname, 0 AS pri FROM teams
      WHERE organization_id = ${orgId} AND LOWER(admin_email) = ${e} AND password_hash IS NOT NULL
      UNION ALL
      SELECT tc.password_hash AS hash, tc.nickname, 1 AS pri FROM team_coaches tc
      JOIN teams t ON t.id = tc.team_id
      WHERE t.organization_id = ${orgId} AND LOWER(tc.email) = ${e} AND tc.password_hash IS NOT NULL
      ORDER BY pri ASC
    `) as unknown as Array<{ hash: string; nickname: string | null }>
    if (rows.length === 0) return null
    if (new Set(rows.map((r) => r.hash)).size !== 1) return null
    if (!(await credentialInboxProven(e, rows[0].hash))) return null
    return { hash: rows[0].hash, nickname: rows.find((r) => r.nickname)?.nickname ?? null }
  } catch {
    return null
  }
}

/**
 * The password hash to store when a coach accepts an emailed invite (a
 * head-coach setup link on `teams`, or an added-coach signup link on
 * `team_coaches`). Opening the link proves the inbox, so a NEW password is
 * always accepted — it is set on the invited row only, never on the email's
 * other rows. That keeps a squatter's self-registered team under this address
 * from blocking the real coach (who does not know the squatter's password),
 * and an invite still cannot change the password on any team it wasn't for.
 *
 * When the typed password is one this email already uses elsewhere, that
 * exact hash is reused so the coach's rows stay on one credential (the team
 * switcher and the email-keyed gates above rely on matching hashes).
 */
export async function inviteAcceptPasswordHash(
  email: string,
  password: string,
  cost: number,
  self: { teamId: string } | { coachId: string },
): Promise<string> {
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
  for (const row of existing) {
    if (await bcrypt.compare(password, row.password_hash)) return row.password_hash
  }
  return bcrypt.hash(password, cost)
}

/**
 * A team JWT lasts 30 days and names a team and an email. Signature alone
 * only proves we minted it — not that the coach is still on the team. Before
 * this check a coach removed from a team (or a head coach replaced, or an org
 * that gave the team away) kept full access to the roster, chat, schedule and
 * credits until the token expired. Every team-session read goes through here.
 */
/*
 * Two kinds of team session pass:
 *   - the email has its own credentialed row on the team (head coach or
 *     accepted added coach) — the session was minted from that row's
 *     password, an invite link, a reset link or a proven OAuth email;
 *   - the email is the admin of the team's organization (an org "open team"
 *     session) AND the same request still carries that org's own session.
 *     An org-admin team session on its own proves nothing: before the
 *     register/switch fixes a stranger could mint one from a self-registered
 *     team that merely copied the director's address, so it is honoured only
 *     next to a live org login (the website keeps the org cookie alongside;
 *     the app never uses org-admin team sessions — org logins use org tokens).
 */
/*
 * Both kinds must also still stand on the credential they were issued under
 * (`cv`, see sessionCredential): a password reset or change ends every older
 * session, including a squatter's on the team they registered under a real
 * coach's address.
 */
async function stillCoaches(
  session: TeamSessionPayload | null,
  orgSession: OrgSessionPayload | null,
): Promise<TeamSessionPayload | null> {
  if (!session || typeof session.adminEmail !== 'string' || !session.adminEmail) return null
  const e = session.adminEmail.toLowerCase().trim()
  const current = await sessionCredential(session)
  if (!current) return null
  if (current.source === 'row') return session
  return (await orgSessionOwnsTeam(e, session.teamId, orgSession)) ? session : null
}

async function orgCookieSession(token: string | undefined): Promise<OrgSessionPayload | null> {
  return token ? verifyOrgSession(token) : null
}

export async function getTeamSession(): Promise<TeamSessionPayload | null> {
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  if (!token) return null
  return stillCoaches(await verifyTeamSession(token), await orgCookieSession(store.get(ORG_COOKIE)?.value))
}

export async function getTeamSessionFromRequest(req: NextRequest): Promise<TeamSessionPayload | null> {
  // Mobile app: team session arrives as a Bearer token, and when the header is
  // present it is the request's whole identity — cookies are ignored (see
  // lib/auth.ts for why). Require kind === 'team' so a player/org token can't
  // be accepted here. Legacy team tokens (minted before `kind` existed) are
  // recognised by their `teamId` — a field no player or org token carries — so
  // a coach who logged in on an old build isn't silently logged out.
  const auth = req.headers.get('Authorization')
  if (auth?.startsWith('Bearer ')) {
    const payload = await verifyTeamSession(auth.slice(7))
    if (!payload || typeof payload.teamId !== 'string' || !payload.teamId) return null
    // A Bearer request carries one identity only, so no org session here.
    return payload.kind === 'team' || payload.kind === undefined ? stillCoaches(payload, null) : null
  }

  const token = req.cookies.get(COOKIE)?.value
  if (token) {
    return stillCoaches(
      await verifyTeamSession(token),
      await orgCookieSession(req.cookies.get(ORG_COOKIE)?.value),
    )
  }

  return null
}

export interface CoachLoginTeam {
  teamId: string
  /** The address as stored on the row the password matched. */
  email: string
  name: string
  /** 'head' = teams.admin_email row; 'coach' = team_coaches row. */
  role: 'head' | 'coach'
  /** That row's password hash — what the session is bound to. Never send it to a client. */
  passwordHash: string
}

/**
 * Every team this email + password may coach, for the two password logins
 * (/api/team/login and /api/auth/login).
 *
 * Each row carries its own password: a head-coach row on `teams`, and an
 * added-coach row on `team_coaches`. They are set by separate invite links and
 * nothing keeps them equal, so each row is compared on its own — comparing
 * only the first row let a second head-coach password never work, and
 * checking team_coaches only when the email headed no team meant a head coach
 * who was also an assistant elsewhere could never reach that other team.
 */
export async function findCoachTeamsForLogin(email: string, password: string): Promise<CoachLoginTeam[]> {
  const e = email.toLowerCase().trim()
  const rows: Array<{ team_id: string; email: string; name: string; password_hash: string; role: 'head' | 'coach' }> = []

  rows.push(...((await db`
    SELECT id AS team_id, admin_email AS email, name, password_hash, 'head' AS role
    FROM teams
    WHERE LOWER(admin_email) = ${e} AND password_hash IS NOT NULL
  `) as unknown as typeof rows))

  try {
    rows.push(...((await db`
      SELECT tc.team_id, tc.email, t.name, tc.password_hash, 'coach' AS role
      FROM team_coaches tc
      JOIN teams t ON t.id = tc.team_id
      WHERE LOWER(tc.email) = ${e} AND tc.password_hash IS NOT NULL
    `) as unknown as typeof rows))
  } catch (err) {
    console.warn('team_coaches lookup failed (table may not exist yet):', err instanceof Error ? err.message : err)
  }

  // One bcrypt compare per distinct hash — the common case (same password on
  // every row) costs a single compare.
  const verdict = new Map<string, boolean>()
  const out = new Map<string, CoachLoginTeam>()
  for (const r of rows) {
    if (!verdict.has(r.password_hash)) {
      verdict.set(r.password_hash, await bcrypt.compare(password, r.password_hash))
    }
    if (verdict.get(r.password_hash) && !out.has(r.team_id)) {
      out.set(r.team_id, { teamId: r.team_id, email: r.email, name: r.name, role: r.role, passwordHash: r.password_hash })
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export type CoachTeamRole = 'head' | 'assistant' | 'org'

/**
 * Every team an email coaches (head, added coach, or org admin of the owning
 * org) — the dashboard's team switcher and the app's team picker
 * (/api/team/session `teams`). The same three rules as coachEmailForTeam, so
 * every team listed is one /api/team/select will switch to. `role` is the
 * strongest claim when several apply: head, then assistant, then org.
 */
export async function teamsCoachedBy(email: string): Promise<Array<{ id: string; name: string; role: CoachTeamRole }>> {
  const e = email.toLowerCase().trim()
  try {
    return (await db`
      SELECT t.id, t.name,
             CASE
               WHEN LOWER(t.admin_email) = ${e} AND t.password_hash IS NOT NULL THEN 'head'
               WHEN EXISTS (SELECT 1 FROM team_coaches tc
                            WHERE tc.team_id = t.id AND LOWER(tc.email) = ${e} AND tc.password_hash IS NOT NULL)
                 THEN 'assistant'
               ELSE 'org'
             END AS role
      FROM teams t
      WHERE (LOWER(t.admin_email) = ${e} AND t.password_hash IS NOT NULL)
         OR EXISTS (SELECT 1 FROM team_coaches tc
                    WHERE tc.team_id = t.id AND LOWER(tc.email) = ${e} AND tc.password_hash IS NOT NULL)
         OR EXISTS (SELECT 1 FROM organizations o WHERE o.id = t.organization_id AND LOWER(o.admin_email) = ${e})
      ORDER BY t.name ASC
    `) as unknown as Array<{ id: string; name: string; role: CoachTeamRole }>
  } catch {
    return (await db`
      SELECT id, name, 'head' AS role FROM teams
      WHERE LOWER(admin_email) = ${e} AND password_hash IS NOT NULL
      ORDER BY name ASC
    `) as unknown as Array<{ id: string; name: string; role: CoachTeamRole }>
  }
}

export function teamSessionCookieOptions(token: string) {
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
