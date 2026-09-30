import { NextRequest, NextResponse } from 'next/server'
import { MembershipError, unassignSeat } from '@/lib/org-membership'
import { membershipErrorResponse, membershipOrgSession, readJson } from '@/lib/org-membership-route'

// Take a seat back; it keeps its term and returns to the org's pool.
export async function POST(req: NextRequest) {
  const auth = await membershipOrgSession(req)
  if ('response' in auth) return auth.response
  try {
    const { seatId } = await readJson(req)
    if (typeof seatId !== 'string') throw new MembershipError('seatId is required.', 400)
    const s = await unassignSeat(auth.session.orgId, seatId, { reason: 'unassigned' })
    return NextResponse.json({
      seat: {
        id: s.id, orderId: s.order_id, plan: s.plan, term: s.term, status: s.status,
        startsAt: new Date(s.starts_at).toISOString(), endsAt: new Date(s.ends_at).toISOString(), userId: null,
      },
    })
  } catch (err) {
    return membershipErrorResponse(err, 'unassign')
  }
}
