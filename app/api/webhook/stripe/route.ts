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

  // --- Ball shop order ---
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const variant = session.metadata?.variant
    const size = session.metadata?.size
    const plan = session.metadata?.plan as 'monthly' | 'annual' | undefined
    const email = session.customer_details?.email

    // Subscription checkout
    if (plan === 'monthly' || plan === 'annual') {
      if (!email) return NextResponse.json({ received: true })

      const emailLower = email.toLowerCase()
      const expiresAt = plan === 'annual'
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000)

      try {
        // Upsert email_list with subscription info
        await db`
          INSERT INTO email_list (email, subscription_type, subscription_expires_at)
          VALUES (${emailLower}, ${plan}, ${expiresAt})
          ON CONFLICT (email) DO UPDATE
          SET subscription_type = ${plan}, subscription_expires_at = ${expiresAt}
        `

        // If user account exists, sync subscription there too
        await db`
          UPDATE users
          SET subscription_type = ${plan}, subscription_expires_at = ${expiresAt},
              stripe_customer_id = ${session.customer as string ?? null}
          WHERE email = ${emailLower}
        `
      } catch (err) {
        console.error('Failed to save subscription:', err)
        return NextResponse.json({ error: 'DB error' }, { status: 500 })
      }

      return NextResponse.json({ received: true })
    }

    // Ball shop order (existing logic)
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

  // --- Subscription cancelled/expired ---
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    const customerId = sub.customer as string
    try {
      await db`
        UPDATE users SET subscription_type = NULL, subscription_expires_at = NULL
        WHERE stripe_customer_id = ${customerId}
      `
      await db`
        UPDATE email_list SET subscription_type = NULL, subscription_expires_at = NULL
        WHERE email IN (SELECT email FROM users WHERE stripe_customer_id = ${customerId})
      `
    } catch (err) {
      console.error('Failed to clear subscription:', err)
    }
  }

  return NextResponse.json({ received: true })
}
