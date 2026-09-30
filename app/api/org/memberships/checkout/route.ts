import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createMembershipCheckout, createMembershipOrder } from '@/lib/org-membership'
import { orgTierById } from '@/lib/team-features'
import { currencyForRequest } from '@/lib/region'
import {
  membershipErrorResponse,
  membershipOrgSession,
  ORG_NOT_ENTITLED_MESSAGE,
  readJson,
} from '@/lib/org-membership-route'

// Buy a block of prepaid seats. The order + pending seats are written first;
// Stripe metadata carries only { type, orderId }. Players picked here are
// kept on the order row and assigned when payment clears.
export async function POST(req: NextRequest) {
  const auth = await membershipOrgSession(req)
  if ('response' in auth) return auth.response
  const { orgId, adminEmail } = auth.session
  try {
    const body = await readJson(req)
    if ((await orgTierById(orgId)) === 'none') {
      return NextResponse.json({ error: ORG_NOT_ENTITLED_MESSAGE }, { status: 402 })
    }
    const { order } = await createMembershipOrder({
      orgId,
      createdBy: adminEmail ?? null,
      plan: body.plan,
      term: body.term,
      seats: body.seats,
      startDate: body.startDate,
      userIds: body.userIds,
      currency: currencyForRequest(req),
    })
    const [org] = (await db`SELECT admin_email FROM organizations WHERE id = ${orgId}`) as unknown as [
      { admin_email: string } | undefined,
    ]
    let url: string
    try {
      url = await createMembershipCheckout(order, org?.admin_email ?? adminEmail ?? null)
    } catch (err) {
      // No checkout, no order: drop the placeholder so it never reads as pending.
      await db`DELETE FROM org_membership_orders WHERE id = ${order.id} AND status = 'pending'`
      throw err
    }
    return NextResponse.json({ url, orderId: order.id })
  } catch (err) {
    return membershipErrorResponse(err, 'checkout')
  }
}
