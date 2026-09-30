import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTeamSessionFromRequest } from '@/lib/team-auth'

// Lets a team admin cancel a pending player they added by name, before that
// player has created an account and joined the team.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { playerId?: string }
  if (!body.playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })

  const rows = (await db`
    DELETE FROM pending_team_members
    WHERE id = ${body.playerId} AND team_id = ${session.teamId}
    RETURNING id
  `) as unknown as Array<{ id: string }>
  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'That player isn’t waiting to join any more — they may have joined already. Refresh the page to see the current roster.' },
      { status: 404 },
    )
  }
  return NextResponse.json({ removed: true })
}
