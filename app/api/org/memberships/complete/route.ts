import { NextRequest, NextResponse } from 'next/server'
import { completeMembershipOrder, MembershipError } from '@/lib/org-membership'
import { membershipStripe } from '@/lib/org-membership-stripe'
import { membershipErrorResponse, membershipOrgSession, readJson } from '@/lib/org-membership-route'

// The success page's safety net: the buyer lands back with ?membership_session=
// and this fulfils the order if the webhook hasn't yet. Idempotent with the
// webhook (claimStripeSession + pending→paid), so both running is harmless.
export async function POST(req: NextRequest) {
  const auth = await membershipOrgSession(req)
  if ('response' in auth) return auth.response
  try {
    const { sessionId } = await readJson(req)
    if (typeof sessionId !== 'string' || !/^cs_[A-Za-z0-9_-]{3,200}$/.test(sessionId)) {
      throw new MembershipError('Missing checkout session.', 400)
    }
    let session
    try {
      session = await membershipStripe().retrieveCheckout(sessionId)
    } catch {
      throw new MembershipError('Checkout session not found.', 404)
    }
    if (session.metadata?.type !== 'org_membership_purchase') {
      throw new MembershipError('Checkout session not found.', 404)
    }
    const result = await completeMembershipOrder(session)
    if (!result.order || result.order.org_id !== auth.session.orgId) {
      throw new MembershipError('Checkout session not found.', 404)
    }
    if (result.reason === 'unpaid') {
      return NextResponse.json({ error: 'Payment has not cleared yet.' }, { status: 409 })
    }
    const o = result.order
    return NextResponse.json({
      applied: result.applied,
      order: {
        id: o.id, plan: o.plan, term: o.term, seats: o.seats, totalCents: o.total_cents, currency: o.currency,
        status: o.status, startsAt: new Date(o.starts_at).toISOString(), endsAt: new Date(o.ends_at).toISOString(),
        createdAt: new Date(o.created_at).toISOString(),
      },
    })
  } catch (err) {
    return membershipErrorResponse(err, 'complete')
  }
}
