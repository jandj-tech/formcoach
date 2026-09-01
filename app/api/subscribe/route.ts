import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/auth'
import { rejectInAppPurchase } from '@/lib/in-app'
import { currencyForRequest } from '@/lib/region'
import { resolveBaseUrl } from '@/lib/base-url'
import { getPlayerSubscription, subscriptionEntitled } from '@/lib/player-subscription'
import {
  isPlayerBillingInterval,
  isPlayerPlan,
  planAllowanceLabel,
  PLAYER_PLANS,
  playerPlanTotalCents,
} from '@/lib/player-plans'

const BASE_URL = resolveBaseUrl()

/**
 * Create the Stripe subscription checkout for a player plan (Player / Pro).
 *
 * Mirrors /api/org/subscribe: inline price_data (no catalog Price ids — the
 * same numeric amount bills as USD or CAD per request), metadata stamped on
 * BOTH the session and the subscription, and the user row is updated only
 * after payment clears (webhook or the /complete success route, whichever
 * lands first).
 */
export async function POST(req: NextRequest) {
  // Digital goods cannot be sold via Stripe inside the iOS app (guideline 3.1.1).
  const inAppBlock = rejectInAppPurchase(req)
  if (inAppBlock) return inAppBlock

  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Login required' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const plan = body?.plan
    const interval = body?.interval
    if (!isPlayerPlan(plan) || !isPlayerBillingInterval(interval)) {
      return NextResponse.json({ error: 'Pick a plan' }, { status: 400 })
    }

    // An entitled subscriber changes plans in place (proration, no second
    // subscription) — a second checkout would double-bill them.
    const existing = await getPlayerSubscription(session.userId)
    if (subscriptionEntitled(existing)) {
      return NextResponse.json(
        { error: 'You already have a plan — change it from your dashboard.', alreadySubscribed: true },
        { status: 409 },
      )
    }

    const [user] = (await db`
      SELECT email, stripe_customer_id FROM users WHERE id = ${session.userId}
    `) as unknown as [{ email: string; stripe_customer_id: string | null } | undefined]
    if (!user) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const isAnnual = interval === 'annual'
    const planDef = PLAYER_PLANS[plan]
    const metadata = {
      type: 'player_subscription',
      userId: session.userId,
      playerPlan: plan,
      playerInterval: interval,
    }

    const checkout = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      // No payment_method_types: let Stripe pick the methods that can actually
      // support a recurring charge.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currencyForRequest(req),
            unit_amount: playerPlanTotalCents(plan, interval),
            recurring: { interval: isAnnual ? 'year' : 'month' },
            product_data: {
              name: `${planDef.name} — ${isAnnual ? 'Annual' : 'Monthly'}`,
              // The caps in Stripe's own checkout UI, phrased the unambiguous
              // way (never bare "per week"): both limits always apply, and an
              // annual plan still resets weekly/monthly — no upfront bank.
              description: `${planAllowanceLabel(plan)}. Allowances reset through the year on annual billing too.`,
            },
          },
        },
      ],
      // Reuse the Stripe customer when one exists (prior token purchases or a
      // lapsed plan) so the billing portal shows one coherent history.
      ...(user.stripe_customer_id
        ? { customer: user.stripe_customer_id }
        : { customer_email: user.email }),
      allow_promotion_codes: true,
      metadata,
      // customer.subscription.* events carry NO checkout-session metadata, so
      // the same fields are stamped on the subscription itself — the lifecycle
      // handler routes player vs org syncs on subscription.metadata.type.
      subscription_data: { metadata },
      // Deliberately NO after_expiration.recovery — see /api/org/subscribe.
      success_url: `${BASE_URL}/api/subscribe/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/pricing?canceled=1`,
    })

    console.log('[subscribe] checkout created', {
      userId: session.userId,
      plan,
      interval,
      unitAmount: playerPlanTotalCents(plan, interval),
      sessionId: checkout.id,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('[subscribe] failed:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
