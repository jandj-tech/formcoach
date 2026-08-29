import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { applyOrgReactivation } from '@/lib/org-subscription'

/**
 * Where Stripe sends an organization after it restarts its plan.
 *
 * The safety net for a slow or missed webhook. Without it, someone who has
 * just paid can land back on a dashboard still telling them their plan has
 * ended — which is exactly the moment to not look broken.
 *
 * Unlike the signup equivalent, this mints no session: the org already exists
 * and is already logged in, which also makes the check simpler — the caller
 * must hold a session for the very org the checkout named. A stolen success
 * URL is worth nothing to anyone who cannot already log in as that org.
 */
export async function GET(req: NextRequest) {
  const baseUrl = req.nextUrl.origin
  const sessionId = req.nextUrl.searchParams.get('session_id')
  const dashboard = `${baseUrl}/org/dashboard?reactivated=1`

  if (!sessionId) return NextResponse.redirect(`${baseUrl}/org/dashboard`)

  const orgSession = await getOrgSessionFromRequest(req)
  if (!orgSession) {
    return NextResponse.redirect(`${baseUrl}/org/login`)
  }

  try {
    const checkout = await getStripe().checkout.sessions.retrieve(sessionId)

    const paid =
      checkout.payment_status === 'paid' || checkout.payment_status === 'no_payment_required'
    const isOurs =
      checkout.mode === 'subscription' &&
      checkout.metadata?.type === 'org_reactivate' &&
      checkout.metadata?.orgId === orgSession.orgId

    if (!isOurs || !paid) {
      console.warn('[org/reactivate/complete] rejected session', {
        sessionId,
        mode: checkout.mode,
        paymentStatus: checkout.payment_status,
        orgMatches: checkout.metadata?.orgId === orgSession.orgId,
      })
      return NextResponse.redirect(`${baseUrl}/org/dashboard`)
    }

    // Same call the webhook makes. Whichever lands first wins; the other is a
    // no-op rewriting identical values.
    await applyOrgReactivation(checkout)
    return NextResponse.redirect(dashboard)
  } catch (err) {
    // The payment succeeded even if this lookup did not — send them to the
    // dashboard, where the webhook will have caught up by the time they act.
    console.error('[org/reactivate/complete] failed:', err)
    return NextResponse.redirect(dashboard)
  }
}
