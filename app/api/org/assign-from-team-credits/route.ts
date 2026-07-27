import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'

// Org-facing endpoint: spends a team's credits (teams.credits) on specific
// players in that same team, turning team credits into per-player
// analysis_tokens. Mirrors the coach-facing /api/team/grant-all-tokens but
// lets the org act on any of their teams without opening the team dashboard.
// The team must belong to the org; the players must be on that team.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { teamId, playerUserIds, tokensEach } = await req.json()
    const tid = typeof teamId === 'string' ? teamId.trim() : ''
    const ids = Array.isArray(playerUserIds)
      ? playerUserIds.filter((x: unknown): x is string => typeof x === 'string')
      : []
    const each = typeof tokensEach === 'number' ? Math.floor(tokensEach) : 0

    if (!tid) return NextResponse.json({ error: 'Team is required' }, { status: 400 })
    if (ids.length === 0) return NextResponse.json({ error: 'Pick at least one player' }, { status: 400 })
    if (each < 1) return NextResponse.json({ error: 'Tokens each must be at least 1' }, { status: 400 })

    // Team must belong to this org.
    const teamRows = (await db`
      SELECT id FROM teams
      WHERE id = ${tid} AND organization_id = ${session.orgId}
      LIMIT 1
    `) as unknown as Array<{ id: string }>
    if (teamRows.length === 0) {
      return NextResponse.json({ error: 'That team is not in your organization' }, { status: 404 })
    }

    // All recipients must be members of this team. Drop unknowns silently —
    // never grant tokens to a user who isn't on the team.
    const memberRows = (await db`
      SELECT user_id FROM team_memberships
      WHERE team_id = ${tid} AND user_id = ANY(${ids})
    `) as unknown as Array<{ user_id: string }>
    const validIds = memberRows.map(m => m.user_id)
    if (validIds.length === 0) {
      return NextResponse.json({ error: 'None of the selected players are on this team' }, { status: 400 })
    }
    const actualTotal = validIds.length * each

    // Atomic: deduct credits from the team and grant tokens to the players.
    const result = await db.begin(async (sql) => {
      const drained = (await sql`
        UPDATE teams
        SET credits = credits - ${actualTotal}
        WHERE id = ${tid} AND COALESCE(credits, 0) >= ${actualTotal}
        RETURNING credits
      `) as unknown as Array<{ credits: number }>
      if (drained.length === 0) return null
      for (const uid of validIds) {
        await sql`
          UPDATE users
          SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${each}
          WHERE id = ${uid}
        `
      }
      return { teamCredits: drained[0].credits, granted: validIds.length * each }
    })

    if (result === null) {
      return NextResponse.json({ error: 'Not enough credits on this team' }, { status: 400 })
    }

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[org/assign-from-team-credits] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not assign credits' }, { status: 500 })
  }
}
