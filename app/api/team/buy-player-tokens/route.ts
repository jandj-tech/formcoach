import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getStripe } from '@/lib/stripe'
import { discountedUnitCents } from '@/lib/team-tokens'
import { teamTier } from '@/lib/team-features'
import { rejectInAppPurchase } from '@/lib/in-app'
import { currencyForRequest } from '@/lib/region'
import { resolveBaseUrl } from '@/lib/base-url'

const BASE_URL = resolveBaseUrl()

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

    // A team in a lapsed organization pays the regular rate on new tokens.
    const tier = await teamTier(session.teamId)

    const totalTokens = ids.length * qty
    // The tier is set by the whole order — tokens per player x number of players.
    const unitAmount = discountedUnitCents(tier, totalTokens)

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
