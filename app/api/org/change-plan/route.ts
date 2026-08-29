import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { getStripe } from '@/lib/stripe'
import { ensureTierProduct } from '@/lib/org-subscription'
import { db } from '@/lib/db'
import { rejectInAppPurchase } from '@/lib/in-app'
import { currencyForRequest } from '@/lib/region'
import {
  countableTeams,
  maxTeamsFor,
  orgTierById,
  SUBSCRIPTION_ENDED_MESSAGE,
} from '@/lib/team-features'
import {
  isBillingInterval,
  isPaidTier,
  ORG_TIERS,
  planTotalCents,
} from '@/lib/org-subscription-pricing'

/**
 * Move an organization between Basic and Plus, or between monthly and annual.
 *
 * The plan changes IN PLACE on the existing subscription rather than through a
 * second checkout, and Stripe prorates the difference automatically.
 *
 * A subscription item takes inline `price_data`, but unlike checkout it wants
 * `product` (an existing Product id) rather than `product_data` — checked in
 * node_modules/stripe/cjs/resources/SubscriptionItems.d.ts, not assumed. That
 * still avoids catalog PRICES, which is the part that matters: a Price is
 * pinned to one currency and this app bills the same numeric amount in both USD
 * and CAD. A Product is currency-agnostic, so one per tier covers both.
 *
 * Without this route the split would be a trap: a Basic org wanting scheduling
 * would have no way to reach it short of cancelling.
 */
export async function POST(req: NextRequest) {
  // Digital goods cannot be sold via Stripe inside the iOS app (guideline 3.1.1).
  const inAppBlock = rejectInAppPurchase(req)
  if (inAppBlock) return inAppBlock

  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const tier = body?.tier
    const interval = body?.interval
    if (!isPaidTier(tier) || !isBillingInterval(interval)) {
      return NextResponse.json({ error: 'Pick a plan' }, { status: 400 })
    }

    const currentTier = await orgTierById(session.orgId)
    if (currentTier === 'none') {
      // Nothing to change — they need to start a plan, not switch one.
      return NextResponse.json(
        { error: SUBSCRIPTION_ENDED_MESSAGE, subscriptionEnded: true },
        { status: 402 },
      )
    }

    const [org] = (await db`
      SELECT stripe_subscription_id, subscription_plan, subscription_tier
      FROM organizations WHERE id = ${session.orgId}
    `) as unknown as [
      {
        stripe_subscription_id: string | null
        subscription_plan: string | null
        subscription_tier: string | null
      } | undefined,
    ]

    if (!org?.stripe_subscription_id) {
      // Grandfathered and comped organizations have no subscription to move.
      // They already have everything, so this is a no-op, not an error state.
      return NextResponse.json(
        { error: 'This organization has no paid subscription to change.', noBilling: true },
        { status: 409 },
      )
    }

    if (org.subscription_tier === tier && org.subscription_plan === interval) {
      return NextResponse.json({ error: 'That is already your plan.', noChange: true }, { status: 409 })
    }

    // Downgrading to a plan with fewer team slots must not strand teams the org
    // can still see. Say exactly how many they would need to remove rather than
    // silently locking them.
    const limit = maxTeamsFor(tier)
    if (limit !== Infinity) {
      const have = await countableTeams(session.orgId)
      if (have > limit) {
        return NextResponse.json(
          {
            error: `${ORG_TIERS[tier].name} covers ${limit} team${limit === 1 ? '' : 's'}. Delete ${have - limit} more before switching.`,
            teamsOverLimit: have - limit,
          },
          { status: 409 },
        )
      }
    }

    const stripe = getStripe()
    const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id)
    const itemId = subscription.items.data[0]?.id
    if (!itemId) {
      console.error('[org/change-plan] subscription has no items', org.stripe_subscription_id)
      return NextResponse.json({ error: 'Could not change plan' }, { status: 500 })
    }

    const isAnnual = interval === 'annual'
    const productId = await ensureTierProduct(tier, `LearnHoops Organization ${ORG_TIERS[tier].name}`)
    await stripe.subscriptions.update(org.stripe_subscription_id, {
      items: [
        {
          id: itemId,
          price_data: {
            currency: currencyForRequest(req),
            unit_amount: planTotalCents(tier, interval),
            recurring: { interval: isAnnual ? 'year' : 'month' },
            product: productId,
          },
        },
      ],
      proration_behavior: 'create_prorations',
      // customer.subscription.updated carries no checkout metadata, so restamp
      // the subscription with what it now is.
      metadata: { type: 'org_subscription', plan: interval, tier },
    })

    // Write it through immediately rather than waiting on the webhook: the user
    // is about to look at their dashboard, and an upgrade that appears not to
    // have happened is worse than a redundant write. The webhook's
    // syncSubscriptionToOrg lands the same values again, harmlessly.
    await db`
      UPDATE organizations
      SET subscription_tier = ${tier}, subscription_plan = ${interval}
      WHERE id = ${session.orgId}
    `

    console.log('[org/change-plan] plan changed', {
      orgId: session.orgId,
      from: `${org.subscription_tier}/${org.subscription_plan}`,
      to: `${tier}/${interval}`,
    })

    return NextResponse.json({ ok: true, tier, interval })
  } catch (err) {
    console.error('[org/change-plan] failed:', err)
    return NextResponse.json({ error: 'Could not change plan' }, { status: 500 })
  }
}
