import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { rosterStubIds, retireOrphanStubs } from '@/lib/roster-players'
import { releaseSeatIfLeftOrg } from '@/lib/org-membership'

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

  // Roster stubs (added by email, setup never finished) on this team — the
  // cascade below removes their memberships, and any left on no team must not
  // keep a live setup link (security audit item 4).
  const stubIds = await rosterStubIds(body.teamId)
  // Everyone on the roster, so a player left on no other team of this org
  // gives back their membership seat after the cascade (same rule as
  // remove-player; the release also resumes a personal plan the seat paused).
  const memberIds = ((await db`
    SELECT DISTINCT user_id::text AS user_id FROM team_memberships WHERE team_id = ${body.teamId}
  `) as unknown as Array<{ user_id: string }>).map((r) => r.user_id)

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

  // Before the stub cleanup below, which may delete the user rows.
  let seatsReleased = 0
  for (const userId of memberIds) seatsReleased += await releaseSeatIfLeftOrg(userId, session.orgId)

  let retired = { deleted: 0, revoked: 0 }
  try {
    retired = await retireOrphanStubs(stubIds)
  } catch (err) {
    console.error('[delete-team] stub cleanup failed:', err instanceof Error ? err.message : err)
  }

  return NextResponse.json({ deleted: true, seatsReleased, stubsRemoved: retired.deleted, setupLinksRevoked: retired.revoked })
}
