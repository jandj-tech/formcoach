// Server-side roster + release queries for the org Results tab. Shared by the
// roster route (what the coach sees) and the send route (what gets emailed),
// so "which submissions belong to this team" is decided in exactly one place.

import { db } from '@/lib/db'
import { loadPendingShotLinks } from '@/lib/team-roster-refs'

export interface RosterPlayer {
  /** Stable row key: `member:<userId>`, `roster:<teamPlayerId>` or `pending:<pendingId>`. */
  key: string
  kind: 'member' | 'roster' | 'pending'
  userId: string | null
  /** For `roster:` rows, and for `pending:` rows whose uploads are filed on one. */
  teamPlayerId: string | null
  pendingId: string | null
  /** "Ava R." — one format for every kind of row. */
  name: string
  /** First name only, for greetings. Null when the roster has none. */
  firstName: string | null
  email: string | null
  /**
   * Where `email` comes from: the player's own account ('own'), or a family
   * address shared with a sibling who owns it ('family', name-only players).
   */
  emailSource: 'own' | 'family' | null
  /**
   * For a family email: whose account(s) the address belongs to ("Olivia P.",
   * or "Liam S. and Ava S." when several siblings each have one there).
   */
  familyOf: string | null
  /** Another row on this team shows the same name. */
  sameNameAsAnother: boolean
  /** What tells this row apart from a same-name one (parent, email, kind). */
  detail: string | null
  /** Latest COMPLETE submission on this team, if any. */
  submissionId: string | null
  token: string | null
  score: number | null
  gradedAt: string | null
  /** Release state for that submission. */
  sentAt: string | null
  resentAt: string | null
  unlocked: boolean
  /** Suppression flags from email_list. */
  unsubscribed: boolean
  bounced: boolean
  /**
   * An account added by a coach/org that hasn't been set up yet (no password
   * chosen). Results emailed to them become a "finish setting up to see your
   * results" email. Always false for name-only rows.
   */
  setupPending: boolean
}

