import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getStripe } from '@/lib/stripe'
import { getTeamTokenState } from '@/lib/team-tokens'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL && process.env.NEXT_PUBLIC_BASE_URL !== 'http://localhost:3000'
  ? process.env.NEXT_PUBLIC_BASE_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { playerUserIds, quantity } = await req.json()

    if (!Array.isArray(playerUserIds) || playerUserIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one player' }, { status: 400 })
    }
    const qty = typeof quantity === 'number' ? Math.floor(quantity) : 1
    if (![1, 5, 10].includes(qty)) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    const ids = playerUserIds.filter((id: unknown): id is string => typeof id === 'string' && !!id)
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Select at least one player' }, { status: 400 })
    }

    // The team must be initiated before $2.50 tokens can be bought.
    const state = await getTeamTokenState(session.teamId)
    if (!state || !state.initiated) {
      return NextResponse.json(
        { error: 'Complete your team’s initiation package before buying tokens' },
        { status: 400 },
      )
    }

    const totalTokens = ids.length * qty

    const checkout = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: totalTokens,
          price_data: {
            currency: 'usd',
            unit_amount: 250, // $2.50 per analysis token (team/coach rate)
            product_data: {
              name: `${qty} Analysis Token${qty > 1 ? 's' : ''} × ${ids.length} Player${ids.length > 1 ? 's' : ''}`,
            },
          },
        },
      ],
      metadata: {
        type: 'team_token_grant',
        recipientUserIds: ids.join(','),
        tokensEach: String(qty),
        teamId: session.teamId,
      },
      success_url: `${BASE_URL}/team/dashboard?tokens_purchased=1`,
      cancel_url: `${BASE_URL}/team/dashboard`,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('Team player tokens checkout error:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
