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

  // --- All checkout.session.completed events ---
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const variant = session.metadata?.variant
    const size = session.metadata?.size
    const plan = session.metadata?.plan as 'monthly' | 'annual' | 'team-credits' | undefined
    const metaType = session.metadata?.type
    const email = session.customer_details?.email

    // --- Team upload credits purchase ---
    if (plan === 'team-credits') {
      const teamId = session.metadata?.teamId
      const quantity = parseInt(session.metadata?.quantity || '0', 10)
      if (teamId && quantity > 0) {
        try {
          await db`UPDATE teams SET credits = credits + ${quantity} WHERE id = ${teamId}`
        } catch (err) {
          console.error('Failed to credit team uploads:', err)
          return NextResponse.json({ error: 'DB error' }, { status: 500 })
        }
      }
      return NextResponse.json({ received: true })
    }

    // --- Analysis token purchase ---
    if (metaType === 'analysis_token') {
      const userId = session.metadata?.userId
      const emailLower = session.customer_details?.email?.toLowerCase()
      try {
        if (userId) {
          await db`UPDATE users SET analysis_tokens = analysis_tokens + 1 WHERE id = ${userId}`
        } else if (emailLower) {
          await db`UPDATE users SET analysis_tokens = analysis_tokens + 1 WHERE email = ${emailLower}`
        }
      } catch (err) {
        console.error('Failed to credit analysis token:', err)
        return NextResponse.json({ error: 'DB error' }, { status: 500 })
      }
      return NextResponse.json({ received: true })
    }

    // --- Legacy subscription checkout (honored until expiry, no longer sold) ---
    if (plan === 'monthly' || plan === 'annual') {
      if (!email) return NextResponse.json({ received: true })

      const emailLower = email.toLowerCase()
      const expiresAt = plan === 'annual'
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000)

      try {
        await db`
          INSERT INTO email_list (email, subscription_type, subscription_expires_at)
          VALUES (${emailLower}, ${plan}, ${expiresAt})
          ON CONFLICT (email) DO UPDATE
          SET subscription_type = ${plan}, subscription_expires_at = ${expiresAt}
        `
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

    // --- Ball shop order ---
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

    // Grant tokens: 15 for the 2-ball bundle, 10 for a single ball purchase
    const bundleUploads = parseInt(session.metadata?.bundle_uploads ?? '0', 10)
    const tokensToGrant = bundleUploads > 0 ? bundleUploads : 10
    const emailLower = email.toLowerCase()
    try {
      await db`
        INSERT INTO email_list (email, analysis_tokens)
        VALUES (${emailLower}, ${tokensToGrant})
        ON CONFLICT (email) DO UPDATE
        SET analysis_tokens = COALESCE(email_list.analysis_tokens, 0) + ${tokensToGrant}
      `
      await db`
        UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${tokensToGrant}
        WHERE email = ${emailLower}
      `
    } catch (err) {
      console.error('Failed to grant tokens:', err)
      // Non-fatal — order is saved, tokens can be credited manually
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
