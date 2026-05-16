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

  await db`
    DELETE FROM pending_team_members
    WHERE id = ${body.playerId} AND team_id = ${session.teamId}
  `
  return NextResponse.json({ removed: true })
}
