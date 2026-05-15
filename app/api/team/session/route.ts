import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const [team] = await db`
    SELECT id, name, admin_email, access_code, credits
    FROM teams WHERE id = ${session.teamId}
  ` as unknown as [{ id: string; name: string; admin_email: string; access_code: string; credits: number } | undefined]

  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  return NextResponse.json({
    teamId: team.id,
    name: team.name,
    adminEmail: team.admin_email,
    accessCode: team.access_code,
    credits: team.credits,
  })
}
