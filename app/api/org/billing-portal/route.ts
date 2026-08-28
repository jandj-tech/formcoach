import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { billingPortalUrl } from '@/lib/org-subscription'
import { resolveBaseUrl } from '@/lib/base-url'

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
