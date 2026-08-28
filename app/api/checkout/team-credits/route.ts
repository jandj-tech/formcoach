import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getStripe } from '@/lib/stripe'
import { TEAM_TOKEN_PRICE_CENTS, REGULAR_ANALYSIS_PRICE_CENTS, discountedUnitCents } from '@/lib/team-tokens'
import { teamIsEntitled } from '@/lib/team-features'
import { rejectInAppPurchase } from '@/lib/in-app'
import { currencyForRequest } from '@/lib/region'
import { resolveBaseUrl } from '@/lib/base-url'

const BASE_URL = resolveBaseUrl()

export async function POST(req: NextRequest) {
  // Digital goods cannot be sold via Stripe inside the iOS app (guideline 3.1.1).
  const inAppBlock = rejectInAppPurchase(req)
  if (inAppBlock) return inAppBlock
  const session = await getTeamSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { quantity } = await req.json()
    const qty = typeof quantity === 'number' ? Math.floor(quantity) : 1
    if (qty < 1 || qty > 500) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    // Coach credits at the team rate, unless the organization has lapsed.
    const baseAmount = (await teamIsEntitled(session.teamId))
      ? TEAM_TOKEN_PRICE_CENTS
      : REGULAR_ANALYSIS_PRICE_CENTS
    // Volume discount comes off whichever base rate applies to this buyer.
    const unitAmount = discountedUnitCents(baseAmount, qty)

    const checkout = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: qty,
          price_data: {
            currency: currencyForRequest(req),
            unit_amount: unitAmount,
            product_data: {
              name: 'LearnHoops Team Upload Credit',
              description: '1 credit = 1 AI shot analysis for your team',
            },
          },
        },
      ],
      metadata: {
        plan: 'team-credits',
        teamId: session.teamId,
        quantity: String(qty),
      },
      success_url: `${BASE_URL}/team/dashboard?credits=success`,
      allow_promotion_codes: true,
      cancel_url: `${BASE_URL}/team/dashboard`,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('Team credits checkout error:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
