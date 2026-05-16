import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { db } from '@/lib/db'

// Assign tokens from the team pool to selected players.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { playerUserIds, tokensEach } = await req.json()

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

    // Every recipient must actually be on this team.
    const members = (await db`
      SELECT user_id FROM team_memberships
      WHERE team_id = ${session.teamId} AND user_id = ANY(${ids})
    `) as unknown as Array<{ user_id: string }>
    if (members.length !== ids.length) {
      return NextResponse.json({ error: 'Some selected players are not on this team' }, { status: 400 })
    }

    const total = ids.length * each

    // Deduct from the pool and credit players atomically. The conditional
    // UPDATE matches no row if the pool is short, so nothing changes.
    const remaining = await db.begin(async (sql) => {
      const updated = (await sql`
        UPDATE teams SET token_pool = token_pool - ${total}
        WHERE id = ${session.teamId} AND COALESCE(token_pool, 0) >= ${total}
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
    console.error('Team assign-tokens error:', err)
    return NextResponse.json({ error: 'Could not assign tokens' }, { status: 500 })
  }
}
