import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { rejectInAppPurchase } from '@/lib/in-app'
import { currencyForRequest } from '@/lib/region'
import { ensurePlayerPlanProduct, getPlayerSubscription } from '@/lib/player-subscription'
import { effectivePlan, personalPlanVsClub } from '@/lib/player-entitlement'
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

    // A club membership seat covers this player: moving the personal plan to
    // the same or a lower plan (or re-billing the same one) pays twice. A
    // higher plan is allowed; the seat stays until it ends.
    const eff = await effectivePlan(session.userId)
    const club = personalPlanVsClub(eff, plan)
    if (!club.ok) {
      return NextResponse.json({ error: club.message, clubCovered: true }, { status: 409 })
    }

    const current = await getPlayerSubscription(session.userId)
    if (current && playerStatusEntitled(current.status) && !current.stripeSubscriptionId) {
      // Apple-billed membership: Stripe can't touch it.
      return NextResponse.json(
        { error: 'Your plan is billed through the App Store — change it in your iPhone’s Settings → Subscriptions.', appleBilled: true },
        { status: 409 },
      )
    }
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

    // Upgrading above the club seat makes this plan the one in use, so a pause
    // the seat put on it (lib/org-membership.ts applyPersonalPause) must lift —
    // otherwise the higher plan would run unbilled until the seat ends.
    const liftPause = !!club.note && !!subscription.pause_collection

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
      ...(liftPause ? { pause_collection: '' as const } : {}),
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

    if (liftPause && eff.liveSeat) {
      await db`
        UPDATE org_membership_seats SET paused_stripe_sub_id = NULL, updated_at = NOW()
        WHERE id = ${eff.liveSeat.seatId} AND paused_stripe_sub_id = ${current.stripeSubscriptionId}
      `
    }

    console.log('[player/change-plan] plan changed', {
      userId: session.userId,
      from: `${current.plan}/${current.interval}`,
      to: `${plan}/${interval}`,
      ...(liftPause ? { resumedFromClubPause: true } : {}),
    })

    return NextResponse.json({ ok: true, plan, interval, ...(club.note ? { note: club.note } : {}) })
  } catch (err) {
    console.error('[player/change-plan] failed:', err)
    return NextResponse.json({ error: 'Could not change plan' }, { status: 500 })
  }
}
