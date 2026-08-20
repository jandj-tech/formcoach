import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Consumable token products and how many analysis tokens each grants.
const TOKEN_PRODUCTS: Record<string, number> = {
  'com.learnhoops.app.token': 1,
  'com.learnhoops.app.token3': 3,
  'com.learnhoops.app.token5': 5,
}
const PURCHASE_EVENT_TYPES = ['INITIAL_PURCHASE', 'NON_SUBSCRIPTION_PURCHASE', 'NON_RENEWING_PURCHASE']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Sole source of truth for IAP token grants. The app never credits itself;
// it only polls /api/iap/credit to learn that this webhook has landed.
export async function POST(req: NextRequest) {
  // RevenueCat sends the Authorization header value configured in its
  // webhook settings verbatim; it must equal REVENUECAT_WEBHOOK_SECRET.
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else {
    console.error('IAP webhook: REVENUECAT_WEBHOOK_SECRET is not set — accepting unauthenticated webhooks')
  }

  try {
    const body = await req.json()
    const event = body.event
    if (!event) return NextResponse.json({ ok: true })

    const tokensForProduct = TOKEN_PRODUCTS[event.product_id ?? '']
    if (!tokensForProduct) return NextResponse.json({ ok: true })
    if (!PURCHASE_EVENT_TYPES.includes(event.type ?? '')) return NextResponse.json({ ok: true })

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
