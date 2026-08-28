import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { rejectInAppPurchase } from '@/lib/in-app'
import { currencyForRequest } from '@/lib/region'
import { resolveBaseUrl } from '@/lib/base-url'
import { ensureLaunchCoupon } from '@/lib/org-subscription'
import {
  getPendingFromRequest,
  markPendingCheckout,
  offerIsLive,
} from '@/lib/pending-org'
import {
  isOrgPlan,
  launchOfferMonthlyCents,
  ORG_ANNUAL_TOTAL_CENTS,
  ORG_MONTHLY_CENTS,
  planTotalCents,
} from '@/lib/org-subscription-pricing'

const BASE_URL = resolveBaseUrl()

/**
 * Create the Stripe subscription checkout for a pending organization signup.
 *
 * The organization still does not exist at this point. Stripe carries the
 * pending token in metadata, and the org is created only after payment — see
 * lib/create-org-from-checkout.ts.
 */
export async function POST(req: NextRequest) {
  // Digital goods cannot be sold via Stripe inside the iOS app (guideline 3.1.1).
  const inAppBlock = rejectInAppPurchase(req)
  if (inAppBlock) return inAppBlock

  try {
    const body = await req.json()
    const plan = body?.plan
    if (!isOrgPlan(plan)) {
      return NextResponse.json({ error: 'Pick a plan' }, { status: 400 })
    }

    const pending = await getPendingFromRequest(req)
    if (!pending) {
      return NextResponse.json(
        { error: 'Your signup session expired. Please start again.', restart: true },
        { status: 401 },
      )
    }

    // The server decides whether the launch offer applies — never the client.
    // `offerIsLive` re-reads the deadline stored on the pending row and also
    // enforces monthly-only: on a yearly interval a 3-month repeating coupon
    // covers the entire first invoice, i.e. 50% off a whole year.
    const offerApplies = offerIsLive(pending, plan)

    // If the client asked for the offer and the server disagrees, say so
    // loudly instead of quietly charging full price. Silently creating a
    // full-price session bills more than the button said, which is the one
    // failure here that earns a chargeback.
    if (body?.offer === true && !offerApplies) {
      return NextResponse.json(
        {
          error: 'That launch offer has expired.',
          expired: true,
          currentPriceCents: planTotalCents(plan),
        },
        { status: 409 },
      )
    }

    const isAnnual = plan === 'annual'
    const unitAmount = isAnnual ? ORG_ANNUAL_TOTAL_CENTS : ORG_MONTHLY_CENTS

    // `discounts` and `allow_promotion_codes` are MUTUALLY EXCLUSIVE — Stripe
    // errors if both are sent. Every other checkout in this repo sets
    // allow_promotion_codes unconditionally, so this is the one spot where
    // copy-pasting that pattern would break the request.
    const discountFields = offerApplies
      ? { discounts: [{ coupon: await ensureLaunchCoupon() }] }
      : { allow_promotion_codes: true as const }

    const checkout = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      // No payment_method_types: let Stripe pick the methods that can actually
      // support a recurring charge.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currencyForRequest(req),
            unit_amount: unitAmount,
            recurring: { interval: isAnnual ? 'year' : 'month' },
            product_data: {
              name: `LearnHoops Organization — ${isAnnual ? 'Annual' : 'Monthly'}`,
            },
          },
        },
      ],
      customer_email: pending.adminEmail,
      ...discountFields,
      metadata: {
        type: 'org_subscription',
        pendingToken: pending.token,
        plan,
      },
      // customer.subscription.* events carry NO checkout-session metadata, so
      // the same fields are stamped on the subscription itself. Without this
      // the lifecycle handlers have nothing to key on.
      subscription_data: {
        metadata: {
          type: 'org_subscription',
          pendingToken: pending.token,
          plan,
        },
      },
      // Deliberately NO after_expiration.recovery: the abandoned-cart branch in
      // the Stripe webhook keys off that field, and setting it here would send
      // a ball-shop "you left something in your cart" email to an org signup.
      success_url: `${BASE_URL}/api/org/subscribe/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/org/pricing?canceled=1`,
    })

    await markPendingCheckout(pending.token, plan, checkout.id)

    console.log('[org/subscribe] checkout created', {
      plan,
      offerApplies,
      unitAmount,
      firstInvoiceCents: offerApplies ? launchOfferMonthlyCents() : unitAmount,
      sessionId: checkout.id,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('[org/subscribe] failed:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
