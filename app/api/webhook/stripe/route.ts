import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { sendClaimCreditsEmail, sendClassPurchaseConfirmationEmail, sendTokenPurchaseConfirmationEmail } from '@/lib/email'
import { sendClassPurchaseConfirmationSms } from '@/lib/sms'
import { grantBallCreditsOnce } from '@/lib/grant-ball-credits'

function generateTeamAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export async function POST(req: NextRequest) {
  try {
    return await handleWebhook(req)
  } catch (err) {
    // Catch-all: log and 200 so Stripe doesn't retry forever. The success
    // page has its own server-side grant safety net, so missing a webhook
    // delivery doesn't strand credits.
    console.error('[stripe webhook] unhandled error:', err)
    return NextResponse.json({ received: true, handled: false })
  }
}

async function handleWebhook(req: NextRequest): Promise<NextResponse> {
  const sig = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    console.error('[stripe webhook] rejected: missing', {
      hasSignature: !!sig,
      hasWebhookSecret: !!webhookSecret,
    })
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 })
  }

  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    console.error('[stripe webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  console.log('[stripe webhook] received', event.type, 'id=', event.id)

  // --- All checkout.session.completed events ---
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const variant = session.metadata?.variant
    const size = session.metadata?.size
    const plan = session.metadata?.plan as 'monthly' | 'annual' | 'team-credits' | undefined
    const metaType = session.metadata?.type
    const email = session.customer_details?.email

    console.log('[stripe webhook] checkout.session.completed metadata', {
      sessionId: session.id, metaType, plan, hasVariant: !!variant, hasSize: !!size,
    })

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
          return NextResponse.json({ received: true, handled: false })
        }
      }
      return NextResponse.json({ received: true })
    }

    // --- Coach self-upload credits ---
    if (metaType === 'coach_self_credits') {
      const coachEmail = session.metadata?.coachEmail?.toLowerCase()
      const quantity = parseInt(session.metadata?.quantity || '0', 10)
      if (coachEmail && quantity > 0) {
        try {
          await db`
            INSERT INTO coach_credits (email, credits)
            VALUES (${coachEmail}, ${quantity})
            ON CONFLICT (email) DO UPDATE
            SET credits = coach_credits.credits + ${quantity}
          `
        } catch (err) {
          console.error('Failed to grant coach self-credits:', err)
          return NextResponse.json({ received: true, handled: false })
        }
      }
      return NextResponse.json({ received: true })
    }

    // --- Organization token purchase: tokens land in the org's balance ---
    if (metaType === 'org_token_purchase') {
      const orgId = session.metadata?.orgId
      const quantity = parseInt(session.metadata?.quantity || '0', 10)
      if (orgId && quantity > 0) {
        try {
          await db`
            UPDATE organizations
            SET token_balance = COALESCE(token_balance, 0) + ${quantity}
            WHERE id = ${orgId}
          `
          const orgEmail = session.customer_details?.email
          if (orgEmail) {
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://learnhoops.com'
            const orgRows = await db`SELECT name FROM organizations WHERE id = ${orgId}` as unknown as { name: string }[]
            const orgName = orgRows[0]?.name || 'Your Organization'
            try {
              await sendTokenPurchaseConfirmationEmail(orgEmail, orgName, quantity, `${baseUrl}/org/dashboard`)
            } catch {}
          }
        } catch (err) {
          console.error('Failed to credit org token balance:', err)
          return NextResponse.json({ received: true, handled: false })
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
        return NextResponse.json({ received: true, handled: false })
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
          return NextResponse.json({ received: true, handled: false })
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
        return NextResponse.json({ received: true, handled: false })
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
        return NextResponse.json({ received: true, handled: false })
      }

      return NextResponse.json({ received: true })
    }

    // --- Org class package purchase ---
    //
    // One Stripe checkout buys all three things:
    //   1. an org_class_packages row (the token pool, capped at playerCount * 2)
    //   2. a row in `orders` so the shipping queue sees the balls to ship
    //   3. a self-coached "Training Camp" team under the org, capped to playerCount
    //      players via the package link — players join with the team access code
    //      and each gets 2 tokens out of the package pool on join.
    if (metaType === 'org_class_package') {
      const orgId = session.metadata?.orgId
      const orgName = session.metadata?.orgName || 'Your Organization'
      const playerCount = parseInt(session.metadata?.playerCount || '0', 10)
      const pricePerPlayerCents = parseInt(session.metadata?.pricePerPlayerCents || '0', 10)
      const totalCents = parseInt(session.metadata?.totalCents || '0', 10)
      const size5 = parseInt(session.metadata?.size5 || '0', 10)
      const size6 = parseInt(session.metadata?.size6 || '0', 10)
      const size7 = parseInt(session.metadata?.size7 || '0', 10)
      const ship = session.collected_information?.shipping_details
      const phone = session.customer_details?.phone ?? null
      const orgEmail = session.customer_details?.email ?? null

      console.log('[stripe webhook] org_class_package', { orgId, playerCount, totalCents, size5, size6, size7 })
      if (!orgId || playerCount <= 0) {
        console.warn('[stripe webhook] org_class_package: skipping (missing orgId or playerCount)')
        return NextResponse.json({ received: true })
      }

      let org: { id: string; name: string; admin_email: string } | undefined
      try {
        const orgRows = await db`
          SELECT id, name, admin_email FROM organizations WHERE id = ${orgId}
        ` as unknown as Array<{ id: string; name: string; admin_email: string }>
        org = orgRows[0]
      } catch (err) {
        console.error('[stripe webhook] org_class_package: org lookup failed:', err)
        return NextResponse.json({ received: true, handled: false })
      }
      if (!org) {
        console.error('org_class_package: org not found', orgId)
        return NextResponse.json({ received: true })
      }

      let packageId: string | null = null
      try {
        const inserted = await db`
          INSERT INTO org_class_packages
            (org_id, stripe_session_id, player_count, price_per_player_cents, total_cents, token_pool, status, contact_phone,
             shipping_name, shipping_line1, shipping_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country,
             ball_size_5_count, ball_size_6_count, ball_size_7_count)
          VALUES
            (${orgId}, ${session.id}, ${playerCount}, ${pricePerPlayerCents}, ${totalCents}, ${playerCount * 2}, 'active', ${phone},
             ${ship?.name ?? null}, ${ship?.address?.line1 ?? null}, ${ship?.address?.line2 ?? null},
             ${ship?.address?.city ?? null}, ${ship?.address?.state ?? null},
             ${ship?.address?.postal_code ?? null}, ${ship?.address?.country ?? null},
             ${size5}, ${size6}, ${size7})
          ON CONFLICT (stripe_session_id) DO NOTHING
          RETURNING id
        ` as unknown as Array<{ id: string }>
        packageId = inserted[0]?.id ?? null
      } catch (err) {
        console.error('Failed to create org class package:', err)
        return NextResponse.json({ received: true, handled: false })
      }

      // Webhook redelivery — package already existed, nothing else to do.
      if (!packageId) return NextResponse.json({ received: true })

      // Ball shipment: one order row per non-zero ball size, each carrying its
      // own quantity. Falls back to a single all-size-7 row for legacy orders
      // that didn't pass per-size metadata.
      const sizeRows: Array<{ size: '5' | '6' | '7'; qty: number }> = []
      if (size5 > 0) sizeRows.push({ size: '5', qty: size5 })
      if (size6 > 0) sizeRows.push({ size: '6', qty: size6 })
      if (size7 > 0) sizeRows.push({ size: '7', qty: size7 })
      if (sizeRows.length === 0) sizeRows.push({ size: '7', qty: playerCount })

      try {
        for (const { size: ballSize, qty } of sizeRows) {
          // stripe_session_id is unique on orders, so derive a per-size key
          // for the multi-row case.
          const orderKey = sizeRows.length === 1 ? session.id : `${session.id}__sz${ballSize}`
          await db`
            INSERT INTO orders (
              stripe_session_id, email, customer_name, phone, variant, size,
              amount_total, currency, kind, quantity, class_package_id,
              shipping_name, shipping_line1, shipping_line2,
              shipping_city, shipping_state, shipping_postal_code, shipping_country
            ) VALUES (
              ${orderKey}, ${org.admin_email}, ${ship?.name ?? null}, ${phone},
              'right', ${ballSize},
              ${session.amount_total ?? totalCents}, ${session.currency ?? 'usd'},
              'class_package', ${qty}, ${packageId},
              ${ship?.name ?? null}, ${ship?.address?.line1 ?? null}, ${ship?.address?.line2 ?? null},
              ${ship?.address?.city ?? null}, ${ship?.address?.state ?? null},
              ${ship?.address?.postal_code ?? null}, ${ship?.address?.country ?? null}
            )
            ON CONFLICT (stripe_session_id) DO NOTHING
          `
        }
      } catch (err) {
        console.error('Failed to record class package shipment order:', err)
        // Non-fatal — package + team still get created
      }

      // Auto-create the class team. Named to include the player count so the
      // org sees what they bought; coach can rename via the team dashboard.
      let teamAccessCode = ''
      try {
        const { randomInt } = await import('crypto')
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        for (let attempt = 0; attempt < 10; attempt++) {
          let code = ''
          for (let i = 0; i < 8; i++) code += chars[randomInt(chars.length)]
          const collision = await db`SELECT id FROM teams WHERE access_code = ${code}`
          if (collision.length === 0) { teamAccessCode = code; break }
        }
        if (!teamAccessCode) throw new Error('Failed to generate unique access code')

        const teamName = `10-Week Class — ${playerCount} Players`
        // teams.credits is the coach-upload budget (one credit per analysis the
        // org leader / team coach burns). Players don't get personal tokens —
        // the org leader uploads on their behalf out of this credit pool.
        // token_pool is kept in sync for legacy displays.
        await db`
          INSERT INTO teams
            (name, admin_email, password_hash, access_code, organization_id, class_package_id, initiated_at, token_pool, credits)
          VALUES
            (${teamName}, ${org.admin_email}, ${null}, ${teamAccessCode}, ${orgId}, ${packageId}, NOW(), ${playerCount * 2}, ${playerCount * 2})
        `
      } catch (err) {
        console.error('Failed to auto-create class team:', err)
        // Non-fatal — package + order still recorded; org admin can create a team manually
      }

      // Send confirmation email + SMS with team access code
      if (orgEmail && teamAccessCode) {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://learnhoops.com'
        try {
          await sendClassPurchaseConfirmationEmail(orgEmail, orgName, playerCount, teamAccessCode, `${baseUrl}/org/dashboard`)
        } catch (emailErr) {
          console.error('Failed to send class purchase confirmation email:', emailErr)
          // Non-fatal — package and team are created, email can be resent manually
        }
      }

      if (phone && teamAccessCode) {
        try {
          await sendClassPurchaseConfirmationSms(phone, orgName, playerCount, teamAccessCode)
        } catch (smsErr) {
          console.error('Failed to send class purchase confirmation SMS:', smsErr)
          // Non-fatal — email already sent
        }
      }

      return NextResponse.json({ received: true })
    }

    // --- Ball shop order ---
    const name = session.customer_details?.name
    const phone = session.customer_details?.phone
    const ship = session.collected_information?.shipping_details

    // Grant the free shot analyses FIRST, before any validation that could
    // early-return. The order row is nice-to-have; the credits the buyer
    // paid for must always land. Token amounts and routing both come from
    // metadata set at checkout-creation time. Idempotent via
    // processed_stripe_sessions so the success-page safety net can't
    // double-credit if the webhook also runs.
    const tokensToGrant = parseInt(session.metadata?.analysis_tokens ?? '0', 10)
    const recipient = session.metadata?.token_recipient ?? ''
    const emailLower = (email ?? '').toLowerCase()
    if (tokensToGrant > 0) {
      const grant = await grantBallCreditsOnce({
        sessionId: session.id,
        recipient,
        tokensToGrant,
        email: email ?? null,
      })
      console.log('[stripe webhook] ball-order grant result', { sessionId: session.id, ...grant })
    }

    // For guest purchases, the claim token was generated at checkout and is in the
    // metadata. Send a backup email so they can still claim credits if they closed
    // the browser before finishing signup.
    const claimToken = session.metadata?.claim_token
    if (tokensToGrant > 0 && claimToken && !recipient.startsWith('user:') && !recipient.startsWith('team:') && emailLower) {
      try {
        await sendClaimCreditsEmail(emailLower, name || null, tokensToGrant, claimToken)
      } catch (err) {
        console.error('Failed to send claim credits email:', err)
      }
    }

    // Now persist the order row. If validation fails we still log it and
    // return success — the credits were already granted above.
    if (
      !email ||
      (variant !== 'left' && variant !== 'right') ||
      (size !== '5' && size !== '6' && size !== '7')
    ) {
      console.error('[stripe webhook] ball-order: missing/invalid fields, skipping orders insert', {
        sessionId: session.id, hasEmail: !!email, variant, size,
      })
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
      // Tokens were already credited above — don't ask Stripe to retry.
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
