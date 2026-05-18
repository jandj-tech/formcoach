import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getStripe } from '@/lib/stripe'
import {
  getTeamTokenState,
  initiationPriceCents,
  INITIATION_MIN_PLAYERS,
  INITIATION_MIN_TOKENS,
} from '@/lib/team-tokens'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL && process.env.NEXT_PUBLIC_BASE_URL !== 'http://localhost:3000'
  ? process.env.NEXT_PUBLIC_BASE_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

// One-time initiation package: unlocks the $1.49 token price for a team.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { quantity } = await req.json()
    const qty = typeof quantity === 'number' ? Math.floor(quantity) : INITIATION_MIN_TOKENS
    if (qty < INITIATION_MIN_TOKENS || qty > 500) {
      return NextResponse.json(
        { error: `The initiation package must include at least ${INITIATION_MIN_TOKENS} tokens` },
        { status: 400 },
      )
    }

    const state = await getTeamTokenState(session.teamId)
    if (!state) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }
    if (state.initiated) {
      return NextResponse.json({ error: 'This team has already been initiated' }, { status: 400 })
    }
    if (state.playerCount < INITIATION_MIN_PLAYERS) {
      return NextResponse.json(
        { error: `Your team needs at least ${INITIATION_MIN_PLAYERS} players before initiation (currently ${state.playerCount})` },
        { status: 400 },
      )
    }

    const checkout = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: initiationPriceCents(qty),
            product_data: {
              name: `Team Initiation Package — ${qty} tokens (${state.name})`,
              description: `Unlocks the $1.49 token price for ${state.name} and adds ${qty} tokens to the team pool.`,
            },
          },
        },
      ],
      metadata: {
        type: 'team_initiation',
        teamId: session.teamId,
        tokens: String(qty),
      },
      success_url: `${BASE_URL}/team/dashboard?initiated=1`,
      allow_promotion_codes: true,
      cancel_url: `${BASE_URL}/team/dashboard`,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('Team initiation checkout error:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
