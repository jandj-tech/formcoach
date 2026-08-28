import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { getStripe } from '@/lib/stripe'
import { TEAM_TOKEN_PRICE_CENTS, REGULAR_ANALYSIS_PRICE_CENTS, discountedUnitCents, MAX_TOKENS_PER_ORDER } from '@/lib/team-tokens'
import { orgIsEntitledById } from '@/lib/team-features'
import { rejectInAppPurchase } from '@/lib/in-app'
import { currencyForRequest } from '@/lib/region'
import { resolveBaseUrl } from '@/lib/base-url'

const BASE_URL = resolveBaseUrl()

// An organization buys analysis tokens into its own balance. From there the
// org can assign them to players, give them to a coach, or use them itself.
// $2.49 each, dropping to $1.49 at 5+ in one order. Every org gets this rate.
export async function POST(req: NextRequest) {
  // Digital goods cannot be sold via Stripe inside the iOS app (guideline 3.1.1).
  const inAppBlock = rejectInAppPurchase(req)
  if (inAppBlock) return inAppBlock
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { quantity } = await req.json()
    const qty = typeof quantity === 'number' ? Math.floor(quantity) : 1
    if (qty < 1 || qty > MAX_TOKENS_PER_ORDER) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    // A lapsed organization pays the regular rate on new purchases. Tokens it
    // already bought keep working — see lib/team-features.ts.
    const entitled = await orgIsEntitledById(session.orgId)
    const baseAmount = entitled ? TEAM_TOKEN_PRICE_CENTS : REGULAR_ANALYSIS_PRICE_CENTS
    // Volume discount comes off whichever base rate applies to this buyer.
    const unitAmount = discountedUnitCents(baseAmount, qty)
    console.log('[buy-tokens] org pricing', { orgId: session.orgId, entitled, baseAmount, unitAmount, qty })

    const checkout = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: qty,
          price_data: {
            currency: currencyForRequest(req),
            unit_amount: unitAmount,
            product_data: { name: `${qty} Analysis Token${qty > 1 ? 's' : ''}` },
          },
        },
      ],
      metadata: {
        type: 'org_token_purchase',
        orgId: session.orgId,
        quantity: String(qty),
      },
      success_url: `${BASE_URL}/org/dashboard?tokens_purchased=1`,
      allow_promotion_codes: true,
      cancel_url: `${BASE_URL}/org/dashboard`,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('Org buy-tokens error:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
