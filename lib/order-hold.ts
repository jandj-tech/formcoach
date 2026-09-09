import { db } from '@/lib/db'
import type { BallSize } from '@/lib/ball-inventory'

/**
 * A held ball order, looked up by its unauthenticated resolution token. The
 * token is the whole security boundary (same trust model as password-reset /
 * invite tokens): 32 random bytes, single-use via hold_resolved_at, time-boxed
 * via hold_token_expires. Every row of one checkout session shares the token.
 */
export type HoldOrderRow = {
  id: string
  stripe_session_id: string
  email: string
  customer_name: string | null
  size: BallSize
  variant: 'left' | 'right'
  quantity: number
  amount_total: number
  currency: string
  stripe_payment_intent_id: string | null
  hold_token_expires: string | null
  hold_resolved_at: string | null
  hold_resolution: string | null
}

export type HoldLookup =
  | { state: 'invalid' }
  | { state: 'resolved'; resolution: string; rows: HoldOrderRow[] }
  | { state: 'expired'; rows: HoldOrderRow[] }
  | { state: 'open'; rows: HoldOrderRow[] }

/** Validates the token shape, then classifies the order's current state. */
export async function getHoldByToken(token: string): Promise<HoldLookup> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return { state: 'invalid' }
  const rows = (await db`
    SELECT id, stripe_session_id, email, customer_name, size, variant, quantity,
           amount_total, currency, stripe_payment_intent_id,
           hold_token_expires, hold_resolved_at, hold_resolution
    FROM orders WHERE hold_token = ${token}
  `) as unknown as HoldOrderRow[]
  if (rows.length === 0) return { state: 'invalid' }
  if (rows.some((r) => r.hold_resolved_at)) {
    return {
      state: 'resolved',
      resolution: rows.find((r) => r.hold_resolution)?.hold_resolution ?? 'resolved',
      rows,
    }
  }
  const exp = rows[0].hold_token_expires
  if (exp && new Date(exp).getTime() < Date.now()) return { state: 'expired', rows }
  return { state: 'open', rows }
}
