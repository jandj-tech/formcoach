import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { resolveBaseUrl } from '@/lib/base-url'
import { applyPlayerSubscriptionCheckout } from '@/lib/player-subscription'
import { recordPurchase } from '@/lib/record-purchase'
import { PLAYER_PLANS, isPlayerPlan } from '@/lib/player-plans'

const BASE_URL = resolveBaseUrl()

/**
 * Success URL for the player-plan checkout. The webhook normally lands first,
 * but this route applies the same idempotent update so a slow or missed
 * webhook never leaves someone who has just paid staring at a dashboard that
 * still says they have no plan.
 *
 * Guarded like /api/org/subscribe/complete: the session id in the URL is only
 * honored while young, for a real player-subscription session, and only once
 * money has actually settled.
 */
const MAX_SESSION_AGE_SECONDS = 3600

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id')
  if (!sessionId) return NextResponse.redirect(`${BASE_URL}/dashboard`)

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId)
    const ageSeconds = Date.now() / 1000 - (session.created ?? 0)

    if (
      session.mode !== 'subscription' ||
      session.metadata?.type !== 'player_subscription' ||
      ageSeconds > MAX_SESSION_AGE_SECONDS
    ) {
      return NextResponse.redirect(`${BASE_URL}/dashboard`)
    }

    // Delayed payment methods complete later; show a self-refreshing holding
    // screen instead of claiming a plan that hasn't been paid for.
    if (session.payment_status === 'unpaid') {
      return new NextResponse(
        `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="5">
<title>Finishing up…</title></head>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="text-align:center"><h1 style="font-size:1.25rem">Finishing your subscription…</h1>
<p style="color:#666">Waiting for your payment to settle. This page refreshes automatically.</p></div>
</body></html>`,
        { headers: { 'content-type': 'text/html' } },
      )
    }

    const applied = await applyPlayerSubscriptionCheckout(session)
    const plan = session.metadata?.playerPlan
    if (applied && isPlayerPlan(plan)) {
      // Idempotent by session id — the webhook's recordPurchase call and this
      // one collapse into a single order row.
      await recordPurchase(session, {
        kind: 'player_subscription',
        description: `${PLAYER_PLANS[plan].name} — ${session.metadata?.playerInterval === 'annual' ? 'Annual' : 'Monthly'}`,
        quantity: 1,
        buyerKind: 'user',
        buyerRef: session.metadata?.userId,
      })
    }
    console.log('[subscribe/complete]', { sessionId, applied })
    return NextResponse.redirect(`${BASE_URL}/dashboard?subscribed=1`)
  } catch (err) {
    console.error('[subscribe/complete] failed:', err)
    return NextResponse.redirect(`${BASE_URL}/dashboard`)
  }
}
