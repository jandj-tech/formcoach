import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'

// Removes a team's head coach by promoting the next signed-up coach into the
// head-coach slot (teams.admin_email / password_hash). A team must always
// keep at least one coach with a login, so this is blocked if there's no
// other activated coach to promote.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { teamId?: string }
  if (!body.teamId) return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })

  // Verify the team belongs to this organization.
  const [team] = (await db`
    SELECT id FROM teams WHERE id = ${body.teamId} AND organization_id = ${session.orgId}
  `) as unknown as [{ id: string } | undefined]
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  // Find a signed-up coach (has a password) to promote to head coach.
  const [next] = (await db`
    SELECT id, email, password_hash FROM team_coaches
    WHERE team_id = ${body.teamId} AND password_hash IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1
  `) as unknown as [{ id: string; email: string; password_hash: string } | undefined]

  if (!next) {
    return NextResponse.json(
      { error: 'A team must keep at least one coach with an account. Add and activate another coach first.' },
      { status: 409 },
    )
  }

  try {
    await db`
      UPDATE teams SET admin_email = ${next.email}, password_hash = ${next.password_hash}
      WHERE id = ${body.teamId}
    `
    await db`DELETE FROM team_coaches WHERE id = ${next.id}`
  } catch (err) {
    console.error('remove-head-coach error:', err)
    return NextResponse.json({ error: 'Could not replace the head coach.' }, { status: 500 })
  }

  return NextResponse.json({ promoted: next.email })
}
