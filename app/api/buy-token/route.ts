import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getSessionFromRequest } from '@/lib/auth'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://learnhoops.com'

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({})) as { region?: string }
    const region = body.region ?? 'US'

    const stripeSession = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: region === 'CA' ? 'cad' : 'usd',
          unit_amount: 499,
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
      },
      success_url: `${BASE_URL}/analyze?token_purchased=1`,
      allow_promotion_codes: true,
      cancel_url: `${BASE_URL}/analyze`,
    })

    return NextResponse.json({ url: stripeSession.url })
  } catch (err) {
    console.error('Buy token error:', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
