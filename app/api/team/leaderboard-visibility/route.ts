import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { isLeaderboardVisibility } from '@/lib/team-shots'

// The coach's "Players can see the team leaderboard" switch.
//   POST { teamId, visibility: 'team' | 'hidden' } → { teamId, visibility }
//
// Allowed: a coach session (head or assistant — both re-checked on every
// request by getTeamSessionFromRequest) whose team IS teamId, or an org
// session whose organization owns the team. A player login can never change
// it. Hiding is a privacy choice, so it is NOT plan-gated.
//
// Errors: 401 no coach/org login · 400 bad body · 403 a coach login for a
// different team · 404 the team isn't this org's (or doesn't exist).
// Player-facing readers enforce the setting via playerTeamBoard
// (lib/team-shots.ts); coach and org views always show the full board.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const teamSession = await getTeamSessionFromRequest(req)
  const orgSession = await getOrgSessionFromRequest(req)
  if (!teamSession && !orgSession) {
    return NextResponse.json({ error: 'Coach or organization login required' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as { teamId?: unknown; visibility?: unknown } | null
  const teamId = typeof body?.teamId === 'string' ? body.teamId.trim() : ''
  const visibility = body?.visibility
  if (!teamId || !UUID_RE.test(teamId)) {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
  }
  if (!isLeaderboardVisibility(visibility)) {
    return NextResponse.json({ error: "visibility must be 'team' or 'hidden'" }, { status: 400 })
  }

  try {
    let allowed = !!teamSession && teamSession.teamId === teamId
    if (!allowed && orgSession) {
      const [owned] = (await db`
        SELECT 1 AS ok FROM teams WHERE id = ${teamId} AND organization_id = ${orgSession.orgId}
      `) as unknown as [{ ok: number } | undefined]
      allowed = !!owned
    }
    if (!allowed) {
      // An org login only learns "not one of yours"; a coach login is told
      // it is signed in to a different team.
      return orgSession
        ? NextResponse.json({ error: 'Team not found for this organization' }, { status: 404 })
        : NextResponse.json({ error: 'You can only change your own team' }, { status: 403 })
    }

    const [row] = (await db`
      UPDATE teams SET leaderboard_visibility = ${visibility}
      WHERE id = ${teamId}
      RETURNING id, leaderboard_visibility
    `) as unknown as [{ id: string; leaderboard_visibility: string } | undefined]
    if (!row) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    return NextResponse.json({ teamId: row.id, visibility: row.leaderboard_visibility })
  } catch (err) {
    console.error('[team/leaderboard-visibility] failed:', err)
    return NextResponse.json({ error: 'Could not save the setting' }, { status: 500 })
  }
}
