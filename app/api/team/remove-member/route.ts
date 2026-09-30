import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { retireOrphanStubs } from '@/lib/roster-players'
import { releaseSeatIfLeftOrg } from '@/lib/org-membership'

// Lets a team admin remove (kick) a member from their team.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { userId?: string }
  if (!body.userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const rows = (await db`
    DELETE FROM team_memberships
    WHERE user_id = ${body.userId} AND team_id = ${session.teamId}
    RETURNING id
  `) as unknown as Array<{ id: string }>
  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'That player isn’t on this team any more. Refresh the page to see the current roster.' },
      { status: 404 },
    )
  }
  // A player on no team of this org any more gives back their membership
  // seat (before the stub cleanup below, which may delete the user row).
  const [team] = (await db`SELECT organization_id FROM teams WHERE id = ${session.teamId}`) as unknown as [
    { organization_id: string | null } | undefined,
  ]
  await releaseSeatIfLeftOrg(body.userId, team?.organization_id)
  // A roster stub now on no team must not keep a live setup link (audit item 4).
  try { await retireOrphanStubs([body.userId]) } catch (err) {
    console.error('[team/remove-member] stub cleanup failed:', err instanceof Error ? err.message : err)
  }
  return NextResponse.json({ removed: true })
}
