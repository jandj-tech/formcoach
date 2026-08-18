import type Stripe from 'stripe'
import { db } from './db'

/**
 * Records a completed checkout in `orders`, whatever was bought.
 *
 * Ball orders wrote themselves here already; digital purchases — analysis
 * tokens, coach credits, team credits, org tokens — incremented a balance and
 * left no trace, so the only record of a sale was inside Stripe. This puts
 * every purchase in one table so the admin Orders page can show the lot.
 *
 * Two rules, both because this sits in the money path:
 *
 * It NEVER throws. A grant that already succeeded must not be undone, and
 * Stripe must not be asked to retry, because bookkeeping failed.
 *
 * It is idempotent. `stripe_session_id` is unique and the insert does nothing
 * on conflict, so webhook redelivery and the historical backfill can both run
 * as often as they like without doubling a row.
 */
export async function recordPurchase(
  session: Stripe.Checkout.Session,
  fields: {
    kind: string
    description: string
    quantity: number
    /** Falls back to whatever Stripe collected at checkout. */
    email?: string | null
    buyerKind?: 'user' | 'coach' | 'org' | 'team' | null
    buyerRef?: string | null
  },
): Promise<void> {
  try {
    const email = (
      fields.email ??
      session.customer_details?.email ??
      session.customer_email ??
      ''
    )
      .trim()
      .toLowerCase()
    if (!email) return

    await db`
      INSERT INTO orders (
        stripe_session_id, email, customer_name,
        variant, size, amount_total, currency,
        kind, quantity, description, buyer_kind, buyer_ref, status
      ) VALUES (
        ${session.id}, ${email}, ${session.customer_details?.name ?? null},
        NULL, NULL, ${session.amount_total ?? 0}, ${session.currency ?? 'usd'},
        ${fields.kind}, ${Math.max(0, Math.floor(fields.quantity) || 0)},
        ${fields.description}, ${fields.buyerKind ?? null}, ${fields.buyerRef ?? null},
        'paid'
      )
      ON CONFLICT (stripe_session_id) DO NOTHING
    `
  } catch (err) {
    // Deliberately swallowed — see the contract above.
    console.error('[orders] could not record purchase:', fields.kind, err)
  }
}
