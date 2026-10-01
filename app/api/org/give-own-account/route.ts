import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { orgIsEntitledById, SUBSCRIPTION_ENDED_MESSAGE } from '@/lib/team-features'
import { giveOwnAccount } from '@/lib/roster-players'

// Org gives a name-only player their own account, keeping their shots
// (lib/roster-players giveOwnAccount): on the sibling's family email saved for
// them, or — "Add email" — on the email typed in. Only teams the org owns;
// the setup link is emailed to that inbox, never returned here.
export async function POST(req: NextRequest) {
  try {
    const session = await getOrgSessionFromRequest(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await orgIsEntitledById(session.orgId))) {
      return NextResponse.json({ error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true }, { status: 402 })
    }

    const { teamId, pendingId, email } = (await req.json().catch(() => ({}))) as { teamId?: string; pendingId?: string; email?: unknown }
    if (!teamId || typeof teamId !== 'string' || !pendingId || typeof pendingId !== 'string') {
      return NextResponse.json({ error: 'Pick a player.' }, { status: 400 })
    }

    const [team] = (await db`
      SELECT t.id, o.name AS org_name
      FROM teams t JOIN organizations o ON o.id = t.organization_id
      WHERE t.id::text = ${teamId} AND t.organization_id = ${session.orgId}
    `) as unknown as [{ id: string; org_name: string } | undefined]
    if (!team) return NextResponse.json({ error: 'That team isn’t in your organization.' }, { status: 403 })

    const out = await giveOwnAccount({
      teamId: team.id,
      pendingId,
      addedBy: team.org_name,
      email: typeof email === 'string' ? email : null,
    })
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.httpStatus })
    return NextResponse.json(out)
  } catch (err) {
    console.error('org give-own-account error:', err)
    return NextResponse.json({ error: 'Could not create the account. Please try again.' }, { status: 500 })
  }
}
