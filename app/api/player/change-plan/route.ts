import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { rejectInAppPurchase } from '@/lib/in-app'
import { currencyForRequest } from '@/lib/region'
import { ensurePlayerPlanProduct, getPlayerSubscription } from '@/lib/player-subscription'
import {
  isPlayerBillingInterval,
  isPlayerPlan,
  PLAYER_PLANS,
  playerPlanTotalCents,
  playerStatusEntitled,
} from '@/lib/player-plans'

/**
 * Move a player between Player and Pro, or between monthly and annual.
 *
 * Same architecture as /api/org/change-plan: the plan changes IN PLACE on the
 * existing subscription and Stripe prorates — an upgrade credits the unused
 * remainder of the old price against the new one, a downgrade credits the
 * difference forward. The billing cycle anchor is left alone, so the usage
 * windows derived from it (lib/player-plans.ts) stay put; only the limits
 * change, immediately.
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

    const current = await getPlayerSubscription(session.userId)
    if (!current?.stripeSubscriptionId || !playerStatusEntitled(current.status)) {
      return NextResponse.json(
        { error: 'No active plan to change — start one from the pricing page.', noPlan: true },
        { status: 409 },
      )
    }
    if (current.plan === plan && current.interval === interval) {
      return NextResponse.json({ error: 'That is already your plan.', noChange: true }, { status: 409 })
    }

    const stripe = getStripe()
    const subscription = await stripe.subscriptions.retrieve(current.stripeSubscriptionId)
    const itemId = subscription.items.data[0]?.id
    if (!itemId) {
      console.error('[player/change-plan] subscription has no items', current.stripeSubscriptionId)
      return NextResponse.json({ error: 'Could not change plan' }, { status: 500 })
    }

    const isAnnual = interval === 'annual'
    const productId = await ensurePlayerPlanProduct(plan, PLAYER_PLANS[plan].name)
    await stripe.subscriptions.update(current.stripeSubscriptionId, {
      items: [
        {
          id: itemId,
          price_data: {
            currency: currencyForRequest(req),
            unit_amount: playerPlanTotalCents(plan, interval),
            recurring: { interval: isAnnual ? 'year' : 'month' },
            product: productId,
          },
        },
      ],
      proration_behavior: 'create_prorations',
      // customer.subscription.updated carries no checkout metadata, so restamp
      // the subscription with what it now is.
      metadata: {
        type: 'player_subscription',
        userId: session.userId,
        playerPlan: plan,
        playerInterval: interval,
      },
    })

    // Write through immediately rather than waiting on the webhook — the user
    // is looking at their dashboard. The webhook lands the same values again,
    // harmlessly.
    await db`
      UPDATE users SET plan = ${plan}, plan_interval = ${interval}
      WHERE id = ${session.userId}
    `

    console.log('[player/change-plan] plan changed', {
      userId: session.userId,
      from: `${current.plan}/${current.interval}`,
      to: `${plan}/${interval}`,
    })

    return NextResponse.json({ ok: true, plan, interval })
  } catch (err) {
    console.error('[player/change-plan] failed:', err)
    return NextResponse.json({ error: 'Could not change plan' }, { status: 500 })
  }
}
