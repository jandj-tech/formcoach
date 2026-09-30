import { NextRequest, NextResponse } from 'next/server'
import { MembershipError, moveSeat } from '@/lib/org-membership'
import { membershipErrorResponse, membershipOrgSession, readJson } from '@/lib/org-membership-route'

// Switch a covered player to another of the org's memberships in one step:
// the old one goes back to the pool, and the player gets a single email.
export async function POST(req: NextRequest) {
  const auth = await membershipOrgSession(req)
  if ('response' in auth) return auth.response
  try {
    const { userId, seatId } = await readJson(req)
    if (typeof seatId !== 'string' || typeof userId !== 'string') {
      throw new MembershipError('seatId and userId are required.', 400)
    }
    const s = await moveSeat(auth.session.orgId, userId, seatId)
    return NextResponse.json({
      seat: {
        id: s.id, orderId: s.order_id, plan: s.plan, term: s.term, status: s.status,
        startsAt: new Date(s.starts_at).toISOString(), endsAt: new Date(s.ends_at).toISOString(), userId: s.user_id,
      },
    })
  } catch (err) {
    return membershipErrorResponse(err, 'move')
  }
}
