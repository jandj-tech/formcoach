import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireEnv, safeEqual } from '@/lib/env'

// Consumable token products and how many analysis tokens each grants.
// token3 is no longer sold in the app but stays mapped so a pending or
// restored old purchase still credits.
const TOKEN_PRODUCTS: Record<string, number> = {
  'com.learnhoops.app.token': 1,
  'com.learnhoops.app.token3': 3,
  'com.learnhoops.app.token5': 5,
}
const PURCHASE_EVENT_TYPES = ['INITIAL_PURCHASE', 'NON_SUBSCRIPTION_PURCHASE', 'NON_RENEWING_PURCHASE']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Auto-renewable membership products → the plan they grant. Apple-billed
// memberships are mirrored onto the SAME users.plan columns the Stripe flow
// writes (lib/player-subscription.ts), so the weekly/monthly allowance logic
// is identical no matter where the plan was bought. Apple-billed rows keep
// stripe_subscription_id NULL — that is how the dashboard knows to say
// "manage in the App Store" instead of opening the Stripe portal.
const SUBSCRIPTION_PRODUCTS: Record<string, { plan: 'player' | 'pro'; interval: 'monthly' | 'annual' }> = {
  'com.learnhoops.app.player.monthly': { plan: 'player', interval: 'monthly' },
  'com.learnhoops.app.player.yearly': { plan: 'player', interval: 'annual' },
  'com.learnhoops.app.pro.monthly': { plan: 'pro', interval: 'monthly' },
  'com.learnhoops.app.pro.yearly': { plan: 'pro', interval: 'annual' },
}

// Sole source of truth for IAP token grants. The app never credits itself;
// it only polls /api/iap/credit to learn that this webhook has landed.
export async function POST(req: NextRequest) {
  // RevenueCat sends the Authorization header value configured in its
  // webhook settings verbatim; it must equal REVENUECAT_WEBHOOK_SECRET.
  //
  // This used to fall through to "accepting unauthenticated webhooks" when the
  // secret was unset, which let anyone grant themselves analysis tokens by
  // POSTing a forged event naming their own users.id. A missing secret now
  // rejects every call instead of waving it through.
  let secret: string
  try {
    secret = requireEnv('REVENUECAT_WEBHOOK_SECRET')
  } catch {
    console.error('IAP webhook: REVENUECAT_WEBHOOK_SECRET is not set — rejecting webhook')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }

  const auth = req.headers.get('authorization')
  if (!safeEqual(auth, secret) && !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const event = body.event
    if (!event) return NextResponse.json({ ok: true })

    const eventId: string | undefined = event.id ?? event.transaction_id
    if (!eventId) return NextResponse.json({ ok: true })

    // The app calls Purchases.logIn(<users.id>) before purchasing, so one of
    // the subscriber's known ids is our UUID. Anonymous $RCAnonymousID ids
    // can never match (users.id is a UUID column, so filter before querying).
    const candidates = [
      event.app_user_id,
      event.original_app_user_id,
      ...(Array.isArray(event.aliases) ? event.aliases : []),
    ].filter((id): id is string => typeof id === 'string' && UUID_RE.test(id))

    let userId: string | null = null
    for (const candidate of candidates) {
      const [row] = await db`SELECT id FROM users WHERE id = ${candidate}`
      if (row) {
        userId = row.id
        break
      }
    }

    // --- Memberships (auto-renewable subscriptions) ---
    // PRODUCT_CHANGE events describe the switch on new_product_id.
    const subProduct =
      SUBSCRIPTION_PRODUCTS[event.new_product_id ?? ''] ??
      SUBSCRIPTION_PRODUCTS[event.product_id ?? '']
    if (subProduct) {
      // Dedupe on event id via the same ledger the token grants use;
      // tokens_granted 0 keeps these rows invisible to /api/iap/credit.
      const inserted = await db`
        INSERT INTO iap_events (event_id, transaction_id, user_id, product_id, tokens_granted)
        VALUES (${eventId}, ${event.transaction_id ?? null}, ${userId}, ${event.new_product_id ?? event.product_id}, 0)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      `
      if (inserted.length === 0) return NextResponse.json({ ok: true })
      if (!userId) {
        console.error(`IAP webhook: no matching user for subscription event ${eventId} (app_user_id ${event.app_user_id})`)
        return NextResponse.json({ ok: true })
      }

      const type: string = event.type ?? ''
      const purchasedAt = typeof event.purchased_at_ms === 'number' ? new Date(event.purchased_at_ms) : new Date()
      const expiresAt = typeof event.expiration_at_ms === 'number' ? new Date(event.expiration_at_ms) : null

      if (['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE'].includes(type)) {
        // INITIAL_PURCHASE re-anchors the usage windows (a fresh subscription
        // starts fresh weeks); everything else preserves the existing anchor
        // so a renewal never shifts someone's reset day.
        await db`
          UPDATE users
          SET plan = ${subProduct.plan},
              plan_interval = ${subProduct.interval},
              plan_status = 'active',
              plan_cancel_at_period_end = FALSE,
              plan_period_end = ${expiresAt},
              plan_anchor = COALESCE(${type === 'INITIAL_PURCHASE' ? purchasedAt : null}, plan_anchor, ${purchasedAt}),
              stripe_subscription_id = NULL
          WHERE id = ${userId}
        `
      } else if (type === 'CANCELLATION') {
        // Auto-renew switched off (access continues to period end) — unless it
        // was a refund, which ends access immediately.
        if (event.cancel_reason === 'CUSTOMER_SUPPORT') {
          await db`UPDATE users SET plan_status = 'canceled' WHERE id = ${userId}`
        } else {
          await db`UPDATE users SET plan_cancel_at_period_end = TRUE WHERE id = ${userId}`
        }
      } else if (type === 'BILLING_ISSUE') {
        // Grace period — same treatment as Stripe past_due (still entitled).
        await db`UPDATE users SET plan_status = 'past_due' WHERE id = ${userId}`
      } else if (type === 'EXPIRATION') {
        await db`UPDATE users SET plan_status = 'canceled' WHERE id = ${userId}`
      }

      console.log('IAP webhook: subscription event', { eventId, type, userId, plan: subProduct.plan })
      return NextResponse.json({ ok: true })
    }

    // --- Consumable token grants ---
    const tokensForProduct = TOKEN_PRODUCTS[event.product_id ?? '']
    if (!tokensForProduct) return NextResponse.json({ ok: true })
    if (!PURCHASE_EVENT_TYPES.includes(event.type ?? '')) return NextResponse.json({ ok: true })

    const inserted = await db`
      INSERT INTO iap_events (event_id, transaction_id, user_id, product_id, tokens_granted)
      VALUES (${eventId}, ${event.transaction_id ?? null}, ${userId}, ${event.product_id}, ${userId ? tokensForProduct : 0})
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `
    if (inserted.length > 0 && userId) {
      await db`
        UPDATE users
        SET analysis_tokens = COALESCE(analysis_tokens, 0) + ${tokensForProduct}
        WHERE id = ${userId}
      `
    }
    if (!userId) {
      console.error(`IAP webhook: no matching user for event ${eventId} (app_user_id ${event.app_user_id})`)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('IAP webhook error:', err)
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 })
  }
}
