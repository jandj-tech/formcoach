import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getSessionFromRequest } from '@/lib/auth'
import { REGULAR_ANALYSIS_PRICE_CENTS, TEAM_TOKEN_PRICE_CENTS } from '@/lib/team-pricing'
import { userHasInitiatedTeam } from '@/lib/team-tokens'
import { isValidCompCode, getCompCouponId } from '@/lib/comp'
import { rejectInAppPurchase } from '@/lib/in-app'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://learnhoops.com'

export async function POST(req: NextRequest) {
  // Digital goods cannot be sold via Stripe inside the iOS app (guideline 3.1.1).
  const inAppBlock = rejectInAppPurchase(req)
  if (inAppBlock) return inAppBlock
  try {
    const session = await getSessionFromRequest(req)
    if (!session) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({})) as { region?: string; compCode?: string }
    const region = body.region ?? 'US'

    const userInitiated = await userHasInitiatedTeam(session.userId)
    const unitAmount = userInitiated ? TEAM_TOKEN_PRICE_CENTS : REGULAR_ANALYSIS_PRICE_CENTS

    // A valid comp code zeroes the total via a 100%-off coupon so Stripe
    // skips the card form. discounts / allow_promotion_codes are exclusive.
    const comp = isValidCompCode(body.compCode)
    const discountOpts = comp
      ? { discounts: [{ coupon: await getCompCouponId() }] }
      : { allow_promotion_codes: true as const }

    const stripeSession = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: region === 'CA' ? 'cad' : 'usd',
          unit_amount: unitAmount,
          product_data: {
            name: '1 Shot Analysis',
            description: 'One AI-powered basketball shot analysis on LearnHoops.com',
          },
        },
      }],
      customer_email: session.email,
      metadata: {
        type: 'analysis_token',
        userId: session.userId,
        quantity: '1',
      },
      success_url: `${BASE_URL}/analyze?token_purchased=1`,
      ...discountOpts,
      cancel_url: `${BASE_URL}/analyze`,
    })

    return NextResponse.json({ url: stripeSession.url })
  } catch (err) {
    console.error('Buy token error:', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
