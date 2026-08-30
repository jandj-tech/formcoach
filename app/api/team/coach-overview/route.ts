import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'

// One batch call that renders the whole mobile Coach Console for a single team:
// the spendable pool, the roster with each account-player's token balance and
// shot aggregates, the coach-added ("not joined") players, and the leaderboard /
// most-improved lists. A standalone coach or org login has no player session, so
// /api/team/summary (player-authed) is unavailable to them — this is their
// self-sufficient equivalent, authenticated by the team/org Bearer token.
//
// Auth: a team session scopes to its own team; an org session must pass
// ?teamId= and the team must belong to that org.

function displayName(first: string, lastInitial: string): string {
  const f = (first || '').trim()
  const l = (lastInitial || '').trim()
  if (!l) return f
  return l.length === 1 ? `${f} ${l}.` : `${f} ${l}`
}

export async function GET(req: NextRequest) {
  const teamSession = await getTeamSessionFromRequest(req)
  const orgSession = teamSession ? null : await getOrgSessionFromRequest(req)
  if (!teamSession && !orgSession) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const teamIdParam = req.nextUrl.searchParams.get('teamId')

  try {
    // Resolve which team we're managing and confirm the caller may manage it.
    let teamId: string
    if (teamSession) {
      teamId = teamSession.teamId
    } else {
      if (!teamIdParam) {
        return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
      }
      const [owned] = (await db`
        SELECT id FROM teams WHERE id = ${teamIdParam} AND organization_id = ${orgSession!.orgId}
      `) as unknown as [{ id: string } | undefined]
      if (!owned) {
        return NextResponse.json({ error: 'Team not found for this organization' }, { status: 404 })
      }
      teamId = owned.id
    }

    const [team] = (await db`
      SELECT id, name, access_code FROM teams WHERE id = ${teamId}
    `) as unknown as [{ id: string; name: string; access_code: string | null } | undefined]
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    // Spendable pool. For a coach: personal coach_credits (default source) plus
    // the shared team credits. For an org: the org token balance. These are the
    // amounts the console can distribute to players.
    let coachCredits = 0
    let teamCredits = 0
    let orgBalance = 0
    try {
      const [tc] = (await db`
        SELECT COALESCE(credits, 0)::int AS credits FROM teams WHERE id = ${teamId}
      `) as unknown as [{ credits: number } | undefined]
      teamCredits = tc?.credits ?? 0
      if (teamSession) {
        const [cc] = (await db`
          SELECT COALESCE(credits, 0)::int AS credits
          FROM coach_credits WHERE LOWER(email) = ${teamSession.adminEmail.toLowerCase()}
        `) as unknown as [{ credits: number } | undefined]
        coachCredits = cc?.credits ?? 0
      } else {
        const [org] = (await db`
          SELECT COALESCE(token_balance, 0)::int AS token_balance FROM organizations WHERE id = ${orgSession!.orgId}
        `) as unknown as [{ token_balance: number } | undefined]
        orgBalance = org?.token_balance ?? 0
      }
    } catch {
      // Balance columns may be missing on old databases — report zero.
    }

    // Account players (team_memberships) — the only players who can RECEIVE
    // credits (they have a users row with analysis_tokens). Aggregates match
    // the coach dashboard: a member's shots are all their completed submissions.
    const members = (await db`
      SELECT
        u.id::text AS player_id,
        COALESCE(NULLIF(tm.first_name, ''), u.email) AS first_name,
        COALESCE(tm.last_name_initial, '') AS last_name_initial,
        COALESCE(u.analysis_tokens, 0)::int AS credits,
        COUNT(s.id)::int AS shots,
        MAX(a.overall_score) AS best_score,
        ROUND(AVG(a.overall_score)::numeric, 1) AS avg_score,
        MAX(s.created_at) AS last_upload_at
      FROM team_memberships tm
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN submissions s ON s.user_id = u.id AND s.status = 'complete'
      LEFT JOIN analyses a ON a.submission_id = s.id
      WHERE tm.team_id = ${teamId}
      GROUP BY u.id, tm.first_name, tm.last_name_initial, u.analysis_tokens
      ORDER BY first_name ASC NULLS LAST
    `) as unknown as Array<{
      player_id: string; first_name: string; last_name_initial: string
      credits: number; shots: number; best_score: number | string | null
      avg_score: number | string | null; last_upload_at: string | Date | null
    }>

    // Coach-added players (team_players) have no account, so they cannot hold
    // or receive credits — surfaced as "not joined" so the coach can still see
    // them and is nudged to invite them.
    const unjoined = (await db`
      SELECT
        tp.id::text AS player_id, tp.first_name, tp.last_name_initial,
        COUNT(s.id)::int AS shots,
        MAX(a.overall_score) AS best_score,
        ROUND(AVG(a.overall_score)::numeric, 1) AS avg_score,
        MAX(s.created_at) AS last_upload_at
      FROM team_players tp
      LEFT JOIN submissions s ON s.team_player_id = tp.id AND s.team_id = tp.team_id AND s.status = 'complete'
      LEFT JOIN analyses a ON a.submission_id = s.id
      WHERE tp.team_id = ${teamId}
      GROUP BY tp.id, tp.first_name, tp.last_name_initial
      ORDER BY tp.first_name ASC NULLS LAST
    `) as unknown as Array<{
      player_id: string; first_name: string; last_name_initial: string
      shots: number; best_score: number | string | null
      avg_score: number | string | null; last_upload_at: string | Date | null
    }>

    const roster = [
      ...members.map((m) => ({
        playerId: m.player_id,
        kind: 'member' as const,
        name: displayName(m.first_name, m.last_name_initial),
        credits: m.credits,
        shots: m.shots,
        bestScore: m.best_score != null ? Number(m.best_score) : null,
        avgScore: m.avg_score != null ? Number(m.avg_score) : null,
        lastUploadAt: m.last_upload_at ? new Date(m.last_upload_at).toISOString() : null,
      })),
      ...unjoined.map((p) => ({
        playerId: p.player_id,
        kind: 'unjoined' as const,
        name: displayName(p.first_name, p.last_name_initial),
        credits: null,
        shots: p.shots,
        bestScore: p.best_score != null ? Number(p.best_score) : null,
        avgScore: p.avg_score != null ? Number(p.avg_score) : null,
        lastUploadAt: p.last_upload_at ? new Date(p.last_upload_at).toISOString() : null,
      })),
    ]

    // Leaderboard + most-improved across both player populations (same combined
    // shape as the coach dashboard), so the console is self-sufficient.
    const leaderboard = (await db`
      WITH shots AS (
        SELECT u.id::text AS player_id,
               COALESCE(NULLIF(tm.first_name, ''), u.email) AS first_name,
               COALESCE(tm.last_name_initial, '') AS last_name_initial,
               a.overall_score, s.id AS sid
        FROM team_memberships tm
        JOIN users u ON u.id = tm.user_id
        JOIN submissions s ON s.user_id = u.id
        JOIN analyses a ON a.submission_id = s.id
        WHERE tm.team_id = ${teamId} AND s.status = 'complete'
        UNION ALL
        SELECT tp.id::text AS player_id, tp.first_name, tp.last_name_initial, a.overall_score, s.id AS sid
        FROM team_players tp
        JOIN submissions s ON s.team_player_id = tp.id AND s.team_id = tp.team_id
        JOIN analyses a ON a.submission_id = s.id
        WHERE tp.team_id = ${teamId} AND s.status = 'complete'
      )
      SELECT player_id AS id, first_name, last_name_initial,
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

    return NextResponse.json({
      // accessCode powers the app's "Invite players" share sheet: the link it
      // sends is learnhoops.com/join/<code>, the same front door the web
      // dashboard hands out. Without it the app would have to make the coach
      // read the code off the website and retype it.
      team: { id: team.id, name: team.name, accessCode: team.access_code, role: 'coach' },
      pool: {
        type: teamSession ? 'coach' : 'org',
        coachCredits,
        teamCredits,
        orgBalance,
      },
      roster,
      leaderboard: leaderboard.map((e) => ({
        playerId: e.id,
        name: displayName(e.first_name, e.last_name_initial),
        bestScore: Number(e.best_score),
        avgScore: e.avg_score != null ? Number(e.avg_score) : null,
        uploads: e.upload_count,
      })),
    })
  } catch (err) {
    console.error('[team/coach-overview] failed:', err)
    return NextResponse.json({ error: 'Could not load the team' }, { status: 500 })
  }
}
