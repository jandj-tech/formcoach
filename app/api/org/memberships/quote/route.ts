import { NextRequest, NextResponse } from 'next/server'
import { liveSeatCount, MembershipError } from '@/lib/org-membership'
import { isMembershipPlan, isMembershipTerm, membershipQuote } from '@/lib/org-membership-pricing'
import { orgTierById } from '@/lib/team-features'
import { currencyForRequest } from '@/lib/region'
import {
  membershipErrorResponse,
  membershipOrgSession,
  ORG_NOT_ENTITLED_MESSAGE,
  readJson,
} from '@/lib/org-membership-route'

// Price an order before checkout. Tier = the org's live seats + these seats.
export async function POST(req: NextRequest) {
  const auth = await membershipOrgSession(req)
  if ('response' in auth) return auth.response
  try {
    const { plan, term, seats } = await readJson(req)
    if (!isMembershipPlan(plan)) throw new MembershipError('Choose Player or Pro.', 400)
    if (!isMembershipTerm(term)) throw new MembershipError('Choose a term.', 400)
    if ((await orgTierById(auth.session.orgId)) === 'none') {
      return NextResponse.json({ error: ORG_NOT_ENTITLED_MESSAGE }, { status: 402 })
    }
    const live = await liveSeatCount(auth.session.orgId)
    let quote
    try {
      quote = membershipQuote(plan, term, typeof seats === 'number' ? seats : NaN, live)
    } catch (err) {
      throw new MembershipError(err instanceof Error ? err.message : 'Invalid order', 400)
    }
    return NextResponse.json({ ...quote, liveSeats: live, currency: currencyForRequest(req) })
  } catch (err) {
    return membershipErrorResponse(err, 'quote')
  }
}
