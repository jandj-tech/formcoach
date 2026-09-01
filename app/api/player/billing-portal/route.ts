import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { resolveBaseUrl } from '@/lib/base-url'
import { playerBillingPortalUrl } from '@/lib/player-subscription'

const BASE_URL = resolveBaseUrl()

/**
 * Stripe Customer Portal for a player — cancellation, card updates, invoices.
 * Subscription lifecycle stays Stripe's job (org precedent:
 * /api/org/billing-portal); this app only mirrors state via webhooks.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 })
  }
  try {
    const url = await playerBillingPortalUrl(session.userId, `${BASE_URL}/dashboard`)
    if (!url) {
      return NextResponse.json(
        { error: 'No billing to manage on this account.', noBilling: true },
        { status: 409 },
      )
    }
    return NextResponse.json({ url })
  } catch (err) {
    console.error('[player/billing-portal] failed:', err)
    return NextResponse.json({ error: 'Could not open billing portal' }, { status: 500 })
  }
}
