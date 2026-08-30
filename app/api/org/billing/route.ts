import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'

interface OrderRow {
  stripe_session_id: string
  created_at: string
  kind: string | null
  quantity: number | null
  description: string | null
  amount_total: number
  currency: string
  status: string | null
  variant: string | null
  size: string | null
}

// Friendly label for rows that predate the `description` column or were
// written by the shop / class flows, which don't set one.
function describeRow(r: OrderRow): string {
  if (r.description) return r.description
  switch (r.kind) {
    case 'class_package':
      return '10-Week Shooting Class package'
    case 'org_tokens':
      return `${r.quantity ?? ''} analysis tokens`.trim()
    case 'team_credits':
      return `${r.quantity ?? ''} team credits`.trim()
    case 'coach_credits':
      return `${r.quantity ?? ''} coach credits`.trim()
    case 'player_tokens':
      return 'Tokens for players'
    case 'analysis_tokens':
      return `${r.quantity ?? ''} analysis tokens`.trim()
    default:
      // Legacy shop rows: variant/size identify a training ball.
      if (r.size) return `Training ball (size ${r.size})`
      return 'Purchase'
  }
}

/**
 * Purchase history for the signed-in organization: every Stripe checkout the
 * webhook recorded that traces back to this org — its own token buys, credits
 * allocated to its teams, class packages, and anything bought under the
 * admin email (training balls, player tokens).
 */
export async function GET(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const rows = (await db`
      SELECT stripe_session_id, created_at, kind, quantity, description,
             amount_total, currency, status, variant, size
      FROM orders
      WHERE (buyer_kind = 'org' AND buyer_ref = ${session.orgId})
         OR (buyer_kind = 'team' AND buyer_ref IN (
              SELECT id::text FROM teams WHERE organization_id = ${session.orgId}
            ))
         OR (class_package_id IN (
              SELECT id FROM org_class_packages WHERE org_id = ${session.orgId}
            ))
         OR (LOWER(email) = LOWER(${session.adminEmail}))
      ORDER BY created_at DESC
      LIMIT 200
    `) as unknown as OrderRow[]

    // Multi-item checkouts (class packages with several ball sizes, carts)
    // are stored as one row per line with a `__`-suffixed session key. Fold
    // them back into one purchase: quantities add up, and the charged total
    // is the max across rows (class rows repeat it; cart rows put it on the
    // first row and 0 on the rest).
    const bySession = new Map<string, {
      id: string
      date: string
      description: string
      kind: string | null
      quantity: number
      amountTotal: number
      currency: string
      status: string
    }>()
    for (const r of rows) {
      const baseId = r.stripe_session_id.split('__')[0]
      const existing = bySession.get(baseId)
      if (existing) {
        existing.quantity += r.quantity ?? 0
        existing.amountTotal = Math.max(existing.amountTotal, r.amount_total ?? 0)
      } else {
        bySession.set(baseId, {
          id: baseId,
          date: r.created_at,
          description: describeRow(r),
          kind: r.kind ?? null,
          quantity: r.quantity ?? 0,
          amountTotal: r.amount_total ?? 0,
          currency: (r.currency || 'usd').toUpperCase(),
          status: r.status || 'paid',
        })
      }
    }

    return NextResponse.json({ purchases: [...bySession.values()] })
  } catch (err) {
    console.error('[org/billing] query failed:', err)
    // The extended orders columns may not exist on an older database — an
    // empty history beats a broken tab.
    return NextResponse.json({ purchases: [] })
  }
}
