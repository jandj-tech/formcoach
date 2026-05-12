import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://learnhoops.com'

// Stripe Price IDs — set these in env after creating products in Stripe dashboard
// STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL
export async function POST(req: NextRequest) {
  try {
    const { plan, submissionId } = await req.json() as { plan: 'monthly' | 'annual'; submissionId?: string }

    const priceId = plan === 'annual'
      ? process.env.STRIPE_PRICE_ANNUAL
      : process.env.STRIPE_PRICE_MONTHLY

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
      success_url: successUrl,
      cancel_url: `${BASE_URL}/`,
      allow_promotion_codes: true,
      metadata: { plan, submissionId: submissionId ?? '' },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Subscribe error:', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
