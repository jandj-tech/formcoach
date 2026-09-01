import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import {
  LAUNCH_OFFER_AMOUNT_OFF_CENTS,
  LAUNCH_OFFER_MONTHS,
  launchCouponId,
  orgUsd,
  ORG_TIERS,
  type PaidTier,
} from '@/lib/org-subscription-pricing'

/**
 * Stripe-side plumbing for the organization subscription.
 *
 * Everything that talks to Stripe about subscriptions goes through here so the
 * two easy mistakes are made in exactly one place: reading the period end off
 * the wrong object, and letting the launch coupon apply to an annual plan.
 */

/**
 * A Stripe reference is `string | Object | null` depending on expansion.
 * Every call site needs the id and none of them expand, so normalise once.
 */
export function stripeIdOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id
}

/**
 * The current period end, as a Date.
 *
 * `Stripe.Subscription` has NO top-level `current_period_end` in stripe@22 —
 * the field lives on the subscription ITEM. Reading it off the subscription
 * either fails to typecheck or, if cast, silently stores NULL. Verified
 * against node_modules/stripe/cjs/resources/SubscriptionItems.d.ts.
 */
export function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const seconds = sub.items?.data?.[0]?.current_period_end
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null
}

/**
 * Create a tier's launch coupon if it does not exist yet, and return its id.
 *
 * Idempotent by id, the same lazy pattern lib/comp.ts uses for the 100%-off
 * comp coupon.
 *
 * `amount_off` rather than `percent_off`: half of 1299¢ is 649.5¢, so a
 * percentage would leave Stripe's rounding to decide what the first invoice
 * says after the page had already promised a number. A fixed $6.50 off $12.99
 * is exactly $6.49, every time.
 *
 * An amount coupon needs a currency, and this app bills the same numeric price
 * in USD and CAD (lib/region.ts). `currency_options` carries both on ONE
 * coupon — the amounts are identical because the prices are.
 *
 * Deliberately no `max_redemptions` — a global cap would turn a per-visitor
 * offer into a race between strangers. Eligibility is decided per signup in
 * lib/pending-org.ts.
 */
export async function ensureLaunchCoupon(tier: PaidTier): Promise<string> {
  const id = launchCouponId(tier)
  const amountOff = LAUNCH_OFFER_AMOUNT_OFF_CENTS[tier]
  const stripe = getStripe()
  try {
    await stripe.coupons.retrieve(id)
  } catch {
    try {
      await stripe.coupons.create({
        id,
        amount_off: amountOff,
        currency: 'usd',
        currency_options: { cad: { amount_off: amountOff } },
        duration: 'repeating',
        duration_in_months: LAUNCH_OFFER_MONTHS,
        name: `${orgUsd(amountOff)} off ${ORG_TIERS[tier].name} for ${LAUNCH_OFFER_MONTHS} months`,
      })
    } catch (err) {
      // A concurrent request may have created it between the retrieve and the
      // create. Anything else is a real failure and the caller should hear it.
      const code = (err as { code?: string })?.code
      if (code !== 'resource_already_exists') throw err
    }
  }
  return id
}

/**
 * The Stripe Product for a tier, created on first use.
 *
 * Only the in-place plan change needs this. Checkout can build a price purely
 * inline with `product_data`, but `SubscriptionItemUpdateParams.PriceData`
 * requires `product` — an existing Product id — instead (verified in
 * node_modules/stripe/cjs/resources/SubscriptionItems.d.ts). A Product is
 * currency-agnostic, unlike a Price, so one per tier still serves both USD and
 * CAD off the same numeric amount.
 *
 * Idempotent by id, the same lazy pattern as ensureLaunchCoupon.
 */
export async function ensureTierProduct(tier: 'basic' | 'plus', name: string): Promise<string> {
  const id = `learnhoops-org-${tier}`
  const stripe = getStripe()
  try {
    await stripe.products.retrieve(id)
  } catch {
    try {
      await stripe.products.create({ id, name })
    } catch (err) {
      // A concurrent request may have created it between the two calls.
      const code = (err as { code?: string })?.code
      if (code !== 'resource_already_exists') throw err
    }
  }
  return id
}

/**
 * Mirror a subscription's state onto its organization.
 *
 * Driven by customer.subscription.updated and .deleted. `updated` covers
 * status transitions AND the period rolling forward on renewal, which is why
 * there is no separate invoice.paid handler.
 *
 * Keyed on stripe_subscription_id, so an event for a subscription this app
 * does not know about is a harmless no-op.
 */
export async function syncSubscriptionToOrg(sub: Stripe.Subscription): Promise<void> {
  const periodEnd = subscriptionPeriodEnd(sub)
  try {
    await db`
      UPDATE organizations
      SET subscription_status = ${sub.status},
          subscription_cancel_at_period_end = ${sub.cancel_at_period_end ?? false},
          subscription_current_period_end = ${periodEnd}
      WHERE stripe_subscription_id = ${sub.id}
    `
  } catch (err) {
    console.error('[org-subscription] sync failed:', sub.id, err)
  }
}

/**
 * Point an existing organization at a newly-bought subscription and switch it
 * back on.
 *
 * Shared by the webhook and by the success route the buyer lands on, for the
 * same reason org creation is: whichever arrives first wins and the other is a
 * harmless repeat. Without the second caller, a slow or missed webhook leaves
 * someone who has just paid staring at a dashboard that still says their plan
 * has ended.
 *
 * Idempotent by construction — it writes the same values every time, and
 * `subscription_status = 'active'` is not an increment.
 *
 * Returns false only when the session carries no orgId or the update matched
 * nothing, so callers can tell "not ready" from "done".
 */
export async function applyOrgReactivation(session: Stripe.Checkout.Session): Promise<boolean> {
  const orgId = session.metadata?.orgId
  if (!orgId) return false

  const customerId = stripeIdOf(session.customer as string | { id: string } | null)
  const subscriptionId = stripeIdOf(session.subscription as string | { id: string } | null)

  try {
    const rows = (await db`
      UPDATE organizations
      SET stripe_customer_id = COALESCE(${customerId}, stripe_customer_id),
          stripe_subscription_id = ${subscriptionId},
          subscription_status = 'active',
          subscription_plan = ${session.metadata?.plan ?? null},
          subscription_tier = ${session.metadata?.tier ?? null},
          subscription_cancel_at_period_end = FALSE
      WHERE id = ${orgId}
      RETURNING id
    `) as unknown as unknown[]
    return rows.length > 0
  } catch (err) {
    console.error('[org-subscription] reactivation failed:', orgId, err)
    return false
  }
}

/**
 * Open a Stripe billing portal session for an organization.
 *
 * Returns null when the org has no Stripe customer — which is the normal case
 * for a grandfathered ('legacy') or comped org. Callers must treat null as
 * "do not show a Manage billing button" rather than an error: those orgs have
 * nothing to manage, and calling the portal API without a customer id 500s.
 */
export async function billingPortalUrl(orgId: string, returnUrl: string): Promise<string | null> {
  const [row] = (await db`
    SELECT stripe_customer_id FROM organizations WHERE id = ${orgId}
  `) as unknown as [{ stripe_customer_id: string | null } | undefined]

  const customer = row?.stripe_customer_id
  if (!customer) return null

  const session = await getStripe().billingPortal.sessions.create({
    customer,
    return_url: returnUrl,
  })
  return session.url
}
