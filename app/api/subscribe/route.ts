import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { rejectInAppPurchase } from '@/lib/in-app'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://learnhoops.com'

function getPriceId(plan: 'monthly' | 'annual', country: 'US' | 'CA'): string | undefined {
  if (plan === 'annual') {
    return country === 'CA' ? process.env.STRIPE_PRICE_ANNUAL_CAD : process.env.STRIPE_PRICE_ANNUAL
  }
  return country === 'CA' ? process.env.STRIPE_PRICE_MONTHLY_CAD : process.env.STRIPE_PRICE_MONTHLY
}

export async function POST(req: NextRequest) {
  // Digital goods cannot be sold via Stripe inside the iOS app (guideline 3.1.1).
  const inAppBlock = rejectInAppPurchase(req)
  if (inAppBlock) return inAppBlock
  try {
    const { plan, country = 'US', submissionId } = await req.json() as {
      plan: 'monthly' | 'annual'
      country?: 'US' | 'CA'
      submissionId?: string
    }

    const priceId = getPriceId(plan, country)
    if (!priceId) {
      return NextResponse.json({ error: 'Subscription not configured' }, { status: 500 })
    }

    const successUrl = submissionId
      ? `${BASE_URL}/signup?session_id={CHECKOUT_SESSION_ID}&submission=${submissionId}`
      : `${BASE_URL}/signup?session_id={CHECKOUT_SESSION_ID}`

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      billing_address_collection: 'required',
      success_url: successUrl,
      cancel_url: `${BASE_URL}/`,
      allow_promotion_codes: true,
      payment_method_collection: 'if_required',
      metadata: { plan, country, submissionId: submissionId ?? '' },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Subscribe error:', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
