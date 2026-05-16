import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'

// Assign tokens from a team's pool to selected players (org admin).
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { teamId, playerUserIds, tokensEach } = await req.json()
    if (!teamId || typeof teamId !== 'string') {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const ids = Array.isArray(playerUserIds)
      ? playerUserIds.filter((id: unknown): id is string => typeof id === 'string' && !!id)
      : []
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Select at least one player' }, { status: 400 })
    }

    const each = typeof tokensEach === 'number' ? Math.floor(tokensEach) : 1
    if (each < 1) {
      return NextResponse.json({ error: 'Invalid token amount' }, { status: 400 })
    }

    const [team] = (await db`
      SELECT id FROM teams WHERE id = ${teamId} AND organization_id = ${session.orgId}
    `) as unknown as [{ id: string } | undefined]
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    // Every recipient must actually be on this team.
    const members = (await db`
      SELECT user_id FROM team_memberships
      WHERE team_id = ${teamId} AND user_id = ANY(${ids})
    `) as unknown as Array<{ user_id: string }>
    if (members.length !== ids.length) {
      return NextResponse.json({ error: 'Some selected players are not on this team' }, { status: 400 })
    }

    const total = ids.length * each

    const remaining = await db.begin(async (sql) => {
      const updated = (await sql`
        UPDATE teams SET token_pool = token_pool - ${total}
        WHERE id = ${teamId} AND COALESCE(token_pool, 0) >= ${total}
        RETURNING token_pool
      `) as unknown as Array<{ token_pool: number }>
      if (updated.length === 0) return null
      for (const uid of ids) {
        await sql`UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${each} WHERE id = ${uid}`
      }
      return updated[0].token_pool
    })

    if (remaining === null) {
      return NextResponse.json({ error: 'Not enough tokens in the team pool' }, { status: 400 })
    }

    return NextResponse.json({ success: true, tokenPool: remaining })
  } catch (err) {
    console.error('Org assign-tokens error:', err)
    return NextResponse.json({ error: 'Could not assign tokens' }, { status: 500 })
  }
}
