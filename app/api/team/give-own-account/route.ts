import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { teamIsEntitled, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { giveOwnAccount, coachDisplayName } from '@/lib/roster-players'

// Coach gives a name-only player who uses a sibling's family email their own
// account on that email (lib/roster-players giveOwnAccount). Only players on
// the coach's own team; the setup link is emailed to that inbox, never
// returned here.
export async function POST(req: NextRequest) {
  try {
    const session = await getTeamSessionFromRequest(req)
    if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 })

    if (!(await teamIsEntitled(session.teamId))) {
      return NextResponse.json({ error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true }, { status: 402 })
    }

    const { pendingId } = (await req.json().catch(() => ({}))) as { pendingId?: string }
    if (!pendingId || typeof pendingId !== 'string') {
      return NextResponse.json({ error: 'Pick a player.' }, { status: 400 })
    }

    const out = await giveOwnAccount({
      teamId: session.teamId,
      pendingId,
      addedBy: await coachDisplayName(session.teamId, session.adminEmail),
    })
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.httpStatus })
    return NextResponse.json(out)
  } catch (err) {
    console.error('give-own-account error:', err)
    return NextResponse.json({ error: 'Could not create the account. Please try again.' }, { status: 500 })
  }
}
