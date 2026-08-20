import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getStripe } from '@/lib/stripe'
import { getTeamTokenState, TEAM_TOKEN_PRICE_CENTS, REGULAR_ANALYSIS_PRICE_CENTS, discountedUnitCents } from '@/lib/team-tokens'
import { rejectInAppPurchase } from '@/lib/in-app'
import { currencyForRequest } from '@/lib/region'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL && process.env.NEXT_PUBLIC_BASE_URL !== 'http://localhost:3000'
  ? process.env.NEXT_PUBLIC_BASE_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

export async function POST(req: NextRequest) {
  // Digital goods cannot be sold via Stripe inside the iOS app (guideline 3.1.1).
  const inAppBlock = rejectInAppPurchase(req)
  if (inAppBlock) return inAppBlock
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
    if (qty < 1 || qty > 1000) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    const ids = playerUserIds.filter((id: unknown): id is string => typeof id === 'string' && !!id)
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Select at least one player' }, { status: 400 })
    }

    // $0.99 per token once the team has 8+ players, $3.49 before.
    const state = await getTeamTokenState(session.teamId)
    const baseAmount = state?.initiated ? TEAM_TOKEN_PRICE_CENTS : REGULAR_ANALYSIS_PRICE_CENTS

    const totalTokens = ids.length * qty
    // The tier is set by the whole order — tokens per player x number of players.
    const unitAmount = discountedUnitCents(baseAmount, totalTokens)

    const checkout = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: totalTokens,
          price_data: {
            currency: currencyForRequest(req),
            unit_amount: unitAmount,
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
      allow_promotion_codes: true,
      cancel_url: `${BASE_URL}/team/dashboard`,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('Team player tokens checkout error:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
