import { NextRequest, NextResponse } from 'next/server'
import { assignSeat, MembershipError } from '@/lib/org-membership'
import { membershipErrorResponse, membershipOrgSession, readJson } from '@/lib/org-membership-route'

// Give an unassigned seat to a player on one of the org's teams.
export async function POST(req: NextRequest) {
  const auth = await membershipOrgSession(req)
  if ('response' in auth) return auth.response
  try {
    const { seatId, userId } = await readJson(req)
    if (typeof seatId !== 'string' || typeof userId !== 'string') {
      throw new MembershipError('seatId and userId are required.', 400)
    }
    const seat = await assignSeat(auth.session.orgId, seatId, userId)
    return NextResponse.json({ seat: publicSeat(seat) })
  } catch (err) {
    return membershipErrorResponse(err, 'assign')
  }
}

function publicSeat(s: Awaited<ReturnType<typeof assignSeat>>) {
  return {
    id: s.id, orderId: s.order_id, plan: s.plan, term: s.term, status: s.status,
    startsAt: new Date(s.starts_at).toISOString(), endsAt: new Date(s.ends_at).toISOString(), userId: s.user_id,
  }
}
