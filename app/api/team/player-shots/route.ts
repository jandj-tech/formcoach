import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'

// A coach (or org) viewing one player's shot history from the mobile Coach
// Console. Returns the player's completed shots with the results token so the
// app can open the existing public /results/[token] view for the detail.
//
// Auth: team session scopes to its own team; org session must pass a teamId the
// org owns. `playerId` is a users.id when kind=member, a team_players.id when
// kind=unjoined. Both are verified to belong to the resolved team.
export async function GET(req: NextRequest) {
  const teamSession = await getTeamSessionFromRequest(req)
  const orgSession = teamSession ? null : await getOrgSessionFromRequest(req)
  if (!teamSession && !orgSession) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const sp = req.nextUrl.searchParams
  const playerId = sp.get('playerId')
  const kind = sp.get('kind') === 'unjoined' ? 'unjoined' : 'member'
  const teamIdParam = sp.get('teamId')
  if (!playerId) return NextResponse.json({ error: 'playerId is required' }, { status: 400 })

  try {
    // Resolve + authorize the team.
    let teamId: string
    if (teamSession) {
      teamId = teamSession.teamId
    } else {
      if (!teamIdParam) return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
      const [owned] = (await db`
        SELECT id FROM teams WHERE id = ${teamIdParam} AND organization_id = ${orgSession!.orgId}
      `) as unknown as [{ id: string } | undefined]
      if (!owned) return NextResponse.json({ error: 'Team not found for this organization' }, { status: 404 })
      teamId = owned.id
    }

    type ShotRow = {
      token: string; created_at: string | Date
      overall_score: number | string | null; frame_urls: string[] | null
    }
    let rows: ShotRow[]
    if (kind === 'member') {
      const [member] = (await db`
        SELECT 1 FROM team_memberships WHERE team_id = ${teamId} AND user_id = ${playerId} LIMIT 1
      `) as unknown as [unknown | undefined]
      if (!member) return NextResponse.json({ error: 'Player not on this team' }, { status: 404 })
      rows = (await db`
        SELECT s.token, s.created_at, a.overall_score, a.frame_urls
        FROM submissions s
        JOIN analyses a ON a.submission_id = s.id
        WHERE s.user_id = ${playerId} AND s.status = 'complete'
        ORDER BY s.created_at DESC
        LIMIT 100
      `) as unknown as ShotRow[]
    } else {
      const [tp] = (await db`
        SELECT 1 FROM team_players WHERE id = ${playerId} AND team_id = ${teamId} LIMIT 1
      `) as unknown as [unknown | undefined]
      if (!tp) return NextResponse.json({ error: 'Player not on this team' }, { status: 404 })
      rows = (await db`
        SELECT s.token, s.created_at, a.overall_score, a.frame_urls
        FROM submissions s
        JOIN analyses a ON a.submission_id = s.id
        WHERE s.team_player_id = ${playerId} AND s.team_id = ${teamId} AND s.status = 'complete'
        ORDER BY s.created_at DESC
        LIMIT 100
      `) as unknown as ShotRow[]
    }

    return NextResponse.json({
      shots: rows.map((r) => ({
        token: r.token,
        createdAt: new Date(r.created_at).toISOString(),
        overallScore: r.overall_score != null ? Number(r.overall_score) : null,
        thumbnail: Array.isArray(r.frame_urls) && r.frame_urls.length > 0 ? r.frame_urls[0] : null,
      })),
    })
  } catch (err) {
    console.error('[team/player-shots] failed:', err)
    return NextResponse.json({ error: 'Could not load shots' }, { status: 500 })
  }
}
