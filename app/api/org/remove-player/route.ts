import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'

// Lets an org admin remove a player from one of their organization's teams.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { teamId?: string; userId?: string }
  if (!body.teamId || !body.userId) {
    return NextResponse.json({ error: 'Missing teamId or userId' }, { status: 400 })
  }

  // Only remove the player if the team belongs to this organization.
  await db`
    DELETE FROM team_memberships
    WHERE user_id = ${body.userId}
      AND team_id = ${body.teamId}
      AND team_id IN (SELECT id FROM teams WHERE organization_id = ${session.orgId})
  `

  return NextResponse.json({ removed: true })
}
