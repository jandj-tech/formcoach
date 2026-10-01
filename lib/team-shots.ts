import { db } from '@/lib/db'
import { shortEmail } from '@/lib/team-roster-refs'

/**
 * A team's shots, for its leaderboard / most-improved / roster aggregates.
 *
 * One rule, in one place: a team sees a submission only when it was filed to
 * that team (`submissions.team_id`). A player's self-paid personal shots
 * (team_id NULL) and shots filed to another team — possibly another
 * organization's — are never counted or shown. The old queries joined a
 * member's submissions by `user_id` alone, so any coach who got an account
 * onto their roster saw that player's entire history everywhere.
 *
 * Each shot is attributed once:
 *   - to the member, when its user_id is a member of this team;
 *   - otherwise to the name-only team_players row it names.
 * Older coach uploads for account players carry BOTH ids; the old UNION ALL
 * counted each of them twice (once per branch). Shots matching neither (the
 * player has since left the team) are left out, as before.
 */

export interface TeamLeaderRow {
  id: string
  first_name: string
  last_name_initial: string
  kind: 'member' | 'player'
  best_score: number | string
  avg_score: number | string | null
  upload_count: number
}

export interface TeamImprovedRow {
  player_id: string
  first_name: string
  last_name_initial: string
  first_score: number | string
  latest_score: number | string
}

export async function teamLeaderboard(teamId: string): Promise<TeamLeaderRow[]> {
  return (await db`
    WITH shots AS (
      SELECT
        CASE WHEN tm.user_id IS NOT NULL THEN tm.user_id::text ELSE tp.id::text END AS player_id,
        CASE WHEN tm.user_id IS NOT NULL THEN COALESCE(NULLIF(tm.first_name, ''), u.email) ELSE tp.first_name END AS first_name,
        CASE WHEN tm.user_id IS NOT NULL THEN COALESCE(tm.last_name_initial, '') ELSE COALESCE(tp.last_name_initial, '') END AS last_name_initial,
        CASE WHEN tm.user_id IS NOT NULL THEN 'member' ELSE 'player' END AS kind,
        a.overall_score, s.id AS sid
      FROM submissions s
      JOIN analyses a ON a.submission_id = s.id
      LEFT JOIN team_memberships tm ON tm.team_id = s.team_id AND tm.user_id = s.user_id
      LEFT JOIN users u ON u.id = tm.user_id
      LEFT JOIN team_players tp ON tp.id = s.team_player_id AND tp.team_id = s.team_id
      WHERE s.team_id = ${teamId} AND s.status = 'complete'
        AND (tm.user_id IS NOT NULL OR tp.id IS NOT NULL)
    )
    SELECT
      player_id AS id, first_name, last_name_initial, kind,
      MAX(overall_score) AS best_score,
      ROUND(AVG(overall_score)::numeric, 1) AS avg_score,
      COUNT(DISTINCT sid)::int AS upload_count
    FROM shots
    GROUP BY player_id, first_name, last_name_initial, kind
    ORDER BY best_score DESC
  `) as unknown as TeamLeaderRow[]
}

