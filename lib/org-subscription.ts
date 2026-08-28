import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import {
  LAUNCH_COUPON_ID,
  LAUNCH_OFFER_MONTHS,
  LAUNCH_OFFER_PERCENT_OFF,
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
 * Create the launch coupon if it does not exist yet, and return its id.
 *
 * Idempotent by id, the same lazy pattern lib/comp.ts uses for the 100%-off
 * comp coupon. `percent_off` rather than `amount_off`: an amount coupon is
 * pinned to one currency and this app bills both USD and CAD off the same
 * numeric price (see lib/region.ts), which would need two coupons.
 *
 * Deliberately no `max_redemptions` — a global cap would turn a per-visitor
 * offer into a race between strangers. Eligibility is decided per signup in
 * lib/pending-org.ts.
 */
export async function ensureLaunchCoupon(): Promise<string> {
  const stripe = getStripe()
  try {
    await stripe.coupons.retrieve(LAUNCH_COUPON_ID)
  } catch {
    try {
      await stripe.coupons.create({
        id: LAUNCH_COUPON_ID,
        percent_off: LAUNCH_OFFER_PERCENT_OFF,
        duration: 'repeating',
        duration_in_months: LAUNCH_OFFER_MONTHS,
        name: `${LAUNCH_OFFER_PERCENT_OFF}% off your first ${LAUNCH_OFFER_MONTHS} months`,
      })
    } catch (err) {
      // A concurrent request may have created it between the retrieve and the
      // create. Anything else is a real failure and the caller should hear it.
      const code = (err as { code?: string })?.code
      if (code !== 'resource_already_exists') throw err
    }
  }
  return LAUNCH_COUPON_ID
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
