import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'

// Lets an org admin permanently delete one of their organization's teams.
// Cascades clear the roster (players, coaches, memberships, pending invites);
// submissions made under the team are kept but detached from it, so players
// keep their own shot history.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { teamId?: string }
  if (!body.teamId) {
    return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })
  }

  // Confirm the team belongs to this organization before touching anything.
  const [team] = (await db`
    SELECT id FROM teams WHERE id = ${body.teamId} AND organization_id = ${session.orgId}
  `) as unknown as [{ id: string } | undefined]
  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  // Detach submissions so the teams / team_players foreign keys don't block
  // the delete. Players keep their analyses — they're just no longer tied
  // to a team or a team-player record.
  await db`
    UPDATE submissions SET team_id = NULL, team_player_id = NULL
    WHERE team_id = ${body.teamId}
  `

  // Cascade clears team_players, team_coaches, team_memberships and
  // pending_team_members for this team.
  await db`
    DELETE FROM teams WHERE id = ${body.teamId} AND organization_id = ${session.orgId}
  `

  return NextResponse.json({ deleted: true })
}
