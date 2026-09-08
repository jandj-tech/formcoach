import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { getHoldByToken } from '@/lib/order-hold'
import { sendOrderResolvedEmail } from '@/lib/email'

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase() }).format(
    cents / 100,
  )
}

/**
 * A buyer whose out-of-stock order is held chooses a full refund. The hold
 * token is the entire auth boundary — no login (the buyer may be a guest).
 * Single-use: the row is claimed (marked resolved) BEFORE the Stripe call and
 * rolled back if the refund throws, so a double click can't double-refund.
 */
export async function POST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({ token: '' }))
  const lookup = await getHoldByToken(token)
  if (lookup.state === 'invalid') return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  if (lookup.state === 'expired') return NextResponse.json({ error: 'This link has expired. Please contact support.' }, { status: 410 })
  if (lookup.state === 'resolved') return NextResponse.json({ error: 'This order has already been sorted out.' }, { status: 409 })

  const first = lookup.rows[0]

  // Payment intent shares the value charge.refunded matches on. New orders
  // store it; historical rows may not, so fall back to the Checkout Session.
  let paymentIntent = first.stripe_payment_intent_id
  if (!paymentIntent) {
    try {
      const s = await getStripe().checkout.sessions.retrieve(first.stripe_session_id, { expand: ['payment_intent'] })
      paymentIntent = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null
    } catch (err) {
      console.error('[resolve/refund] session lookup failed:', err)
    }
  }
  if (!paymentIntent) {
    return NextResponse.json({ error: "We couldn't locate the payment to refund. Please contact support." }, { status: 422 })
  }

  // Claim first: mark every row of this order resolved, but only if not already.
  const claimed = (await db`
    UPDATE orders
    SET hold_resolved_at = NOW(), hold_resolution = 'refunded', status = 'refunded'
    WHERE hold_token = ${token} AND hold_resolved_at IS NULL
    RETURNING id
  `) as unknown as Array<{ id: string }>
  if (claimed.length === 0) {
    return NextResponse.json({ error: 'This order has already been sorted out.' }, { status: 409 })
  }

  try {
    await getStripe().refunds.create({ payment_intent: paymentIntent })
  } catch (err) {
    // Undo the claim so the buyer (or support) can retry.
    await db`
      UPDATE orders SET hold_resolved_at = NULL, hold_resolution = NULL, status = 'paid'
      WHERE hold_token = ${token} AND hold_resolution = 'refunded'
    `.catch(() => {})
    console.error('[resolve/refund] Stripe refund failed:', err)
    return NextResponse.json({ error: 'The refund could not be processed. Please try again or contact support.' }, { status: 502 })
  }

  const amount = money(first.amount_total ?? 0, first.currency)
  try {
    await sendOrderResolvedEmail(first.email, first.customer_name, 'refunded', amount)
  } catch (err) {
    console.error('[resolve/refund] confirmation email failed (refund still issued):', err)
  }

  return NextResponse.json({ ok: true, resolution: 'refunded', amount })
}
