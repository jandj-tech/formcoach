import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTeamSessionFromRequest } from '@/lib/team-auth'

// Lets a team admin remove (kick) a member from their team.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { userId?: string }
  if (!body.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  await db`
    DELETE FROM team_memberships
    WHERE user_id = ${body.userId} AND team_id = ${session.teamId}
  `
  return NextResponse.json({ removed: true })
}
