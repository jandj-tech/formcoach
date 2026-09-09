/**
 * Backfills `orders.stripe_payment_intent_id` from Stripe.
 *
 * The ball-shop and class-package webhook branches never wrote the payment
 * intent onto the order row (fixed going forward in the Size-7 out-of-stock
 * PR), so `charge.refunded` — which matches an order by its payment intent —
 * could never attribute a refund to a historical ball order, and the new
 * refund/swap resolve flow can't refund one either without this value. This
 * walks every order missing a payment intent, looks it up on its checkout
 * session, and fills it in.
 *
 * Safe to run repeatedly and safe to interrupt: it only ever UPDATEs rows whose
 * `stripe_payment_intent_id` is still NULL, and never touches anything else.
 * Rows whose session has no payment intent (subscriptions, 100%-off comps) are
 * left NULL — there is nothing to attribute a charge refund to.
 *
 *   npx tsx scripts/backfill-order-payment-intents.ts --dry   (show what would change)
 *   npx tsx scripts/backfill-order-payment-intents.ts         (write them)
 */
import { readFileSync } from 'fs'
import path from 'path'

for (const line of readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
}

const DRY = process.argv.includes('--dry')

/** Multi-line orders store derived keys (`cs_xxx__i1`, `cs_xxx__sz7`); the real
 *  Stripe session id is everything before the first `__`. */
function realSessionId(orderKey: string): string {
  return orderKey.split('__')[0]
}

async function main() {
  const { getStripe } = await import('../lib/stripe')
  const { db } = await import('../lib/db')
  const stripe = getStripe()

  const rows = (await db`
    SELECT id, stripe_session_id
    FROM orders
    WHERE stripe_payment_intent_id IS NULL
  `) as unknown as Array<{ id: string; stripe_session_id: string }>

  // Group the row ids under their real checkout session, so a multi-line order
  // hits Stripe once, not once per line. Only genuine checkout sessions ('cs_')
  // can be retrieved; anything else is left as-is.
  const bySession = new Map<string, string[]>()
  let skippedNonSession = 0
  for (const r of rows) {
    const sid = realSessionId(r.stripe_session_id)
    if (!sid.startsWith('cs_')) { skippedNonSession++; continue }
    const list = bySession.get(sid) ?? []
    list.push(r.id)
    bySession.set(sid, list)
  }

  let updated = 0
  let skippedNoPi = 0
  let skippedLookupFailed = 0

  for (const [sid, ids] of bySession) {
    let paymentIntentId: string | null = null
    try {
      const session = await stripe.checkout.sessions.retrieve(sid)
      paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null
    } catch (err) {
      skippedLookupFailed += ids.length
      console.warn(`  lookup failed for ${sid} (${ids.length} row${ids.length === 1 ? '' : 's'}):`, err instanceof Error ? err.message : err)
      continue
    }

    if (!paymentIntentId) { skippedNoPi += ids.length; continue }

    console.log(`${DRY ? 'would set' : 'setting '}  ${sid}  →  ${paymentIntentId}  (${ids.length} row${ids.length === 1 ? '' : 's'})`)

    if (!DRY) {
      const res = (await db`
        UPDATE orders
        SET stripe_payment_intent_id = ${paymentIntentId}
        WHERE id = ANY(${ids}::uuid[]) AND stripe_payment_intent_id IS NULL
        RETURNING id
      `) as unknown as Array<{ id: string }>
      updated += res.length
    } else {
      updated += ids.length
    }
  }

  console.log(
    `\n${DRY ? 'would update' : 'updated'} ${updated}` +
      ` | session had no payment intent ${skippedNoPi}` +
      ` | lookup failed ${skippedLookupFailed}` +
      ` | non-session keys ${skippedNonSession}` +
      ` | rows missing a PI seen ${rows.length}`,
  )
  await db.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
