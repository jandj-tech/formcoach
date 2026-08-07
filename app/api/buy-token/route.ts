import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getSessionFromRequest } from '@/lib/auth'
import { analysisUnitCents, discountedUnitCents } from '@/lib/team-pricing'
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

    const body = await req.json().catch(() => ({})) as { region?: string; compCode?: string; quantity?: unknown }
    const region = body.region ?? 'US'

    // Players can buy in bulk like coaches and orgs already could. Clamped to
    // the same 1–99 range the cart uses, and floored so a fractional quantity
    // cannot bill a fraction of a token.
    const rawQty = Number(body.quantity ?? 1)
    const quantity = Math.min(99, Math.max(1, Math.floor(Number.isFinite(rawQty) ? rawQty : 1)))

    const userInitiated = await userHasInitiatedTeam(session.userId)
    // Volume tiers stack on whichever base rate this player is on, matching
    // every other buy flow.
    const unitAmount = discountedUnitCents(analysisUnitCents(userInitiated), quantity)

    // A valid comp code zeroes the total via a 100%-off coupon so Stripe
    // skips the card form. discounts / allow_promotion_codes are exclusive.
    const comp = isValidCompCode(body.compCode)
    const discountOpts = comp
      ? { discounts: [{ coupon: await getCompCouponId() }] }
      : { allow_promotion_codes: true as const }

    const stripeSession = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity,
        price_data: {
          currency: region === 'CA' ? 'cad' : 'usd',
          unit_amount: unitAmount,
          product_data: {
            name: quantity === 1 ? '1 Shot Analysis' : 'Shot Analysis',
            description: 'One AI-powered basketball shot analysis on LearnHoops.com',
          },
        },
      }],
      customer_email: session.email,
      metadata: {
        type: 'analysis_token',
        userId: session.userId,
        quantity: String(quantity),
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
