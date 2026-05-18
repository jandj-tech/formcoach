import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'
import { getTeamTokenState, TEAM_TOKEN_PRICE_CENTS, REGULAR_ANALYSIS_PRICE_CENTS } from '@/lib/team-tokens'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://learnhoops.com'

export async function POST(req: NextRequest) {
  try {
    const session = await getOrgSessionFromRequest(req)
    if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 })

    const { teamId, quantity } = await req.json()
    if (!teamId || !quantity || quantity < 1) {
      return NextResponse.json({ error: 'teamId and quantity required' }, { status: 400 })
    }

    const [team] = await db`
      SELECT id, name FROM teams WHERE id = ${teamId} AND organization_id = ${session.orgId}
    ` as unknown as [{ id: string; name: string } | undefined]
    if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

    // Coach credits: $1.49 once the team is initiated, $2.79 before.
    const state = await getTeamTokenState(team.id)
    const unitAmount = state?.initiated ? TEAM_TOKEN_PRICE_CENTS : REGULAR_ANALYSIS_PRICE_CENTS

    const stripeSession = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity,
        price_data: {
          currency: 'usd',
          unit_amount: unitAmount,
          product_data: { name: `Coach upload credits — ${team.name}` },
        },
      }],
      metadata: { plan: 'team-credits', teamId: team.id, quantity: String(quantity) },
      success_url: `${BASE_URL}/org/dashboard?credits_purchased=1`,
      allow_promotion_codes: true,
      cancel_url: `${BASE_URL}/org/dashboard`,
    })

    return NextResponse.json({ url: stripeSession.url })
  } catch (err) {
    console.error('Org buy-team-credits error:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
