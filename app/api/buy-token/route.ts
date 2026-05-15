import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://learnhoops.com'

export async function POST(req: NextRequest) {
  try {
    const { email, submissionId } = await req.json() as { email?: string; submissionId?: string }

    const successUrl = submissionId
      ? `${BASE_URL}/gate/${submissionId}?token_purchased=1`
      : `${BASE_URL}/analyze?token_purchased=1`

    const cancelUrl = submissionId
      ? `${BASE_URL}/gate/${submissionId}`
      : `${BASE_URL}/analyze`

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: 499,
          product_data: {
            name: '1 Shot Analysis',
            description: 'One AI-powered basketball shot analysis on LearnHoops.com',
          },
        },
      }],
      customer_email: email || undefined,
      metadata: {
        type: 'analysis_token',
        submissionId: submissionId ?? '',
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Buy token error:', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
