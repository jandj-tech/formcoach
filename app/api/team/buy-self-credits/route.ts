import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { getStripe } from '@/lib/stripe'
import { getTeamTokenState, TEAM_TOKEN_PRICE_CENTS, REGULAR_ANALYSIS_PRICE_CENTS } from '@/lib/team-tokens'
import { db } from '@/lib/db'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL && process.env.NEXT_PUBLIC_BASE_URL !== 'http://localhost:3000'
  ? process.env.NEXT_PUBLIC_BASE_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

// A coach or org owner buys analysis credits for their own shot uploads.
// $1.49 each once their team has 8+ players, $2.79 before.
export async function POST(req: NextRequest) {
  const teamSession = await getTeamSessionFromRequest(req)
  const orgSession = teamSession ? null : await getOrgSessionFromRequest(req)
  if (!teamSession && !orgSession) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { quantity } = await req.json()
    const qty = typeof quantity === 'number' ? Math.floor(quantity) : 1
    if (![1, 5, 10].includes(qty)) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    // $1.49 once the team has 8+ players, $2.79 before. For an org owner,
    // that means at least one of their teams has reached 8 players.
    let liveTeam = false
    if (teamSession) {
      const state = await getTeamTokenState(teamSession.teamId)
      liveTeam = !!state?.initiated
    } else {
      const rows = (await db`
        SELECT 1 FROM teams t
        JOIN team_memberships tm ON tm.team_id = t.id
        WHERE t.organization_id = ${orgSession!.orgId}
        GROUP BY t.id HAVING COUNT(tm.user_id) >= 8
        LIMIT 1
      `) as unknown as unknown[]
      liveTeam = rows.length > 0
    }

    const coachEmail = teamSession?.adminEmail ?? orgSession!.adminEmail
    const unitAmount = liveTeam ? TEAM_TOKEN_PRICE_CENTS : REGULAR_ANALYSIS_PRICE_CENTS

    const checkout = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: qty,
          price_data: {
            currency: 'usd',
            unit_amount: unitAmount,
            product_data: {
              name: `${qty} Shot Analysis Credit${qty > 1 ? 's' : ''}`,
              description: 'For analyzing your own shots on the Analyze page.',
            },
          },
        },
      ],
      metadata: {
        type: 'coach_self_credits',
        coachEmail,
        quantity: String(qty),
      },
      success_url: `${BASE_URL}/analyze?credits=1`,
      allow_promotion_codes: true,
      cancel_url: `${BASE_URL}/analyze`,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('Coach self-credits checkout error:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
