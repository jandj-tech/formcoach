// Server-side roster + release queries for the org Results tab. Shared by the
// roster route (what the coach sees) and the send route (what gets emailed),
// so "which submissions belong to this team" is decided in exactly one place.

import { db } from '@/lib/db'

export interface RosterPlayer {
  /** Stable row key: `member:<userId>` or `roster:<teamPlayerId>`. */
  key: string
  userId: string | null
  teamPlayerId: string | null
  name: string
  email: string | null
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
}

/**
 * Every player on a team with their latest complete submission and release
 * state. Account players come from team_memberships (reachable by email);
 * coach-added name-only players come from team_players (no email — the UI
 * flags them and offers the join link). A submission counts as this team's
 * when it is tagged with the team, attached to one of its roster players, or
 * uploaded by one of its account members.
 */
export async function teamResultsRoster(teamId: string): Promise<RosterPlayer[]> {
  const members = (await db`
    SELECT
      tm.user_id,
      COALESCE(
        NULLIF(TRIM(CONCAT(tm.first_name, ' ', tm.last_name_initial)), ''),
        NULLIF(u.nickname, ''),
        split_part(u.email, '@', 1)
      ) AS name,
      u.email,
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
        AND (s.team_id = ${teamId} OR s.team_id IS NULL)
      ORDER BY a.created_at DESC
      LIMIT 1
    ) latest ON TRUE
    LEFT JOIN result_releases r ON r.submission_id = latest.id
    LEFT JOIN email_list el ON el.email = LOWER(u.email)
    WHERE tm.team_id = ${teamId}
    ORDER BY name
  `) as unknown as Array<{
    user_id: string
    name: string
    email: string
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

  const rosterOnly = (await db`
    SELECT
      tp.id AS team_player_id,
      TRIM(CONCAT(tp.first_name, ' ', tp.last_name_initial, '.')) AS name,
      latest.id AS submission_id, latest.token, latest.overall_score, latest.graded_at,
      r.sent_at, r.resent_at, r.unlocked
    FROM team_players tp
    LEFT JOIN LATERAL (
      SELECT s.id, s.token, a.overall_score, a.created_at AS graded_at
      FROM submissions s
      JOIN analyses a ON a.submission_id = s.id
      WHERE s.status = 'complete' AND s.team_player_id = tp.id
      ORDER BY a.created_at DESC
      LIMIT 1
    ) latest ON TRUE
    LEFT JOIN result_releases r ON r.submission_id = latest.id
    WHERE tp.team_id = ${teamId}
      -- A roster row that has since joined with an account shows once, as the member.
      AND NOT EXISTS (
        SELECT 1 FROM team_memberships tm
        WHERE tm.team_id = tp.team_id
          AND LOWER(tm.first_name) = LOWER(tp.first_name)
          AND UPPER(tm.last_name_initial) = UPPER(tp.last_name_initial)
      )
    ORDER BY name
  `) as unknown as Array<{
    team_player_id: string
    name: string
    submission_id: string | null
    token: string | null
    overall_score: string | null
    graded_at: Date | null
    sent_at: Date | null
    resent_at: Date | null
    unlocked: boolean | null
  }>

  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null)

  return [
    ...members.map((m) => ({
      key: `member:${m.user_id}`,
      userId: m.user_id,
      teamPlayerId: null,
      name: m.name,
      email: m.email,
      submissionId: m.submission_id,
      token: m.token,
      score: m.overall_score !== null ? Number(m.overall_score) : null,
      gradedAt: iso(m.graded_at),
      sentAt: iso(m.sent_at),
      resentAt: iso(m.resent_at),
      unlocked: !!m.unlocked,
      unsubscribed: !!m.unsubscribed_at || !!m.complained_at,
      bounced: !!m.bounced_at,
    })),
    ...rosterOnly.map((p) => ({
      key: `roster:${p.team_player_id}`,
      userId: null,
      teamPlayerId: p.team_player_id,
      name: p.name,
      email: null,
      submissionId: p.submission_id,
      token: p.token,
      score: p.overall_score !== null ? Number(p.overall_score) : null,
      gradedAt: iso(p.graded_at),
      sentAt: iso(p.sent_at),
      resentAt: iso(p.resent_at),
      unlocked: !!p.unlocked,
      unsubscribed: false,
      bounced: false,
    })),
  ]
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
}

/**
 * The subset of `submissionIds` that are complete and belong to `teamId`,
 * with the recipient resolved. Anything not returned was not this team's (or
 * not graded yet) and must not be sent.
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
      COALESCE(
        NULLIF(TRIM(CONCAT(tm.first_name, ' ', tm.last_name_initial)), ''),
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
      AND (s.team_id = ${teamId} OR tp.id IS NOT NULL OR tm.user_id IS NOT NULL)
  `) as unknown as Array<{
    submission_id: string
    token: string
    user_id: string | null
    overall_score: string | null
    email: string | null
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
