import { NextRequest, NextResponse } from 'next/server'
import { getMembershipOverview } from '@/lib/org-membership'
import { membershipErrorResponse, membershipOrgSession } from '@/lib/org-membership-route'

// The org dashboard's Memberships tab: seats, orders and every rostered
// player's coverage. Website only (see lib/org-membership-route.ts).
export async function GET(req: NextRequest) {
  const auth = await membershipOrgSession(req)
  if ('response' in auth) return auth.response
  try {
    return NextResponse.json(await getMembershipOverview(auth.session.orgId))
  } catch (err) {
    return membershipErrorResponse(err, 'overview')
  }
}
