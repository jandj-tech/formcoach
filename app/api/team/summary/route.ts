import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'

function displayName(first: string, lastInitial: string): string {
  const f = (first || '').trim()
  const l = (lastInitial || '').trim()
  if (!l) return f
  return l.length === 1 ? `${f} ${l}.` : `${f} ${l}`
}

// The iOS app's Team tab: the player's teams with roster, leaderboard, and
// most-improved list. The app keeps the leaderboard behind a tap.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 })

  try {
    const memberTeams = (await db`
      SELECT t.id, t.name, t.admin_email
      FROM team_memberships tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = ${session.userId}
      ORDER BY tm.joined_at DESC
    `) as unknown as Array<{ id: string; name: string; admin_email: string }>

    // Teams this account owns (founding coach) or coaches — matched by the
    // account email, so owners see their teams in the app's Team tab too.
    let coachTeams: Array<{ id: string; name: string; admin_email: string }> = []
    try {
      coachTeams = (await db`
        SELECT DISTINCT t.id, t.name, t.admin_email
        FROM teams t
        LEFT JOIN team_coaches tc ON tc.team_id = t.id
        WHERE t.admin_email = ${session.email} OR tc.email = ${session.email}
        ORDER BY t.name ASC
      `) as unknown as typeof coachTeams
    } catch {
      // team_coaches table may not exist on older DBs — owners still match.
      coachTeams = (await db`
        SELECT id, name, admin_email FROM teams WHERE admin_email = ${session.email}
      `) as unknown as typeof coachTeams
    }

    const memberIds = new Set(memberTeams.map(t => t.id))
    const teams = [
      ...memberTeams.map(t => ({ ...t, role: 'player' as const })),
      ...coachTeams.filter(t => !memberIds.has(t.id)).map(t => ({ ...t, role: 'coach' as const })),
    ]

    const result = []
    for (const team of teams) {
      try {
      // Same combined member+coach-uploaded-player shots as the coach dashboard.
      const leaderboard = (await db`
        WITH shots AS (
          SELECT
            u.id::text AS player_id,
            COALESCE(NULLIF(tm.first_name, ''), u.email) AS first_name,
            COALESCE(tm.last_name_initial, '') AS last_name_initial,
            a.overall_score, s.id AS sid
          FROM team_memberships tm
          JOIN users u ON u.id = tm.user_id
          JOIN submissions s ON s.user_id = u.id
          JOIN analyses a ON a.submission_id = s.id
          WHERE tm.team_id = ${team.id} AND s.status = 'complete'
          UNION ALL
          SELECT
            tp.id::text AS player_id, tp.first_name, tp.last_name_initial,
            a.overall_score, s.id AS sid
          FROM team_players tp
          JOIN submissions s ON s.team_player_id = tp.id AND s.team_id = tp.team_id
          JOIN analyses a ON a.submission_id = s.id
          WHERE tp.team_id = ${team.id} AND s.status = 'complete'
        )
        SELECT
          player_id AS id, first_name, last_name_initial,
          MAX(overall_score) AS best_score,
          ROUND(AVG(overall_score)::numeric, 1) AS avg_score,
          COUNT(sid)::int AS upload_count
        FROM shots
        GROUP BY player_id, first_name, last_name_initial
        ORDER BY best_score DESC
      `) as unknown as Array<{
        id: string; first_name: string; last_name_initial: string
        best_score: number | string; avg_score: number | string | null; upload_count: number
      }>

      const improved = (await db`
        WITH shots AS (
          SELECT
            u.id::text AS player_id,
            COALESCE(NULLIF(tm.first_name, ''), u.email) AS first_name,
            COALESCE(tm.last_name_initial, '') AS last_name_initial,
            a.overall_score, s.id AS sid, s.created_at
          FROM team_memberships tm
          JOIN users u ON u.id = tm.user_id
          JOIN submissions s ON s.user_id = u.id
          JOIN analyses a ON a.submission_id = s.id
          WHERE tm.team_id = ${team.id} AND s.status = 'complete'
          UNION ALL
          SELECT
            tp.id::text AS player_id, tp.first_name, tp.last_name_initial,
            a.overall_score, s.id AS sid, s.created_at
          FROM team_players tp
          JOIN submissions s ON s.team_player_id = tp.id AND s.team_id = tp.team_id
          JOIN analyses a ON a.submission_id = s.id
          WHERE tp.team_id = ${team.id} AND s.status = 'complete'
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
      `) as unknown as Array<{
        player_id: string; first_name: string; last_name_initial: string
        first_score: number | string; latest_score: number | string
      }>

      // Schedule glance: next upcoming event + how many events still need
      // this caller's RSVP. Wrapped separately — the schedule tables may not
      // exist yet on older databases.
      let nextEvent: {
        id: string; type: string; startsAt: string; timeTbd: boolean
        location: string; status: string
      } | null = null
      let pendingRsvpCount = 0
      try {
        const [ev] = (await db`
          SELECT id, type, starts_at, time_tbd, location, status
          FROM team_events
          WHERE team_id = ${team.id}
            AND status = 'active'
            AND starts_at >= NOW() - interval '3 hours'
          ORDER BY starts_at ASC
          LIMIT 1
        `) as unknown as [{
          id: string; type: string; starts_at: string | Date; time_tbd: boolean
          location: string; status: string
        } | undefined]
        if (ev) {
          nextEvent = {
            id: ev.id,
            type: ev.type,
            startsAt: new Date(ev.starts_at).toISOString(),
            timeTbd: ev.time_tbd,
            location: ev.location,
            status: ev.status,
          }
        }
        if (team.role === 'player') {
          const [pending] = (await db`
            SELECT COUNT(*)::int AS n
            FROM team_events e
            WHERE e.team_id = ${team.id}
              AND e.status = 'active'
              AND e.starts_at >= NOW()
              AND NOT EXISTS (
                SELECT 1 FROM team_event_rsvps r
                WHERE r.event_id = e.id AND r.user_id = ${session.userId}
              )
          `) as unknown as [{ n: number }]
          pendingRsvpCount = Number(pending?.n ?? 0)
        }
      } catch {}

      // Roster: names only — the app shows the roster without any scores.
      const roster = (await db`
        SELECT COALESCE(NULLIF(tm.first_name, ''), u.email) AS first_name,
               COALESCE(tm.last_name_initial, '') AS last_name_initial
        FROM team_memberships tm
        JOIN users u ON u.id = tm.user_id
        WHERE tm.team_id = ${team.id}
        ORDER BY tm.first_name ASC NULLS LAST
      `) as unknown as Array<{ first_name: string; last_name_initial: string }>

      result.push({
        id: team.id,
        name: team.name,
        role: team.role,
        nextEvent,
        pendingRsvpCount,
        memberCount: roster.length,
        roster: roster.map(r => displayName(r.first_name, r.last_name_initial)),
        leaderboard: leaderboard.map(e => ({
          name: displayName(e.first_name, e.last_name_initial),
          bestScore: Number(e.best_score),
          avgScore: e.avg_score != null ? Number(e.avg_score) : null,
          uploads: e.upload_count,
        })),
        mostImproved: improved
          .map(e => ({
            name: displayName(e.first_name, e.last_name_initial),
            firstScore: Number(e.first_score),
            latestScore: Number(e.latest_score),
          }))
          .filter(e => e.latestScore > e.firstScore)
          .slice(0, 5),
      })
      } catch (err) {
        // One team's data problem must not blank the whole tab — degrade to
        // an empty card so the user still sees their team.
        console.error('[team/summary] team block failed:', team.id, err)
        result.push({
          id: team.id, name: team.name, role: team.role,
          nextEvent: null, pendingRsvpCount: 0,
          memberCount: 0, roster: [], leaderboard: [], mostImproved: [],
        })
      }
    }

    return NextResponse.json({ teams: result })
  } catch (err) {
    console.error('[team/summary] query failed:', err)
    return NextResponse.json({ error: 'Could not load your team' }, { status: 500 })
  }
}
