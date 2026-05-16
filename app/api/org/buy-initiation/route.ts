import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
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

// One-time initiation package for a team in the org — unlocks the $2.50 token price.
export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { teamId, quantity } = await req.json()
    if (!teamId || typeof teamId !== 'string') {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }
    const qty = typeof quantity === 'number' ? Math.floor(quantity) : INITIATION_MIN_TOKENS
    if (qty < INITIATION_MIN_TOKENS || qty > 500) {
      return NextResponse.json(
        { error: `The initiation package must include at least ${INITIATION_MIN_TOKENS} tokens` },
        { status: 400 },
      )
    }

    const [team] = (await db`
      SELECT id FROM teams WHERE id = ${teamId} AND organization_id = ${session.orgId}
    `) as unknown as [{ id: string } | undefined]
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    const state = await getTeamTokenState(teamId)
    if (!state) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }
    if (state.initiated) {
      return NextResponse.json({ error: 'This team has already been initiated' }, { status: 400 })
    }
    if (state.playerCount < INITIATION_MIN_PLAYERS) {
      return NextResponse.json(
        { error: `${state.name} needs at least ${INITIATION_MIN_PLAYERS} players before initiation (currently ${state.playerCount})` },
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
              description: `Unlocks the $2.50 token price for ${state.name} and adds ${qty} tokens to the team pool.`,
            },
          },
        },
      ],
      metadata: {
        type: 'team_initiation',
        teamId,
        tokens: String(qty),
      },
      success_url: `${BASE_URL}/org/dashboard?initiated=1`,
      allow_promotion_codes: true,
      cancel_url: `${BASE_URL}/org/dashboard`,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('Org initiation checkout error:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
