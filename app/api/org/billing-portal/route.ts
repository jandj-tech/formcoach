import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { billingPortalUrl } from '@/lib/org-subscription'
import { resolveBaseUrl } from '@/lib/base-url'
import { rejectInAppPurchase } from '@/lib/in-app'

const BASE_URL = resolveBaseUrl()

/**
 * Open the Stripe billing portal so an organization can change its card,
 * switch plan, or cancel without going through support.
 *
 * A grandfathered ('legacy') or comped organization has no Stripe customer and
 * nothing to manage. That is a normal state, not a failure — it answers 409
 * with `noBilling` so the dashboard can hide the button rather than show an
 * error to someone who was told they would never be billed.
 */
export async function POST(req: NextRequest) {
  // The Stripe portal can change plans, so it is a purchase surface: website
  // only, never the iOS app (App Store 3.1.1) — same guard as the buy routes.
  const inAppBlock = rejectInAppPurchase(req)
  if (inAppBlock) return inAppBlock
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const url = await billingPortalUrl(session.orgId, `${BASE_URL}/org/dashboard`)
    if (!url) {
      return NextResponse.json(
        { error: 'This organization has no billing to manage.', noBilling: true },
        { status: 409 },
      )
    }
    return NextResponse.json({ url })
  } catch (err) {
    console.error('[org/billing-portal] failed:', err)
    return NextResponse.json({ error: 'Could not open billing' }, { status: 500 })
  }
}
