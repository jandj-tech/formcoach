import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { db } from '@/lib/db'

// Coach-facing bulk grant: gives every joined player on the team
// `tokensEach` analysis tokens, paid out of teams.credits. One click,
// no per-player picking. Atomic — refuses if the team doesn't have
// enough credits to cover the whole roster.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { tokensEach } = await req.json()
    const each = typeof tokensEach === 'number' ? Math.floor(tokensEach) : 0
    if (each < 1) {
      return NextResponse.json({ error: 'Tokens each must be at least 1' }, { status: 400 })
    }

    const members = (await db`
      SELECT user_id FROM team_memberships WHERE team_id = ${session.teamId}
    `) as unknown as Array<{ user_id: string }>
    if (members.length === 0) {
      return NextResponse.json({ error: 'No players on this team yet' }, { status: 400 })
    }

    const total = members.length * each

    const result = await db.begin(async (sql) => {
      const drained = (await sql`
        UPDATE teams
        SET credits = credits - ${total}
        WHERE id = ${session.teamId} AND COALESCE(credits, 0) >= ${total}
        RETURNING credits
      `) as unknown as Array<{ credits: number }>
      if (drained.length === 0) return null
      for (const m of members) {
        await sql`
          UPDATE users
          SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${each}
          WHERE id = ${m.user_id}
        `
      }
      return { teamCredits: drained[0].credits, granted: total, playersGranted: members.length }
    })

    if (result === null) {
      return NextResponse.json(
        { error: `Need ${total} team credits but the team doesn't have enough.` },
        { status: 400 },
      )
    }

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[team/grant-all-tokens] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not grant tokens' }, { status: 500 })
  }
}
