import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { resendPlayerSetup, coachDisplayName } from '@/lib/roster-players'

// Re-sends the account-setup email to a roster-pending player on the coach's
// own team. The link goes to the player's inbox only.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 })

  const { userId } = (await req.json().catch(() => ({}))) as { userId?: string }
  if (!userId) return NextResponse.json({ error: 'Player is required' }, { status: 400 })

  const [row] = (await db`
    SELECT 1 AS ok FROM team_memberships WHERE user_id = ${userId} AND team_id = ${session.teamId}
  `) as unknown as [{ ok: number } | undefined]
  if (!row) return NextResponse.json({ error: 'That player isn’t on this team.' }, { status: 404 })

  const out = await resendPlayerSetup(userId, {
    teamId: session.teamId,
    addedBy: await coachDisplayName(session.teamId, session.adminEmail),
  })
  if (out.ok) return NextResponse.json({ ok: true, emailedTo: out.email })
  if (out.reason === 'not_pending') {
    return NextResponse.json({ error: 'This player has already finished setting up their account.' }, { status: 409 })
  }
  if (out.reason === 'rate_limited') {
    return NextResponse.json({ error: 'We already sent this a few times in the last hour. Try again later.' }, { status: 429 })
  }
  return NextResponse.json({ error: 'Could not send the email. Try again shortly.' }, { status: 502 })
}
