import { db } from '@/lib/db'

/**
 * Stable references to "a player on this team", for coach uploads.
 *
 * Coach uploads used to be attributed by (first name, last initial): the
 * client sent names, and /api/analyze find-or-created a team_players row by
 * name and linked an account with `LIMIT 1` by name. Two "Liam S." on one
 * team and the shot landed on whichever row Postgres returned first.
 *
 * A ref names exactly one row in one of the three roster sources:
 *
 *   member:<userId>          team_memberships — a player with an account
 *   roster:<teamPlayerId>    team_players     — a name-only row a coach
 *                                               uploaded for before
 *   pending:<pendingId>      pending_team_members — invited, not joined
 *
 * Rows are NEVER merged by name here. The only link the schema can prove is
 * the row's own id, so two rows that share a name are listed twice and
 * flagged, and the coach picks.
 *
 * Where each kind is stored on the submission (see resolvePlayerRef):
 *   member  → submissions.user_id = the member, team_player_id NULL. Every
 *             member reader (team leaderboard, results roster, member page,
 *             player dashboard, /api/team/player-shots) keys on user_id; also
 *             setting team_player_id would list the shot a second time under
 *             the name-only row on the leaderboard.
 *   roster  → submissions.team_player_id = that row, user_id NULL.
 *   pending → stored on the team_players row with the pending player's name
 *             (found case-insensitively, else created), so the shot is not
 *             lost and shows under that name. Refused when another invited
 *             player on the team has the same name — a shared name-only row
 *             could not tell them apart.
 */

export type PlayerRefKind = 'member' | 'roster' | 'pending'

