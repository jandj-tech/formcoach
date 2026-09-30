import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest, provenCoachCreditsEmail } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'
import { teamLeaderboard } from '@/lib/team-shots'
import { teamResultsRoster } from '@/lib/org-results'

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
      SELECT id, name, access_code, leaderboard_visibility FROM teams WHERE id = ${teamId}
    `) as unknown as [{
      id: string; name: string; access_code: string | null; leaderboard_visibility: string | null
    } | undefined]
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
        // Only a session that proves its email sees (or can spend) that
        // email's personal tokens — see provenCoachCreditsEmail.
        const proven = await provenCoachCreditsEmail(teamSession, await getOrgSessionFromRequest(req))
        const [cc] = proven
          ? ((await db`
              SELECT COALESCE(credits, 0)::int AS credits
              FROM coach_credits WHERE LOWER(email) = ${proven}
            `) as unknown as [{ credits: number } | undefined])
          : [undefined]
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
    // the coach dashboard: only shots filed to THIS team (lib/team-shots.ts) —
    // never the player's personal or other-team history.
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
      LEFT JOIN submissions s ON s.user_id = u.id AND s.team_id = tm.team_id AND s.status = 'complete'
      LEFT JOIN analyses a ON a.submission_id = s.id
      WHERE tm.team_id = ${teamId}
      GROUP BY u.id, tm.first_name, tm.last_name_initial, u.analysis_tokens
      ORDER BY first_name ASC NULLS LAST
    `) as unknown as Array<{
      player_id: string; first_name: string; last_name_initial: string
      credits: number; shots: number; best_score: number | string | null
      avg_score: number | string | null; last_upload_at: string | Date | null
    }>

    // "Hasn't joined yet": players with no account, from the same roster the
    // website's Results tab and email composer use (lib/org-results.ts) —
    // name-only invites (pending_team_members) plus name-only rows
    // (team_players) with no invite, where an invite and the row its uploads
    // are filed on count as ONE player. A name-only row that has since joined
    // with an account (a same-name member, no unowned shot) is not listed; it
    // shows once, as the member above. This used to list every team_players
    // row, which showed members twice and never showed name-only invites.
    const unjoinedPlayers = (await teamResultsRoster(teamId)).filter((p) => p.kind !== 'member')
    const shotRowIds = [...new Set(unjoinedPlayers.map((p) => p.teamPlayerId).filter((id): id is string => !!id))]
    const shotStats = new Map<string, {
      shots: number; best_score: number | string | null
      avg_score: number | string | null; last_upload_at: string | Date | null
    }>()
    if (shotRowIds.length) {
      const rows = (await db`
        SELECT
          s.team_player_id::text AS team_player_id,
          COUNT(s.id)::int AS shots,
          MAX(a.overall_score) AS best_score,
          ROUND(AVG(a.overall_score)::numeric, 1) AS avg_score,
          MAX(s.created_at) AS last_upload_at
        FROM submissions s
        LEFT JOIN analyses a ON a.submission_id = s.id
        WHERE s.team_player_id = ANY(${shotRowIds}::uuid[])
          AND s.team_id = ${teamId}
          AND s.status = 'complete'
          -- Shots that carry an account's user id are that account's (counted
          -- with the member), not the name-only row's.
          AND s.user_id IS NULL
        GROUP BY s.team_player_id
      `) as unknown as Array<{
        team_player_id: string; shots: number; best_score: number | string | null
        avg_score: number | string | null; last_upload_at: string | Date | null
      }>
      for (const r of rows) shotStats.set(r.team_player_id, r)
    }
    const unjoined = unjoinedPlayers.map((p) => {
      const st = p.teamPlayerId ? shotStats.get(p.teamPlayerId) : undefined
      return {
        // The invite's id for an invite, else the name-only row's id.
        player_id: (p.pendingId ?? p.teamPlayerId)!,
        name: p.name,
        shots: st?.shots ?? 0,
        best_score: st?.best_score ?? null,
        avg_score: st?.avg_score ?? null,
        last_upload_at: st?.last_upload_at ?? null,
      }
    })

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
        name: p.name,
        credits: null,
        shots: p.shots,
        bestScore: p.best_score != null ? Number(p.best_score) : null,
        avgScore: p.avg_score != null ? Number(p.avg_score) : null,
        lastUploadAt: p.last_upload_at ? new Date(p.last_upload_at).toISOString() : null,
      })),
    ]

    // Leaderboard + most-improved across both player populations (same combined
    // shape as the coach dashboard), so the console is self-sufficient.
    const leaderboard = await teamLeaderboard(teamId)

    return NextResponse.json({
      // accessCode powers the app's "Invite players" share sheet: the link it
      // sends is learnhoops.com/join/<code>, the same front door the web
      // dashboard hands out. Without it the app would have to make the coach
      // read the code off the website and retype it.
      team: { id: team.id, name: team.name, accessCode: team.access_code, role: 'coach' },
      // Whether PLAYERS see the ranked board ('team') or only their own row
      // ('hidden'). Coaches always get the full leaderboard below.
      leaderboardVisibility: team.leaderboard_visibility === 'hidden' ? 'hidden' : 'team',
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
