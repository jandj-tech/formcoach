import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { rejectInAppPurchase } from '@/lib/in-app'
import { currencyForRequest } from '@/lib/region'
import { resolveBaseUrl } from '@/lib/base-url'
import { orgIsEntitledById } from '@/lib/team-features'
import {
  isOrgPlan,
  ORG_ANNUAL_TOTAL_CENTS,
  ORG_MONTHLY_CENTS,
} from '@/lib/org-subscription-pricing'

const BASE_URL = resolveBaseUrl()

/**
 * Restart a lapsed organization's subscription.
 *
 * This exists because locking an organization out without a way back in is
 * worse than not locking it at all. The signup flow cannot be reused: it
 * refuses an email that already has an organization, and it would create a
 * second one.
 *
 * Unlike signup, the org already exists and is already logged in — so there is
 * no pending row, no password to carry, and nothing to mint afterwards. The
 * webhook just flips the existing row back to active.
 *
 * The launch offer is deliberately not available here. It is an offer for new
 * organizations; letting anyone harvest it by cancelling and resubscribing
 * would make it a permanent 50% discount.
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
    const plan = body?.plan
    if (!isOrgPlan(plan)) {
      return NextResponse.json({ error: 'Pick a plan' }, { status: 400 })
    }

    // Already paid up: send them to the billing portal instead of selling a
    // second subscription on top of the one they have.
    if (await orgIsEntitledById(session.orgId)) {
      return NextResponse.json(
        { error: 'This organization already has an active plan.', alreadyActive: true },
        { status: 409 },
      )
    }

    const [org] = (await db`
      SELECT name, admin_email, stripe_customer_id
      FROM organizations WHERE id = ${session.orgId}
    `) as unknown as [
      { name: string; admin_email: string; stripe_customer_id: string | null } | undefined,
    ]
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const isAnnual = plan === 'annual'

    const checkout = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currencyForRequest(req),
            unit_amount: isAnnual ? ORG_ANNUAL_TOTAL_CENTS : ORG_MONTHLY_CENTS,
            recurring: { interval: isAnnual ? 'year' : 'month' },
            product_data: {
              name: `LearnHoops Organization — ${isAnnual ? 'Annual' : 'Monthly'}`,
            },
          },
        },
      ],
      // Reuse the Stripe customer when there is one, so an org that has been
      // through a cancel/resubscribe cycle keeps one billing history rather
      // than accumulating a customer per attempt. customer and customer_email
      // are mutually exclusive.
      ...(org.stripe_customer_id
        ? { customer: org.stripe_customer_id }
        : { customer_email: org.admin_email }),
      allow_promotion_codes: true,
      metadata: {
        type: 'org_reactivate',
        orgId: session.orgId,
        plan,
      },
      // Lifecycle events carry no checkout-session metadata, so stamp the
      // subscription too — that is what customer.subscription.* keys on.
      subscription_data: {
        metadata: {
          type: 'org_reactivate',
          orgId: session.orgId,
          plan,
        },
      },
      success_url: `${BASE_URL}/org/dashboard?reactivated=1`,
      cancel_url: `${BASE_URL}/org/dashboard`,
    })

    console.log('[org/reactivate] checkout created', {
      orgId: session.orgId,
      plan,
      reusedCustomer: !!org.stripe_customer_id,
      sessionId: checkout.id,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('[org/reactivate] failed:', err)
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 })
  }
}