export async function teamMostImproved(teamId: string): Promise<TeamImprovedRow[]> {
  return (await db`
    WITH shots AS (
      SELECT
        CASE WHEN tm.user_id IS NOT NULL THEN tm.user_id::text ELSE tp.id::text END AS player_id,
        CASE WHEN tm.user_id IS NOT NULL THEN COALESCE(NULLIF(tm.first_name, ''), u.email) ELSE tp.first_name END AS first_name,
        CASE WHEN tm.user_id IS NOT NULL THEN COALESCE(tm.last_name_initial, '') ELSE COALESCE(tp.last_name_initial, '') END AS last_name_initial,
        a.overall_score, s.id AS sid, s.created_at
      FROM submissions s
      JOIN analyses a ON a.submission_id = s.id
      LEFT JOIN team_memberships tm ON tm.team_id = s.team_id AND tm.user_id = s.user_id
      LEFT JOIN users u ON u.id = tm.user_id
      LEFT JOIN team_players tp ON tp.id = s.team_player_id AND tp.team_id = s.team_id
      WHERE s.team_id = ${teamId} AND s.status = 'complete'
        AND (tm.user_id IS NOT NULL OR tp.id IS NOT NULL)
    ),
    ranked AS (
      SELECT
        player_id, first_name, last_name_initial, overall_score, created_at,
        COUNT(sid) OVER (PARTITION BY player_id) AS upload_count,
        ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY created_at ASC) AS rn_first,
        ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY created_at DESC) AS rn_last
      FROM shots
    )
    SELECT * FROM (
      SELECT DISTINCT
        player_id,
        first_name,
        last_name_initial,
        MAX(CASE WHEN rn_first = 1 THEN overall_score END) OVER (PARTITION BY player_id) AS first_score,
        MAX(CASE WHEN rn_last = 1 THEN overall_score END) OVER (PARTITION BY player_id) AS latest_score
      FROM ranked
      WHERE upload_count >= 2
    ) improved_rows
    ORDER BY (latest_score - first_score) DESC
  `) as unknown as TeamImprovedRow[]
}

/**
 * Coach/org boards only: when two players on the team's roster share a name
 * ("Liam B." twice), their rows get a `detail` that tells them apart — the
 * member's email (shortened), or "name only". Player-facing boards never
 * call this, so teammates' emails stay off them. `roster` is the team's
 * members (id = user id, with email) and name-only players (no email).
 */
export function withTwinDetails<T extends Pick<TeamLeaderRow, 'id' | 'first_name' | 'last_name_initial' | 'kind'>>(
  rows: T[],
  roster: ReadonlyArray<{ id: string; email?: string | null; first_name: string | null; last_name_initial: string | null }>,
): Array<T & { detail?: string }> {
  const key = (first: string | null, initial: string | null) =>
    `${(first ?? '').trim().toLowerCase()}|${(initial ?? '').trim().toLowerCase()}`
  const count = new Map<string, number>()
  for (const p of roster) {
    if (!p.first_name) continue
    const k = key(p.first_name, p.last_name_initial)
    count.set(k, (count.get(k) ?? 0) + 1)
  }
  const emailOf = new Map(roster.filter(p => p.email).map(p => [p.id, p.email as string]))
  return rows.map(r => {
    if ((count.get(key(r.first_name, r.last_name_initial)) ?? 0) < 2) return r
    const email = r.kind === 'member' ? emailOf.get(r.id) : undefined
    return { ...r, detail: email ? shortEmail(email) : 'name only' }
  })
}

/** Contract names used by the player/coach packages. */
export type LeaderboardRow = TeamLeaderRow
export type ImprovedRow = TeamImprovedRow

export type LeaderboardVisibility = 'team' | 'hidden'
export const LEADERBOARD_VISIBILITIES: readonly LeaderboardVisibility[] = ['team', 'hidden']

export function isLeaderboardVisibility(v: unknown): v is LeaderboardVisibility {
  return v === 'team' || v === 'hidden'
}

export interface PlayerTeamBoard {
  hidden: boolean
  leaderboard: LeaderboardRow[]
  mostImproved: ImprovedRow[]
}

/**
 * The team board as a PLAYER may see it. Every player-facing reader must go
 * through this; coach/org readers keep calling teamLeaderboard directly.
 *
 * When the coach has set the board to 'hidden', only the caller's own member
 * row(s) survive — teammates' names and scores never leave the server. A
 * missing team reads as not hidden with empty lists.
 */
export async function playerTeamBoard(teamId: string, userId: string): Promise<PlayerTeamBoard> {
  const [team] = await db`SELECT leaderboard_visibility FROM teams WHERE id = ${teamId}`
  const hidden = team?.leaderboard_visibility === 'hidden'
  const [leaderboard, mostImproved] = await Promise.all([
    teamLeaderboard(teamId),
    teamMostImproved(teamId),
  ])
  if (!hidden) return { hidden, leaderboard, mostImproved }
  return {
    hidden,
    leaderboard: leaderboard.filter(r => r.kind === 'member' && r.id === userId),
    mostImproved: mostImproved.filter(r => r.player_id === userId),
  }
}
