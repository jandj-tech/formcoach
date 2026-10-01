import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { resendPlayerSetup } from '@/lib/roster-players'

// Re-sends the "finish setting up your account" email to a roster-pending
// player on one of the org's teams. Only works while the player hasn't set a
// password. The link goes to the player's inbox only.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId, teamId } = (await req.json().catch(() => ({}))) as { userId?: string; teamId?: string }
  if (!userId) return NextResponse.json({ error: 'Player is required' }, { status: 400 })

  // The player must be on a team this org owns (the given one, if any).
  const [row] = (await db`
    SELECT tm.team_id
    FROM team_memberships tm
    JOIN teams t ON t.id = tm.team_id
    WHERE tm.user_id = ${userId}
      AND t.organization_id = ${session.orgId}
      AND (${teamId ?? null}::uuid IS NULL OR tm.team_id = ${teamId ?? null}::uuid)
    LIMIT 1
  `) as unknown as [{ team_id: string } | undefined]
  if (!row) return NextResponse.json({ error: 'That player isn’t on one of your teams.' }, { status: 404 })

  const out = await resendPlayerSetup(userId, { teamId: row.team_id })
  if (out.ok) return NextResponse.json({ ok: true, emailedTo: out.email })
  if (out.reason === 'not_pending') {
    return NextResponse.json({ error: 'This player has already finished setting up their account.' }, { status: 409 })
  }
  if (out.reason === 'rate_limited' && out.daily) {
    return NextResponse.json({ error: 'We’ve already emailed this player’s setup link the most times allowed today. Try again tomorrow.' }, { status: 429 })
  }
  if (out.reason === 'rate_limited') {
    return NextResponse.json({ error: 'We already sent this a few times in the last hour. Try again later.' }, { status: 429 })
  }
  return NextResponse.json({ error: 'Could not send the email. Try again shortly.' }, { status: 502 })
}
