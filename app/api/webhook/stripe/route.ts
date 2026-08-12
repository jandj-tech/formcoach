import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { sendAbandonedCheckoutEmail, sendClaimCreditsEmail, sendClassPurchaseConfirmationEmail, sendTokenPurchaseConfirmationEmail } from '@/lib/email'
import { sendClassPurchaseConfirmationSms } from '@/lib/sms'
import { grantBallCreditsOnce } from '@/lib/grant-ball-credits'
import { claimStripeSession, releaseStripeSessionClaim } from '@/lib/stripe-idempotency'

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

  // --- All completed/paid checkout sessions ---
  // async_payment_succeeded covers delayed payment methods (bank debits etc.)
  // that complete after the checkout.session.completed event fired unpaid.
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object as Stripe.Checkout.Session
    const variant = session.metadata?.variant
    const size = session.metadata?.size
    const plan = session.metadata?.plan as 'monthly' | 'annual' | 'team-credits' | undefined
    const metaType = session.metadata?.type
    const email = session.customer_details?.email

    console.log('[stripe webhook]', event.type, 'metadata', {
      sessionId: session.id, metaType, plan, hasVariant: !!variant, hasSize: !!size,
      paymentStatus: session.payment_status,
    })

    // Never grant on money that hasn't arrived. completed fires with
    // payment_status 'unpaid' for delayed payment methods — the grant then
    // happens on async_payment_succeeded ('paid'). 'no_payment_required'
    // (100%-off comp coupons) still grants.
    if (session.payment_status === 'unpaid') {
      console.log('[stripe webhook] payment not settled yet, skipping grant', { sessionId: session.id })
      return NextResponse.json({ received: true })
    }

    // --- Coach self-upload credits ---
    if (metaType === 'coach_self_credits') {
      const coachEmail = session.metadata?.coachEmail?.toLowerCase()
      const quantity = parseInt(session.metadata?.quantity || '0', 10)
      if (coachEmail && quantity > 0) {
        const claim = await claimStripeSession(session.id, quantity, `coach:${coachEmail}`)
        if (claim === 'already_processed') return NextResponse.json({ received: true })
        try {
          await db`
            INSERT INTO coach_credits (email, credits)
            VALUES (${coachEmail}, ${quantity})
            ON CONFLICT (email) DO UPDATE
            SET credits = coach_credits.credits + ${quantity}
          `
        } catch (err) {
          console.error('Failed to grant coach self-credits:', err)
          if (claim === 'claimed') await releaseStripeSessionClaim(session.id, 'coach_self_credits_failed')
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
        const claim = await claimStripeSession(session.id, quantity, `org:${orgId}`)
        if (claim === 'already_processed') return NextResponse.json({ received: true })
        try {
          await db`
            UPDATE organizations
            SET token_balance = COALESCE(token_balance, 0) + ${quantity}
            WHERE id = ${orgId}
          `
        } catch (err) {
          console.error('Failed to credit org token balance:', err)
          if (claim === 'claimed') await releaseStripeSessionClaim(session.id, 'org_token_purchase_failed')
          return NextResponse.json({ received: true, handled: false })
        }
        // Confirmation email is best-effort — the balance is already credited,
        // so a failure here must NOT release the claim or ask Stripe to retry.
        try {
          const orgEmail = session.customer_details?.email
          if (orgEmail) {
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://learnhoops.com'
            const orgRows = await db`SELECT name FROM organizations WHERE id = ${orgId}` as unknown as { name: string }[]
            const orgName = orgRows[0]?.name || 'Your Organization'
            await sendTokenPurchaseConfirmationEmail(orgEmail, orgName, quantity, `${baseUrl}/org/dashboard`)
          }
        } catch (err) {
          console.error('Failed to send org token purchase confirmation email:', err)
        }
      }
      return NextResponse.json({ received: true })
    }

    // --- Token grant for team/org players ---
    if (metaType === 'team_token_grant') {
      const recipientIds = (session.metadata?.recipientUserIds || '').split(',').filter(Boolean)
      const tokensEach = parseInt(session.metadata?.tokensEach || '1', 10)
      if (recipientIds.length > 0 && tokensEach > 0) {
        const claim = await claimStripeSession(
          session.id,
          tokensEach * recipientIds.length,
          `users:${recipientIds.length}`
        )
        if (claim === 'already_processed') return NextResponse.json({ received: true })
        try {
          for (const uid of recipientIds) {
            await db`UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${tokensEach} WHERE id = ${uid}`
          }
        } catch (err) {
          // A mid-loop failure leaves some players credited; releasing the
          // claim here would re-credit them on retry, so keep it and log
          // loudly for manual follow-up instead.
          console.error('Failed to grant player tokens (PARTIAL GRANT POSSIBLE, session kept claimed):', session.id, err)
          return NextResponse.json({ received: true, handled: false })
        }
      }
      return NextResponse.json({ received: true })
    }

    // --- Team upload credits purchase ---
    if (plan === 'team-credits') {
      const teamId = session.metadata?.teamId
      const quantity = parseInt(session.metadata?.quantity || '0', 10)
      if (teamId && quantity > 0) {
        const claim = await claimStripeSession(session.id, quantity, `team:${teamId}`)
        if (claim === 'already_processed') return NextResponse.json({ received: true })
        try {
          await db`UPDATE teams SET credits = credits + ${quantity} WHERE id = ${teamId}`
        } catch (err) {
          console.error('Failed to credit team uploads:', err)
          if (claim === 'claimed') await releaseStripeSessionClaim(session.id, 'team_credits_failed')
          return NextResponse.json({ received: true, handled: false })
        }
      }
      return NextResponse.json({ received: true })
    }

    // --- Analysis token purchase ---
    if (metaType === 'analysis_token') {
      const userId = session.metadata?.userId
      const emailLower = session.customer_details?.email?.toLowerCase()
      // Historically hardcoded to +1, silently dropping any multi-token buy.
      const quantity = Math.max(1, parseInt(session.metadata?.quantity || '1', 10) || 1)
      const claim = await claimStripeSession(session.id, quantity, userId ? `user:${userId}` : emailLower ?? null)
      if (claim === 'already_processed') return NextResponse.json({ received: true })
      try {
        if (userId) {
          await db`UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${quantity} WHERE id = ${userId}`
        } else if (emailLower) {
          await db`UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${quantity} WHERE email = ${emailLower}`
        }
      } catch (err) {
        console.error('Failed to credit analysis token:', err)
        if (claim === 'claimed') await releaseStripeSessionClaim(session.id, 'analysis_token_failed')
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

    // What the buyer paid for shipping, and on which carrier/service. The
    // carrier and service were stashed on the shipping rate's metadata by
    // the shipping-options endpoint.
    const shippingCostCents = session.shipping_cost?.amount_total ?? null
    let shippingCarrier: string | null = null
    let shippingService: string | null = null
    const shippingRateRef = session.shipping_cost?.shipping_rate
    if (typeof shippingRateRef === 'string') {
      try {
        const rate = await getStripe().shippingRates.retrieve(shippingRateRef)
        shippingCarrier = rate.metadata?.carrier ?? null
        shippingService = rate.metadata?.service ?? rate.display_name ?? null
      } catch (err) {
        console.error('[stripe webhook] shipping rate lookup failed (non-fatal):', err)
      }
    } else if (shippingRateRef) {
      shippingCarrier = shippingRateRef.metadata?.carrier ?? null
      shippingService = shippingRateRef.metadata?.service ?? shippingRateRef.display_name ?? null
    }

    // Shipping was priced from the destination entered in the cart; if the
    // buyer then shipped somewhere materially different at Stripe, flag it
    // for manual review (they may have under/overpaid shipping).
    const quotedDest = session.metadata?.ship_to // "CC:STATE:POSTAL"
    if (quotedDest && ship?.address) {
      const [qCountry, qState] = quotedDest.split(':')
      const mismatch =
        ship.address.country !== qCountry ||
        (qCountry === 'US' && qState && ship.address.state?.toUpperCase() !== qState)
      if (mismatch) {
        console.error('[stripe webhook] ball-order: shipping destination differs from quoted zone — review shipping charged', {
          sessionId: session.id,
          quoted: quotedDest,
          actual: `${ship.address.country}:${ship.address.state ?? ''}:${ship.address.postal_code ?? ''}`,
        })
      }
    }

    // Grant the free shot analyses FIRST, before any validation that could
    // early-return. The order row is nice-to-have; the credits the buyer
    // paid for must always land. Token amounts and routing both come from
    // metadata set at checkout-creation time. Idempotent via
    // processed_stripe_sessions so the success-page safety net can't
    // double-credit if the webhook also runs.
    const tokensToGrant = parseInt(session.metadata?.analysis_tokens ?? '0', 10)
    const recipient = session.metadata?.token_recipient ?? ''
    const emailLower = (email ?? '').toLowerCase()
    const claimToken = session.metadata?.claim_token
    // Guest purchases carry a claim token, and that claim — redeemed at
    // signup/login — is the ONE path that grants their credits. Granting here
    // too (the old behavior) credited the buyer twice.
    const isGuestClaim = !!claimToken && !recipient

    if (tokensToGrant > 0 && !isGuestClaim) {
      const grant = await grantBallCreditsOnce({
        sessionId: session.id,
        recipient,
        tokensToGrant,
        email: email ?? null,
      })
      console.log('[stripe webhook] ball-order grant result', { sessionId: session.id, ...grant })
    }

    let claimConsumed = false
    if (tokensToGrant > 0 && isGuestClaim && emailLower) {
      // If the guest's email already belongs to an account, land the credits
      // there now and consume the claim in the same statement, so logging in
      // later can't redeem it a second time.
      try {
        const credited = (await db`
          WITH claim AS (
            UPDATE pending_credit_claims SET redeemed_at = NOW()
            WHERE claim_token = ${claimToken}
              AND redeemed_at IS NULL
              AND EXISTS (SELECT 1 FROM users WHERE LOWER(email) = ${emailLower})
            RETURNING tokens_to_grant
          )
          UPDATE users
          SET analysis_tokens = COALESCE(analysis_tokens, 0) + (SELECT tokens_to_grant FROM claim)
          WHERE LOWER(email) = ${emailLower} AND EXISTS (SELECT 1 FROM claim)
          RETURNING id
        `) as unknown as Array<{ id: string }>
        claimConsumed = credited.length > 0
        console.log('[stripe webhook] guest ball-order claim', {
          sessionId: session.id, creditedExistingAccount: claimConsumed,
        })
      } catch (err) {
        console.error('[stripe webhook] guest claim auto-credit failed (claim still redeemable):', err)
      }
    }

    // Backup email so a guest who closed the browser before finishing signup
    // can still claim their credits. Skipped when the claim was just consumed.
    if (tokensToGrant > 0 && claimToken && !claimConsumed && !recipient.startsWith('user:') && !recipient.startsWith('team:') && emailLower) {
      try {
        await sendClaimCreditsEmail(emailLower, name || null, tokensToGrant, claimToken)
      } catch (err) {
        console.error('Failed to send claim credits email:', err)
      }
    }

    // Now persist the order rows for the shipping queue. If validation fails
    // we still log it and return success — the credits were already granted.
    // metadata.cart carries the full item list; a cart of 3 balls must become
    // rows totalling quantity 3, not one row that under-ships.
    const isBallVariant = (v: unknown): v is 'left' | 'right' => v === 'left' || v === 'right'
    const isBallSize = (s: unknown): s is '5' | '6' | '7' => s === '5' || s === '6' || s === '7'

    type ShipmentRow = { variant: 'left' | 'right'; size: '5' | '6' | '7'; quantity: number }
    let shipmentRows: ShipmentRow[] = []
    try {
      const cart = session.metadata?.cart ? JSON.parse(session.metadata.cart) : null
      if (Array.isArray(cart)) {
        for (const item of cart) {
          if (item?.productSlug === 'bundle') {
            if (isBallVariant(item.variant1) && isBallSize(item.size1)) {
              shipmentRows.push({ variant: item.variant1, size: item.size1, quantity: 1 })
            }
            if (isBallVariant(item.variant2) && isBallSize(item.size2)) {
              shipmentRows.push({ variant: item.variant2, size: item.size2, quantity: 1 })
            }
          } else if (isBallVariant(item?.variant) && isBallSize(item?.size)) {
            const qty = Math.max(1, Math.floor(Number(item.quantity) || 1))
            shipmentRows.push({ variant: item.variant, size: item.size, quantity: qty })
          }
        }
      }
    } catch (err) {
      console.error('[stripe webhook] ball-order: failed to parse metadata.cart:', err)
      shipmentRows = []
    }

    // Merge duplicate variant+size lines into one row with the summed quantity.
    const merged = new Map<string, ShipmentRow>()
    for (const row of shipmentRows) {
      const key = `${row.variant}|${row.size}`
      const existing = merged.get(key)
      if (existing) existing.quantity += row.quantity
      else merged.set(key, { ...row })
    }
    shipmentRows = [...merged.values()]

    // Legacy sessions / oversized carts without cart metadata: fall back to
    // the single first-ball row. items_count > 1 means the shipping queue is
    // missing items — flag it for manual reconciliation against Stripe.
    if (shipmentRows.length === 0) {
      if (isBallVariant(variant) && isBallSize(size)) {
        shipmentRows.push({ variant, size, quantity: 1 })
        const itemsCount = parseInt(session.metadata?.items_count || '1', 10)
        if (itemsCount > 1) {
          console.error('[stripe webhook] ball-order: no cart metadata but items_count > 1 — order rows are INCOMPLETE, reconcile against Stripe', {
            sessionId: session.id, itemsCount,
          })
        }
      }
    }

    if (!email || shipmentRows.length === 0) {
      console.error('[stripe webhook] ball-order: missing/invalid fields, skipping orders insert', {
        sessionId: session.id, hasEmail: !!email, variant, size,
      })
      return NextResponse.json({ received: true })
    }

    try {
      for (let i = 0; i < shipmentRows.length; i++) {
        const row = shipmentRows[i]
        // stripe_session_id is unique on orders — derive per-row keys for
        // multi-line carts, same convention as the class-package branch.
        // The session's amount_total goes on the first row only, so summing
        // rows never overstates what was actually charged.
        const orderKey = i === 0 ? session.id : `${session.id}__i${i}`
        await db`
          INSERT INTO orders (
            stripe_session_id, email, customer_name, phone, variant, size,
            amount_total, currency, quantity,
            shipping_name, shipping_line1, shipping_line2,
            shipping_city, shipping_state, shipping_postal_code, shipping_country,
            shipping_cost_cents, shipping_carrier, shipping_service
          ) VALUES (
            ${orderKey}, ${email}, ${name ?? null}, ${phone ?? null}, ${row.variant}, ${row.size},
            ${i === 0 ? session.amount_total ?? 0 : 0}, ${session.currency ?? 'usd'}, ${row.quantity},
            ${ship?.name ?? null}, ${ship?.address?.line1 ?? null}, ${ship?.address?.line2 ?? null},
            ${ship?.address?.city ?? null}, ${ship?.address?.state ?? null},
            ${ship?.address?.postal_code ?? null}, ${ship?.address?.country ?? null},
            ${i === 0 ? shippingCostCents : null}, ${i === 0 ? shippingCarrier : null}, ${i === 0 ? shippingService : null}
          )
          ON CONFLICT (stripe_session_id) DO NOTHING
        `
      }
    } catch (err) {
      console.error('Failed to save order:', err)
      // Tokens were already credited above — don't ask Stripe to retry.
    }
  }

  // --- Abandoned checkout: session expired unpaid ---
  // Only ball-shop checkouts opt into recovery (after_expiration is set at
  // creation), and Stripe only includes customer_details when the shopper got
  // far enough to enter an email — together those gate this to warm leads.
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session
    const recoveryUrl = session.after_expiration?.recovery?.url
    const email = session.customer_details?.email?.toLowerCase()

    if (!recoveryUrl || !email) {
      return NextResponse.json({ received: true })
    }

    // Respect unsubscribes.
    const optedOut = await db`
      SELECT 1 FROM email_list WHERE email = ${email} AND unsubscribed_at IS NOT NULL
    `
    if (optedOut.length > 0) {
      console.log('[stripe webhook] abandoned checkout: unsubscribed, skipping', { sessionId: session.id })
      return NextResponse.json({ received: true })
    }

    // Skip if they already completed a purchase since this session was
    // created (e.g. restarted checkout in a new tab and paid there).
    const purchased = await db`
      SELECT 1 FROM orders
      WHERE LOWER(email) = ${email} AND created_at > to_timestamp(${session.created})
      LIMIT 1
    `
    if (purchased.length > 0) {
      console.log('[stripe webhook] abandoned checkout: already purchased, skipping', { sessionId: session.id })
      return NextResponse.json({ received: true })
    }

    try {
      await sendAbandonedCheckoutEmail(email, session.customer_details?.name ?? null, recoveryUrl)
    } catch (err) {
      // Best-effort — never ask Stripe to retry a marketing email.
      console.error('[stripe webhook] abandoned-checkout email failed:', err)
    }
    return NextResponse.json({ received: true })
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
