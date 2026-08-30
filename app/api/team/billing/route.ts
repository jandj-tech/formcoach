import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
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
  size: string | null
}

function describeRow(r: OrderRow): string {
  if (r.description) return r.description
  switch (r.kind) {
    case 'team_credits':
      return `${r.quantity ?? ''} team credits`.trim()
    case 'coach_credits':
      return `${r.quantity ?? ''} coach credits`.trim()
    case 'player_tokens':
      return 'Tokens for players'
    case 'analysis_tokens':
      return `${r.quantity ?? ''} analysis tokens`.trim()
    default:
      if (r.size) return `Training ball (size ${r.size})`
      return 'Purchase'
  }
}

/**
 * Purchase history for the signed-in coach: their personal credit buys,
 * credit purchases for this team, and anything bought under their email.
 */
export async function GET(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const rows = (await db`
      SELECT stripe_session_id, created_at, kind, quantity, description,
             amount_total, currency, status, size
      FROM orders
      WHERE (buyer_kind = 'coach' AND LOWER(buyer_ref) = LOWER(${session.adminEmail}))
         OR (buyer_kind = 'team' AND buyer_ref = ${session.teamId})
         OR (LOWER(email) = LOWER(${session.adminEmail}))
      ORDER BY created_at DESC
      LIMIT 200
    `) as unknown as OrderRow[]

    // Fold multi-row checkouts (carts) back into one purchase per session —
    // see app/api/org/billing for the row-key convention.
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
    console.error('[team/billing] query failed:', err)
    return NextResponse.json({ purchases: [] })
  }
}
