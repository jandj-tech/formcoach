import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getHoldByToken } from '@/lib/order-hold'
import { isSizeInStock, OUT_OF_STOCK_SIZES, SIZE_INCHES, type BallSize } from '@/lib/ball-inventory'
import { sendOrderResolvedEmail } from '@/lib/email'

/**
 * A buyer whose out-of-stock order is held swaps to an in-stock size. Pricing
 * is flat across sizes, so this is a straight 1:1 change — no charge, no
 * refund. Clearing fulfillment_hold is what lets the row re-enter the normal
 * ship queue automatically. Single-use via the resolved-at guard.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const token: string = body?.token ?? ''
  const newSize = body?.newSize as BallSize

  if (newSize !== '5' && newSize !== '6' && newSize !== '7') {
    return NextResponse.json({ error: 'Please choose a size.' }, { status: 400 })
  }
  if (!isSizeInStock(newSize)) {
    return NextResponse.json({ error: `The ${SIZE_INCHES[newSize]} is not currently available.` }, { status: 400 })
  }

  const lookup = await getHoldByToken(token)
  if (lookup.state === 'invalid') return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  if (lookup.state === 'expired') return NextResponse.json({ error: 'This link has expired. Please contact support.' }, { status: 410 })
  if (lookup.state === 'resolved') return NextResponse.json({ error: 'This order has already been sorted out.' }, { status: 409 })

  const first = lookup.rows[0]

  // Rewrite the size on ONLY the out-of-stock ball(s) — an in-stock ball in the
  // same order (e.g. the other half of a bundle) keeps its size — but release
  // the whole order's hold and mark it resolved, so every row ships. Guarded on
  // unresolved so a double submit can't apply twice.
  const oosSizes = [...OUT_OF_STOCK_SIZES]
  const updated = (await db`
    UPDATE orders
    SET size = CASE WHEN size = ANY(${oosSizes}::text[]) THEN ${newSize} ELSE size END,
        fulfillment_hold = FALSE,
        hold_resolved_at = NOW(), hold_resolution = 'swapped'
    WHERE hold_token = ${token} AND hold_resolved_at IS NULL
    RETURNING id
  `) as unknown as Array<{ id: string }>
  if (updated.length === 0) {
    return NextResponse.json({ error: 'This order has already been sorted out.' }, { status: 409 })
  }

  const sizeLabel = `${SIZE_INCHES[newSize]} (Size ${newSize})`
  try {
    await sendOrderResolvedEmail(first.email, first.customer_name, 'swapped', sizeLabel)
  } catch (err) {
    console.error('[resolve/swap] confirmation email failed (swap still applied):', err)
  }

  return NextResponse.json({ ok: true, resolution: 'swapped', size: newSize, sizeLabel })
}
