import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { sendClaimCreditsEmail } from '@/lib/email'

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

    // --- Team initiation package: unlocks $2.50 pricing + fills the token pool ---
    if (metaType === 'team_initiation') {
      const teamId = session.metadata?.teamId
      const tokens = parseInt(session.metadata?.tokens || '0', 10)
      if (teamId && tokens > 0) {
        try {
          await db`
            UPDATE teams
            SET token_pool = COALESCE(token_pool, 0) + ${tokens},
                initiated_at = COALESCE(initiated_at, NOW())
            WHERE id = ${teamId}
          `
        } catch (err) {
          console.error('Failed to initiate team:', err)
          return NextResponse.json({ error: 'DB error' }, { status: 500 })
        }
      }
      return NextResponse.json({ received: true })
    }

    // --- Token grant for team/org players ---
    if (metaType === 'team_token_grant') {
      const recipientIds = (session.metadata?.recipientUserIds || '').split(',').filter(Boolean)
      const tokensEach = parseInt(session.metadata?.tokensEach || '1', 10)
      try {
        for (const uid of recipientIds) {
          await db`UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${tokensEach} WHERE id = ${uid}`
        }
      } catch (err) {
        console.error('Failed to grant player tokens:', err)
        return NextResponse.json({ error: 'DB error' }, { status: 500 })
      }
      return NextResponse.json({ received: true })
    }

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

    // --- Org class package purchase ---
    if (metaType === 'org_class_package') {
      const orgId = session.metadata?.orgId
      const playerCount = parseInt(session.metadata?.playerCount || '0', 10)
      const pricePerPlayerCents = parseInt(session.metadata?.pricePerPlayerCents || '0', 10)
      const totalCents = parseInt(session.metadata?.totalCents || '0', 10)
      if (orgId && playerCount > 0) {
        try {
          await db`
            INSERT INTO org_class_packages
              (org_id, stripe_session_id, player_count, price_per_player_cents, total_cents, token_pool, status)
            VALUES
              (${orgId}, ${session.id}, ${playerCount}, ${pricePerPlayerCents}, ${totalCents}, ${playerCount * 2}, 'active')
            ON CONFLICT (stripe_session_id) DO NOTHING
          `
        } catch (err) {
          console.error('Failed to create org class package:', err)
          return NextResponse.json({ error: 'DB error' }, { status: 500 })
        }
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

    // Free shot analyses for this order, computed at checkout:
    // 5 per single training ball, 10 for the 2-ball bundle.
    // token_recipient routes them: a player's own account ("user:<id>")
    // or a team's shared pool ("team:<id>") for coach/org purchases.
    const tokensToGrant = parseInt(session.metadata?.analysis_tokens ?? '0', 10)
    const recipient = session.metadata?.token_recipient ?? ''
    const emailLower = email.toLowerCase()
    if (tokensToGrant > 0) {
      try {
        if (recipient.startsWith('team:')) {
          const teamId = recipient.slice(5)
          await db`
            UPDATE teams SET token_pool = COALESCE(token_pool, 0) + ${tokensToGrant}
            WHERE id = ${teamId}
          `
        } else if (recipient.startsWith('user:')) {
          const userId = recipient.slice(5)
          await db`
            UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${tokensToGrant}
            WHERE id = ${userId}
          `
          await db`
            INSERT INTO email_list (email, analysis_tokens)
            VALUES (${emailLower}, ${tokensToGrant})
            ON CONFLICT (email) DO UPDATE
            SET analysis_tokens = COALESCE(email_list.analysis_tokens, 0) + ${tokensToGrant}
          `
        } else {
          // Legacy orders with no recipient — credit by email.
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
        }
      } catch (err) {
        console.error('Failed to grant tokens:', err)
        // Non-fatal — order is saved, tokens can be credited manually
      }
    }

    // For guest purchases, the claim token was generated at checkout and is in the
    // metadata. Send a backup email so they can still claim credits if they closed
    // the browser before finishing signup.
    const claimToken = session.metadata?.claim_token
    if (tokensToGrant > 0 && claimToken && !recipient.startsWith('user:') && !recipient.startsWith('team:')) {
      try {
        await sendClaimCreditsEmail(emailLower, name || null, tokensToGrant, claimToken)
      } catch (err) {
        console.error('Failed to send claim credits email:', err)
      }
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
