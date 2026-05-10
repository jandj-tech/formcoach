import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 })
  }

  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const variant = session.metadata?.variant
    const size = session.metadata?.size
    const email = session.customer_details?.email
    const name = session.customer_details?.name
    const phone = session.customer_details?.phone
    const ship = session.collected_information?.shipping_details

    if (
      !email ||
      (variant !== 'left' && variant !== 'right') ||
      (size !== '5' && size !== '6' && size !== '7')
    ) {
      console.error('Missing required fields on session', session.id)
      return NextResponse.json({ received: true })
    }

    try {
      await db`
        INSERT INTO orders (
          stripe_session_id, email, customer_name, phone, variant, size,
          amount_total, currency,
          shipping_name, shipping_line1, shipping_line2,
          shipping_city, shipping_state, shipping_postal_code, shipping_country
        ) VALUES (
          ${session.id}, ${email}, ${name ?? null}, ${phone ?? null}, ${variant}, ${size},
          ${session.amount_total ?? 0}, ${session.currency ?? 'usd'},
          ${ship?.name ?? null}, ${ship?.address?.line1 ?? null}, ${ship?.address?.line2 ?? null},
          ${ship?.address?.city ?? null}, ${ship?.address?.state ?? null},
          ${ship?.address?.postal_code ?? null}, ${ship?.address?.country ?? null}
        )
        ON CONFLICT (stripe_session_id) DO NOTHING
      `
    } catch (err) {
      console.error('Failed to save order:', err)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}
