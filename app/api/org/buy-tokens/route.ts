import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { TEAM_TOKEN_PRICE_CENTS, REGULAR_ANALYSIS_PRICE_CENTS } from '@/lib/team-pricing'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL && process.env.NEXT_PUBLIC_BASE_URL !== 'http://localhost:3000'
  ? process.env.NEXT_PUBLIC_BASE_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

// An organization buys analysis tokens into its own balance. From there the
// org can assign them to players, give them to a coach, or use them itself.
// $1.49 each once the org has a team with 8+ players, $2.79 before.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { quantity } = await req.json()
    const qty = typeof quantity === 'number' ? Math.floor(quantity) : 1
    if (qty < 1 || qty > 1000) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    // Discounted price unlocks once any team in the org has 8+ players.
    const liveTeams = (await db`
      SELECT 1 FROM teams t
      JOIN team_memberships tm ON tm.team_id = t.id
      WHERE t.organization_id = ${session.orgId}
      GROUP BY t.id HAVING COUNT(tm.user_id) >= 8
      LIMIT 1
    `) as unknown as unknown[]
    const unitAmount = liveTeams.length > 0 ? TEAM_TOKEN_PRICE_CENTS : REGULAR_ANALYSIS_PRICE_CENTS

    const checkout = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: qty,
          price_data: {
            currency: 'usd',
            unit_amount: unitAmount,
            product_data: { name: `${qty} Analysis Token${qty > 1 ? 's' : ''}` },
          },
        },
      ],
      metadata: {
        type: 'org_token_purchase',
        orgId: session.orgId,
        quantity: String(qty),
      },
      success_url: `${BASE_URL}/org/dashboard?tokens_purchased=1`,
      allow_promotion_codes: true,
      cancel_url: `${BASE_URL}/org/dashboard`,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('Org buy-tokens error:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
