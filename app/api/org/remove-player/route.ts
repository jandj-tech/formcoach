import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { retireOrphanStubs } from '@/lib/roster-players'
import { releaseSeatIfLeftOrg } from '@/lib/org-membership'

// Lets an org admin remove a player from one of their organization's teams:
// an account member ({ teamId, userId }) or a name-only player who hasn't
// joined yet ({ teamId, pendingId }).
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { teamId?: string; userId?: string; pendingId?: string }
  if (!body.teamId || (!body.userId && !body.pendingId)) {
    return NextResponse.json({ error: 'Missing teamId and userId or pendingId' }, { status: 400 })
  }

  // Only remove the player if the team belongs to this organization.
  const rows = body.pendingId
    ? ((await db`
        DELETE FROM pending_team_members
        WHERE id = ${body.pendingId}
          AND team_id = ${body.teamId}
          AND team_id IN (SELECT id FROM teams WHERE organization_id = ${session.orgId})
        RETURNING id
      `) as unknown as Array<{ id: string }>)
    : ((await db`
        DELETE FROM team_memberships
        WHERE user_id = ${body.userId!}
          AND team_id = ${body.teamId}
          AND team_id IN (SELECT id FROM teams WHERE organization_id = ${session.orgId})
        RETURNING id
      `) as unknown as Array<{ id: string }>)

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'That player isn’t on this team any more. Refresh the page to see the current roster.' },
      { status: 404 },
    )
  }
  // A player on no team of this org any more gives back their membership
  // seat (before the stub cleanup below, which may delete the user row).
  if (body.userId) await releaseSeatIfLeftOrg(body.userId, session.orgId)
  // A roster stub now on no team must not keep a live setup link (audit item 4).
  if (body.userId) {
    try { await retireOrphanStubs([body.userId]) } catch (err) {
      console.error('[org/remove-player] stub cleanup failed:', err instanceof Error ? err.message : err)
    }
  }
  return NextResponse.json({ removed: true })
}
