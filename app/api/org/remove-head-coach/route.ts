import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { changeHeadCoach, HeadCoachError } from '@/lib/change-head-coach'

// Legacy endpoint: removes a team's head coach by promoting the oldest coach
// who has finished setup. The dashboard now uses /api/org/change-head-coach
// (pick who takes over, or coach it yourself); this stays for any old client
// and goes through the same transaction, so it also clears the seat's invite
// and reset links. The removed coach's tokens stay with them here.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session?.orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { teamId?: unknown }
  if (typeof body.teamId !== 'string' || !body.teamId) {
    return NextResponse.json({ error: 'Missing teamId' }, { status: 400 })
  }

  try {
    const result = await changeHeadCoach(session.orgId, body.teamId, 'next', false)
    return NextResponse.json({ promoted: result.newHead.email })
  } catch (err) {
    if (err instanceof HeadCoachError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('remove-head-coach error:', err)
    return NextResponse.json({ error: 'Could not replace the head coach.' }, { status: 500 })
  }
}
