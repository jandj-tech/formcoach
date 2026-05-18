import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { db } from '@/lib/db'

// A coach hands tokens from their own credit balance to selected players on
// their team.
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

    const coachEmail = session.adminEmail.toLowerCase()
    const total = ids.length * each

    // Deduct from the coach's credit balance and credit players atomically.
    const remaining = await db.begin(async (sql) => {
      const updated = (await sql`
        UPDATE coach_credits SET credits = credits - ${total}
        WHERE email = ${coachEmail} AND credits >= ${total}
        RETURNING credits
      `) as unknown as Array<{ credits: number }>
      if (updated.length === 0) return null
      for (const uid of ids) {
        await sql`UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${each} WHERE id = ${uid}`
      }
      return updated[0].credits
    })

    if (remaining === null) {
      return NextResponse.json({ error: 'Not enough credits in your balance' }, { status: 400 })
    }

    return NextResponse.json({ success: true, credits: remaining })
  } catch (err) {
    console.error('Team assign-credits error:', err)
    return NextResponse.json({ error: 'Could not assign credits' }, { status: 500 })
  }
}