/** ["Liam S."] -> "Liam S."; ["Liam S.", "Ava S."] -> "Liam S. and Ava S." */
function joinOwners(names: string[]): string {
  return names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** "Ava" + "r" -> "Ava R."; "Ava" + "" / "?" -> "Ava". */
function displayName(first: string | null | undefined, initial: string | null | undefined): string {
  const f = (first ?? '').replace(/\s+/g, ' ').trim()
  const i = (initial ?? '').trim().charAt(0).toUpperCase()
  return i && i !== '?' ? `${f} ${i}.` : f
}

/**
 * Every player on a team with their latest complete submission and release
 * state, from all three roster sources:
 *
 *  - members (team_memberships): account players, emailed at their account.
 *  - name-only invites (pending_team_members): no account. Emailable only
 *    through a family contact email (a sibling's address, saved when the
 *    import found it already in use). Their coach uploads live on the
 *    team_players row made for them (see loadPendingShotLinks); that row is
 *    folded into the invite so the player shows once, with their shots.
 *  - other name-only rows (team_players): coach uploads with no invite.
 *
 * A member's submission counts for this team only when it is tagged with this
 * team (`s.team_id = teamId`). A player's personal, self-paid shot (team_id
 * NULL) or a shot on another team never appears here, so an org send can't
 * create a release that paywalls a report the player bought themselves.
 *
 * A name-only row shows whenever it holds a graded shot that isn't attributed
 * to any account (`s.user_id IS NULL`), even if a member shares the same first
 * name + initial ("Jayden M." Miller vs member Jayden Moore). It is hidden only
 * when it has no such shot and a same-name member exists (the row has since
 * joined with an account and shows once, as the member).
 */
export async function teamResultsRoster(teamId: string): Promise<RosterPlayer[]> {
  const links = await loadPendingShotLinks(teamId)
  const linkedRowOf = new Map(links.filter((l) => l.linked).map((l) => [l.pendingId, l.teamPlayerId!]))
  const linkedRows = [...new Set(linkedRowOf.values())]

  const members = (await db`
    SELECT
      tm.user_id,
      NULLIF(TRIM(tm.first_name), '') AS tm_first,
      NULLIF(TRIM(tm.last_name_initial), '') AS tm_initial,
      NULLIF(u.nickname, '') AS nickname,
      COALESCE(
        NULLIF(TRIM(tm.first_name), ''),
        NULLIF(split_part(TRIM(u.nickname), ' ', 1), '')
      ) AS first_name,
      u.email, u.parent_name,
      (COALESCE(u.roster_pending, false) AND u.password_hash IS NULL) AS setup_pending,
      latest.id AS submission_id, latest.token, latest.overall_score, latest.graded_at,
      r.sent_at, r.resent_at, r.unlocked,
      el.unsubscribed_at, el.bounced_at, el.complained_at
    FROM team_memberships tm
    JOIN users u ON u.id = tm.user_id
    LEFT JOIN LATERAL (
      SELECT s.id, s.token, a.overall_score, a.created_at AS graded_at
      FROM submissions s
      JOIN analyses a ON a.submission_id = s.id
      WHERE s.status = 'complete'
        AND s.user_id = tm.user_id
        AND s.team_id = ${teamId}
      ORDER BY a.created_at DESC
      LIMIT 1
    ) latest ON TRUE
    LEFT JOIN result_releases r ON r.submission_id = latest.id
    LEFT JOIN email_list el ON el.email = LOWER(u.email)
    WHERE tm.team_id = ${teamId}
  `) as unknown as Array<{
    user_id: string
    tm_first: string | null
    tm_initial: string | null
    nickname: string | null
    first_name: string | null
    email: string
    parent_name: string | null
    setup_pending: boolean | null
    submission_id: string | null
    token: string | null
    overall_score: string | null
    graded_at: Date | null
    sent_at: Date | null
    resent_at: Date | null
    unlocked: boolean | null
    unsubscribed_at: Date | null
    bounced_at: Date | null
    complained_at: Date | null
  }>

  const rosterRows = (await db`
    SELECT
      tp.id AS team_player_id,
      tp.first_name, TRIM(tp.last_name_initial) AS last_name_initial,
      NULLIF(LOWER(TRIM(tp.contact_email)), '') AS contact_email,
      latest.id AS submission_id, latest.token, latest.overall_score, latest.graded_at,
      r.sent_at, r.resent_at, r.unlocked
    FROM team_players tp
    LEFT JOIN LATERAL (
      SELECT s.id, s.token, a.overall_score, a.created_at AS graded_at
      FROM submissions s
      JOIN analyses a ON a.submission_id = s.id
      WHERE s.status = 'complete'
        AND s.team_player_id = tp.id
        AND s.user_id IS NULL
      ORDER BY a.created_at DESC
      LIMIT 1
    ) latest ON TRUE
    LEFT JOIN result_releases r ON r.submission_id = latest.id
    WHERE tp.team_id = ${teamId}
      AND (
        -- The shot row of a name-only invite: always read (it is shown as
        -- that invite, below).
        tp.id = ANY(${linkedRows}::uuid[])
        -- A roster row with a graded shot no account owns always shows (else
        -- that shot would vanish behind a same-name member). Without one, a
        -- row that has since joined with an account shows once, as the member.
        OR latest.id IS NOT NULL
        OR NOT EXISTS (
          SELECT 1 FROM team_memberships tm
          WHERE tm.team_id = tp.team_id
            AND LOWER(TRIM(tm.first_name)) = LOWER(TRIM(tp.first_name))
            AND UPPER(tm.last_name_initial) = UPPER(tp.last_name_initial)
        )
      )
  `) as unknown as Array<{
    team_player_id: string
    first_name: string
    last_name_initial: string
    contact_email: string | null
    submission_id: string | null
    token: string | null
    overall_score: string | null
    graded_at: Date | null
    sent_at: Date | null
    resent_at: Date | null
    unlocked: boolean | null
  }>

  const pending = (await db`
    SELECT p.id AS pending_id, p.first_name, TRIM(p.last_name_initial) AS last_name_initial,
           NULLIF(LOWER(TRIM(p.contact_email)), '') AS contact_email
    FROM pending_team_members p
    WHERE p.team_id = ${teamId}
    ORDER BY p.created_at ASC
  `) as unknown as Array<{
    pending_id: string
    first_name: string
    last_name_initial: string | null
    contact_email: string | null
  }>

  // Family emails: suppression flags, and whose account the address is.
  const rowById = new Map(rosterRows.map((r) => [r.team_player_id, r]))
  const familyEmails = [
    ...new Set(
      [
        ...pending.map((p) => p.contact_email ?? rowById.get(linkedRowOf.get(p.pending_id) ?? '')?.contact_email ?? null),
        ...rosterRows.map((r) => r.contact_email),
      ].filter((e): e is string => !!e)
    ),
  ]
  // Several player accounts may share one family address (siblings, each
  // with their own account — lib/player-accounts.ts), so an address can have
  // several owners: every one is listed, oldest first, each once.
  const familyInfo = new Map<string, { owners: string[]; unsubscribed: boolean; bounced: boolean }>()
  if (familyEmails.length) {
    const rows = (await db`
      SELECT e.email, u.id AS user_id,
             COALESCE(NULLIF(TRIM(u.first_name), ''), NULLIF(TRIM(fm.first_name), ''), NULLIF(split_part(TRIM(u.nickname), ' ', 1), '')) AS owner_first,
             COALESCE(NULLIF(TRIM(u.last_initial), ''), NULLIF(TRIM(fm.last_name_initial), '')) AS owner_initial,
             el.unsubscribed_at, el.bounced_at, el.complained_at
      FROM UNNEST(${familyEmails}::text[]) AS e(email)
      LEFT JOIN users u ON LOWER(u.email) = e.email
      LEFT JOIN LATERAL (
        SELECT first_name, last_name_initial FROM team_memberships
        WHERE user_id = u.id AND COALESCE(TRIM(first_name), '') <> ''
        ORDER BY joined_at ASC LIMIT 1
      ) fm ON TRUE
      LEFT JOIN email_list el ON el.email = e.email
      ORDER BY e.email, u.created_at ASC NULLS LAST, u.id ASC
    `) as unknown as Array<{
      email: string
      user_id: string | null
      owner_first: string | null
      owner_initial: string | null
      unsubscribed_at: Date | null
      bounced_at: Date | null
      complained_at: Date | null
    }>
    for (const r of rows) {
      const info = familyInfo.get(r.email) ?? {
        owners: [],
        // Suppression is per inbox: the same on every row of this address.
        unsubscribed: !!r.unsubscribed_at || !!r.complained_at,
        bounced: !!r.bounced_at,
      }
      const owner = r.owner_first ? displayName(r.owner_first, r.owner_initial) : null
      if (owner && !info.owners.includes(owner)) info.owners.push(owner)
      familyInfo.set(r.email, info)
    }
  }

  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null)
  type Shot = {
    submission_id: string | null
    token: string | null
    overall_score: string | null
    graded_at: Date | null
    sent_at: Date | null
    resent_at: Date | null
    unlocked: boolean | null
  }
  const shot = (r: Shot | undefined) => ({
    submissionId: r?.submission_id ?? null,
    token: r?.token ?? null,
    score: r?.overall_score != null ? Number(r.overall_score) : null,
    gradedAt: iso(r?.graded_at),
    sentAt: iso(r?.sent_at),
    resentAt: iso(r?.resent_at),
    unlocked: !!r?.unlocked,
  })
  // The owners named for a name-only row: everyone on the address except an
  // account by this row's own first name (that is the same child, not whose
  // email it is) — unless nobody else is left to name.
  const family = (email: string | null, rowFirst?: string | null) => {
    const info = email ? familyInfo.get(email) : undefined
    const own = (rowFirst ?? '').trim().toLowerCase()
    const others = (info?.owners ?? []).filter((o) => !own || o.split(' ')[0].toLowerCase() !== own)
    const owners = others.length ? others : info?.owners ?? []
    return {
      email,
      emailSource: email ? ('family' as const) : null,
      familyOf: owners.length ? joinOwners(owners) : null,
      unsubscribed: info?.unsubscribed ?? false,
      bounced: info?.bounced ?? false,
    }
  }

  const out: RosterPlayer[] = [
    ...members.map((m) => ({
      key: `member:${m.user_id}`,
      kind: 'member' as const,
      userId: m.user_id,
      teamPlayerId: null,
      pendingId: null,
      name: m.tm_first ? displayName(m.tm_first, m.tm_initial) : m.nickname ?? m.email.split('@')[0],
      firstName: m.first_name,
      email: m.email,
      emailSource: 'own' as const,
      familyOf: null,
      sameNameAsAnother: false,
      detail: m.parent_name ? `parent ${m.parent_name}` : m.email,
      ...shot(m),
      unsubscribed: !!m.unsubscribed_at || !!m.complained_at,
      bounced: !!m.bounced_at,
      setupPending: !!m.setup_pending,
    })),
    ...pending.map((p) => {
      const row = rowById.get(linkedRowOf.get(p.pending_id) ?? '')
      const contact = p.contact_email ?? row?.contact_email ?? null
      const link = links.find((l) => l.pendingId === p.pending_id)
      return {
        key: `pending:${p.pending_id}`,
        kind: 'pending' as const,
        userId: null,
        teamPlayerId: row?.team_player_id ?? null,
        pendingId: p.pending_id,
        name: displayName(p.first_name, p.last_name_initial),
        firstName: p.first_name?.trim() || null,
        ...family(contact, p.first_name),
        sameNameAsAnother: false,
        detail: link?.ambiguous
          ? 'invited, no account · another invite has this name, so shots stay under the name-only entry'
          : 'invited, no account',
        ...shot(row),
        setupPending: false,
      }
    }),
    ...rosterRows
      .filter((r) => !linkedRows.includes(r.team_player_id))
      .map((r) => ({
        key: `roster:${r.team_player_id}`,
        kind: 'roster' as const,
        userId: null,
        teamPlayerId: r.team_player_id,
        pendingId: null,
        name: displayName(r.first_name, r.last_name_initial),
        firstName: r.first_name?.trim() || null,
        ...family(r.contact_email, r.first_name),
        sameNameAsAnother: false,
        detail: 'name only, no account',
        ...shot(r),
        setupPending: false,
      })),
  ]

  // Lookalike names ("Jayden M." twice) keep their detail line; everyone
  // else's is dropped so the list stays quiet.
  const byName = new Map<string, RosterPlayer[]>()
  for (const p of out) {
    const k = p.name.toLowerCase()
    byName.set(k, [...(byName.get(k) ?? []), p])
  }
  for (const group of byName.values()) {
    if (group.length > 1) for (const p of group) p.sameNameAsAnother = true
    else group[0].detail = null
  }

  return out.sort(
    (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.kind.localeCompare(b.kind)
  )
}

export interface SendableSubmission {
  submissionId: string
  token: string
  score: number
  userId: string | null
  email: string | null
  playerName: string | null
  unsubscribed: boolean
  bounced: boolean
  /** The account hasn't been set up yet (see RosterPlayer.setupPending). */
  setupPending: boolean
}

/**
 * The subset of `submissionIds` that are complete and belong to `teamId`,
 * with the recipient resolved. Anything not returned was not this team's (or
 * not graded yet) and must not be sent.
 *
 * "Belongs" means tagged with the team or filed under one of its name-only
 * roster rows. Being uploaded by someone who is ALSO a member is not enough:
 * that let one team's send overwrite another team's (or org's) release.
 */
export async function sendableSubmissions(
  teamId: string,
  submissionIds: string[]
): Promise<SendableSubmission[]> {
  if (submissionIds.length === 0) return []
  const rows = (await db`
    SELECT
      s.id AS submission_id, s.token, s.user_id,
      a.overall_score,
      u.email,
      (COALESCE(u.roster_pending, false) AND u.password_hash IS NULL) AS setup_pending,
      COALESCE(
        NULLIF(TRIM(CONCAT(tm.first_name, ' ', NULLIF(TRIM(tm.last_name_initial), '') || '.')), ''),
        NULLIF(u.nickname, ''),
        NULLIF(TRIM(CONCAT(tp.first_name, ' ', tp.last_name_initial, '.')), '.')
      ) AS player_name,
      el.unsubscribed_at, el.bounced_at, el.complained_at
    FROM submissions s
    JOIN LATERAL (
      SELECT overall_score FROM analyses WHERE submission_id = s.id ORDER BY created_at DESC LIMIT 1
    ) a ON TRUE
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN team_memberships tm ON tm.team_id = ${teamId} AND tm.user_id = s.user_id
    LEFT JOIN team_players tp ON tp.id = s.team_player_id AND tp.team_id = ${teamId}
    LEFT JOIN email_list el ON u.email IS NOT NULL AND el.email = LOWER(u.email)
    WHERE s.id = ANY(${submissionIds}::uuid[])
      AND s.status = 'complete'
      AND (s.team_id = ${teamId} OR tp.id IS NOT NULL)
  `) as unknown as Array<{
    submission_id: string
    token: string
    user_id: string | null
    overall_score: string | null
    email: string | null
    setup_pending: boolean | null
    player_name: string | null
    unsubscribed_at: Date | null
    bounced_at: Date | null
    complained_at: Date | null
  }>
  return rows
    .filter((r) => r.overall_score !== null)
    .map((r) => ({
      submissionId: r.submission_id,
      token: r.token,
      score: Number(r.overall_score),
      userId: r.user_id,
      email: r.email,
      playerName: r.player_name,
      unsubscribed: !!r.unsubscribed_at || !!r.complained_at,
      bounced: !!r.bounced_at,
      setupPending: !!r.user_id && !!r.setup_pending,
    }))
}

/** Team lookup scoped to the org: null when the team isn't the org's. */
export async function orgTeam(
  orgId: string,
  teamId: string
): Promise<{ id: string; name: string; adminEmail: string; accessCode: string } | null> {
  const rows = await db`
    SELECT id, name, admin_email, access_code FROM teams
    WHERE id = ${teamId} AND organization_id = ${orgId}
  `
  const row = rows[0] as { id: string; name: string; admin_email: string; access_code: string } | undefined
  return row ? { id: row.id, name: row.name, adminEmail: row.admin_email, accessCode: row.access_code } : null
}

/** One graded shot a team holds for a roster player (newest first in lists). */
export interface TeamShot {
  submissionId: string
  token: string
  score: number
  gradedAt: string | null
  /** A middle frame, for a thumbnail. Null when the shot has no stored frames. */
  thumb: string | null
  /** When results for this shot were last emailed (sent or resent), if ever. */
  sentAt: string | null
}

/** Most shots listed per player in the composer's picker. */
export const MAX_LISTED_SHOTS = 20

/**
 * Every graded shot this team holds for each of `players`, keyed by roster
 * key, newest first (at most MAX_LISTED_SHOTS each). "Holds" is the same rule
 * as teamResultsRoster / sendableSubmissions: a member's shot tagged with
 * this team, or a name-only row's shot that no account owns. Never a
 * player's personal shot or another team's.
 */
export async function teamGradedShots(
  teamId: string,
  players: Array<Pick<RosterPlayer, 'key' | 'kind' | 'userId' | 'teamPlayerId'>>
): Promise<Map<string, TeamShot[]>> {
  const out = new Map<string, TeamShot[]>()
  const userIds = [...new Set(players.filter((p) => p.kind === 'member' && p.userId).map((p) => p.userId!))]
  const rowIds = [...new Set(players.filter((p) => p.kind !== 'member' && p.teamPlayerId).map((p) => p.teamPlayerId!))]
  if (userIds.length === 0 && rowIds.length === 0) return out
  const rows = (await db`
    SELECT s.id, s.token, s.user_id, s.team_player_id,
           a.overall_score, a.created_at AS graded_at,
           a.frame_urls[GREATEST(1, (COALESCE(cardinality(a.frame_urls), 0) + 1) / 2)] AS thumb,
           COALESCE(r.resent_at, r.sent_at) AS sent_at
    FROM submissions s
    JOIN LATERAL (
      SELECT overall_score, created_at, frame_urls FROM analyses
      WHERE submission_id = s.id ORDER BY created_at DESC LIMIT 1
    ) a ON TRUE
    LEFT JOIN team_players tp ON tp.id = s.team_player_id AND tp.team_id = ${teamId}
    LEFT JOIN result_releases r ON r.submission_id = s.id
    WHERE s.status = 'complete'
      AND a.overall_score IS NOT NULL
      AND s.token IS NOT NULL
      AND (
        (s.team_id = ${teamId} AND s.user_id = ANY(${userIds}::uuid[]))
        OR (s.user_id IS NULL AND tp.id IS NOT NULL AND s.team_player_id = ANY(${rowIds}::uuid[]))
      )
    ORDER BY a.created_at DESC
  `) as unknown as Array<{
    id: string
    token: string
    user_id: string | null
    team_player_id: string | null
    overall_score: string
    graded_at: Date | null
    thumb: string | null
    sent_at: Date | null
  }>
  const keyOf = new Map<string, string>()
  for (const p of players) {
    if (p.kind === 'member' && p.userId) keyOf.set(`u:${p.userId}`, p.key)
    else if (p.teamPlayerId) keyOf.set(`t:${p.teamPlayerId}`, p.key)
  }
  for (const r of rows) {
    const key = r.user_id ? keyOf.get(`u:${r.user_id}`) : r.team_player_id ? keyOf.get(`t:${r.team_player_id}`) : undefined
    if (!key) continue
    const list = out.get(key) ?? []
    if (list.length >= MAX_LISTED_SHOTS) continue
    list.push({
      submissionId: r.id,
      token: r.token,
      score: Number(r.overall_score),
      gradedAt: r.graded_at ? new Date(r.graded_at).toISOString() : null,
      thumb: r.thumb || null,
      sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
    })
    out.set(key, list)
  }
  return out
}