export interface TeamRosterEntry {
  /** `member:<uuid>` | `roster:<uuid>` | `pending:<uuid>` */
  ref: string
  kind: PlayerRefKind
  firstName: string
  lastInitial: string
  /** "Liam S." */
  name: string
  /** What tells this row apart from a same-name one: email, parent, status. */
  detail: string
  /** Another row on this team has the same first name + last initial. */
  sameNameAsAnother: boolean
  /** Set when this row cannot take a coach upload; the reason, in plain words. */
  blockedReason: string | null
  /** Graded shots already filed under this row on this team. */
  shotCount: number
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parsePlayerRef(ref: string | null | undefined): { kind: PlayerRefKind; id: string } | null {
  if (!ref) return null
  const m = /^(member|roster|pending):(.+)$/.exec(ref.trim())
  if (!m || !UUID_RE.test(m[2])) return null
  return { kind: m[1] as PlayerRefKind, id: m[2].toLowerCase() }
}

/** Trim and collapse inner whitespace: "  liam   j " -> "liam j". */
export function cleanName(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

/** First letter of a last name (or initial), uppercased; '' when there is none. */
export function lastInitialOf(s: string | null | undefined): string {
  const m = /[A-Za-zÀ-ɏ]/.exec(cleanName(s))
  // One character: "ß".toUpperCase() is "SS", which overflows CHAR(1).
  return m ? (Array.from(m[0].toUpperCase())[0] ?? '') : ''
}

/** "liam" -> "Liam"; leaves the rest of the name as typed. */
export function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function nameKey(first: string, initial: string): string {
  return `${first.trim().toLowerCase()}|${initial.trim().toUpperCase()}`
}

/** "liam.stone.shotlab@parents.test" -> "liam.stone…@parents.test" */
export function shortEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  return local.length > 14 ? `${local.slice(0, 12)}…@${domain}` : email
}

export interface PendingShotLink {
  pendingId: string
  /** The name-only row this invite's coach uploads are filed on, if any. */
  teamPlayerId: string | null
  /**
   * True when that row IS this invite's shot row, so the two are one player:
   * the row resolvePlayerRef files this invite's uploads on (same team, same
   * first name + initial, case-insensitive, chosen the same way), created at
   * or after the invite (so it was made for the invite's uploads, not a
   * different name-only player the coach added earlier), and no other invite
   * on the team shares the name (resolvePlayerRef refuses those uploads).
   */
  linked: boolean
  /** Another invite on this team has the same first name + initial. */
  ambiguous: boolean
}

/**
 * For each name-only invite on the team: the team_players row its uploads
 * are filed on, and whether that row can safely be shown as the same player.
 * Read-only; mirrors resolvePlayerRef + findOrCreateTeamPlayer.
 */
export async function loadPendingShotLinks(teamId: string): Promise<PendingShotLink[]> {
  const rows = (await db`
    SELECT p.id::text AS pending_id,
           tp.id::text AS team_player_id,
           -- team_players.created_at is a plain timestamp written by NOW() in
           -- the session time zone; compare it in that same zone.
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
    WHERE p.team_id = ${teamId}
  `) as unknown as Array<{
    pending_id: string
    team_player_id: string | null
    created_after: boolean | null
    same_name_pending: number
  }>
  return rows.map((r) => ({
    pendingId: r.pending_id,
    teamPlayerId: r.team_player_id,
    ambiguous: r.same_name_pending > 0,
    linked: !!r.team_player_id && !!r.created_after && r.same_name_pending === 0,
  }))
}

/** Every player on the team as its own row, labelled so same-name rows differ. */
export async function loadTeamRosterEntries(teamId: string): Promise<TeamRosterEntry[]> {
  const [members, roster, pending, links] = await Promise.all([
    db`
      SELECT tm.user_id::text AS id,
             COALESCE(NULLIF(TRIM(tm.first_name), ''), NULLIF(TRIM(u.first_name), ''), NULLIF(u.nickname, ''), split_part(u.email, '@', 1)) AS first_name,
             COALESCE(NULLIF(TRIM(tm.last_name_initial), ''), NULLIF(TRIM(u.last_initial), ''), '') AS last_name_initial,
             u.email, u.parent_name, COALESCE(u.roster_pending, false) AS roster_pending,
             (SELECT COUNT(*)::int FROM submissions s
               WHERE s.user_id = tm.user_id AND s.team_id = ${teamId} AND s.status = 'complete') AS shots
      FROM team_memberships tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ${teamId}
    ` as unknown as Promise<Array<{ id: string; first_name: string; last_name_initial: string; email: string; parent_name: string | null; roster_pending: boolean; shots: number }>>,
    db`
      SELECT tp.id::text AS id, tp.first_name, TRIM(tp.last_name_initial) AS last_name_initial,
             (SELECT COUNT(*)::int FROM submissions s
               WHERE s.team_player_id = tp.id AND s.status = 'complete') AS shots
      FROM team_players tp
      WHERE tp.team_id = ${teamId}
      ORDER BY tp.created_at ASC, tp.id
    ` as unknown as Promise<Array<{ id: string; first_name: string; last_name_initial: string; shots: number }>>,
    db`
      SELECT id::text AS id, first_name, COALESCE(TRIM(last_name_initial), '') AS last_name_initial, contact_email
      FROM pending_team_members
      WHERE team_id = ${teamId}
      ORDER BY created_at ASC, id
    ` as unknown as Promise<Array<{ id: string; first_name: string; last_name_initial: string; contact_email: string | null }>>,
    loadPendingShotLinks(teamId),
  ])

  // An invite and the name-only row made for its uploads are one player: list
  // the invite, with the row's shots, and drop the row.
  const linkedRowOf = new Map(links.filter((l) => l.linked).map((l) => [l.pendingId, l.teamPlayerId!]))
  const linkedRows = new Set(linkedRowOf.values())
  const rosterShots = new Map(roster.map((r) => [r.id, r.shots]))

  const shots = (n: number) => (n > 0 ? `${n} shot${n === 1 ? '' : 's'} so far` : 'no shots yet')
  const entries: TeamRosterEntry[] = []
  for (const m of members) {
    const bits = [shortEmail(m.email)]
    if (m.parent_name) bits.push(`parent ${m.parent_name}`)
    if (m.roster_pending) bits.push('setup not finished')
    bits.push(shots(m.shots))
    entries.push(entry('member', m.id, m.first_name, m.last_name_initial, bits.join(' · '), m.shots))
  }
  for (const r of roster) {
    if (linkedRows.has(r.id)) continue
    entries.push(entry('roster', r.id, r.first_name, r.last_name_initial, `name only, no account · ${shots(r.shots)}`, r.shots))
  }
  for (const p of pending) {
    const row = linkedRowOf.get(p.id)
    const n = row ? rosterShots.get(row) ?? 0 : 0
    const family = p.contact_email ? ` · family email ${shortEmail(p.contact_email)}` : ''
    entries.push(entry('pending', p.id, p.first_name, p.last_name_initial, `invited, not joined yet${family} · ${shots(n)}`, n))
  }

  // Same-name detection is for LABELS only — nothing is merged on it.
  const byName = new Map<string, TeamRosterEntry[]>()
  for (const e of entries) {
    const k = nameKey(e.firstName, e.lastInitial)
    byName.set(k, [...(byName.get(k) ?? []), e])
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue
    for (const e of group) e.sameNameAsAnother = true
    // Name-only rows and invites carry no email to tell them apart, so two of
    // the same kind get a number ("jayden M" and "Jayden M" both exist).
    for (const kind of ['roster', 'pending'] as const) {
      const same = group.filter((e) => e.kind === kind)
      if (same.length > 1) same.forEach((e, i) => (e.detail += ` · entry ${i + 1} of ${same.length}`))
    }
    const pendings = group.filter((e) => e.kind === 'pending')
    if (pendings.length === 1 && group.some((e) => e.kind === 'roster')) {
      // resolvePlayerRef files a pending player's shots on the name-only row
      // of the same name; say so rather than let it look like two players.
      pendings[0].detail += ` · shots file under the name-only ${pendings[0].name}`
    }
    if (pendings.length > 1) {
      for (const e of pendings) {
        e.blockedReason = `Another invited player is also named ${e.name} — ask them to finish joining first`
      }
    }
  }

  return entries.sort(
    (a, b) =>
      a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' }) ||
      a.lastInitial.localeCompare(b.lastInitial, undefined, { sensitivity: 'base' }) ||
      a.kind.localeCompare(b.kind) ||
      a.detail.localeCompare(b.detail)
  )
}

function entry(kind: PlayerRefKind, id: string, first: string, initial: string, detail: string, shotCount: number): TeamRosterEntry {
  const firstName = cleanName(first)
  const lastInitial = cleanName(initial).toUpperCase()
  return {
    ref: `${kind}:${id}`,
    kind,
    firstName,
    lastInitial,
    name: lastInitial ? `${capitalizeFirst(firstName)} ${lastInitial}.` : capitalizeFirst(firstName),
    detail,
    sameNameAsAnother: false,
    blockedReason: null,
    shotCount,
  }
}

export type ResolvedPlayerRef =
  | { ok: true; kind: PlayerRefKind; userId: string | null; teamPlayerId: string | null; name: string }
  | { ok: false; status: number; error: string }

/**
 * Resolve a ref strictly WITHIN `teamId`. A ref for a row on another team is
 * "not found", never a cross-team write. May create a team_players row (for
 * a pending player's first upload).
 */
export async function resolvePlayerRef(teamId: string, ref: string): Promise<ResolvedPlayerRef> {
  const parsed = parsePlayerRef(ref)
  if (!parsed) return { ok: false, status: 400, error: 'Invalid player' }
  const notFound: ResolvedPlayerRef = {
    ok: false,
    status: 404,
    error: 'That player is no longer on this team — reload the page and pick again.',
  }

  if (parsed.kind === 'member') {
    const [m] = (await db`
      SELECT tm.user_id::text AS user_id, tm.first_name, tm.last_name_initial, u.email
      FROM team_memberships tm JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ${teamId} AND tm.user_id = ${parsed.id}
    `) as unknown as Array<{ user_id: string; first_name: string | null; last_name_initial: string | null; email: string }>
    if (!m) return notFound
    const first = cleanName(m.first_name)
    const initial = cleanName(m.last_name_initial).toUpperCase()
    // The email is what tells two "Liam S." apart in the coach's confirmation.
    const name = first ? `${capitalizeFirst(first)}${initial ? ` ${initial}.` : ''} (${shortEmail(m.email)})` : m.email
    return { ok: true, kind: 'member', userId: m.user_id, teamPlayerId: null, name }
  }

  if (parsed.kind === 'roster') {
    const [r] = (await db`
      SELECT id::text AS id, first_name, TRIM(last_name_initial) AS last_name_initial
      FROM team_players WHERE team_id = ${teamId} AND id = ${parsed.id}
    `) as unknown as Array<{ id: string; first_name: string; last_name_initial: string }>
    if (!r) return notFound
    return {
      ok: true,
      kind: 'roster',
      userId: null,
      teamPlayerId: r.id,
      name: `${capitalizeFirst(r.first_name)} ${r.last_name_initial}.`,
    }
  }

  const [p] = (await db`
    SELECT first_name, last_name_initial FROM pending_team_members
    WHERE team_id = ${teamId} AND id = ${parsed.id}
  `) as unknown as Array<{ first_name: string; last_name_initial: string | null }>
  if (!p) return notFound
  const first = cleanName(p.first_name)
  // team_players.last_name_initial is NOT NULL CHAR(1); '?' is the existing
  // convention for "no initial known" (see CoachUploadForm).
  const initial = lastInitialOf(p.last_name_initial) || '?'
  const name = initial === '?' ? capitalizeFirst(first) : `${capitalizeFirst(first)} ${initial}.`

  const [peers] = (await db`
    SELECT COUNT(*)::int AS n FROM pending_team_members
    WHERE team_id = ${teamId} AND id <> ${parsed.id}
      AND LOWER(TRIM(first_name)) = LOWER(${first})
      AND UPPER(COALESCE(TRIM(last_name_initial), '?')) = ${initial}
  `) as unknown as Array<{ n: number }>
  if ((peers?.n ?? 0) > 0) {
    return {
      ok: false,
      status: 409,
      error: `Two invited players are named ${name}, so this shot can't be filed safely. Ask one of them to finish joining first.`,
    }
  }

  const tpId = await findOrCreateTeamPlayer(teamId, first, initial)
  // Keep the invite's family email on the shot row too, so the shots stay
  // emailable if the invite is later removed.
  await db`
    UPDATE team_players tp SET contact_email = p.contact_email
    FROM pending_team_members p
    WHERE tp.id = ${tpId} AND p.id = ${parsed.id}
      AND p.contact_email IS NOT NULL AND tp.contact_email IS NULL
  `.catch(() => {})
  return { ok: true, kind: 'pending', userId: null, teamPlayerId: tpId, name }
}

/**
 * The team_players row for a name, matched case-insensitively (an exact-case
 * match wins, then the oldest), created when none exists. Used by pending
 * refs and by the legacy name path.
 */
export async function findOrCreateTeamPlayer(teamId: string, first: string, initial: string): Promise<string> {
  const find = async () =>
    (await db`
      SELECT id::text AS id FROM team_players
      WHERE team_id = ${teamId}
        AND LOWER(first_name) = LOWER(${first})
        AND UPPER(last_name_initial) = ${initial}
      ORDER BY (first_name = ${first}) DESC, created_at ASC
      LIMIT 1
    `) as unknown as Array<{ id: string }>
  const [existing] = await find()
  if (existing) return existing.id
  await db`
    INSERT INTO team_players (team_id, first_name, last_name_initial)
    VALUES (${teamId}, ${capitalizeFirst(first)}, ${initial})
    ON CONFLICT (team_id, first_name, last_name_initial) DO NOTHING
  `
  const [created] = await find()
  return created.id
}
