import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { orgHasInitiatedTeam, TEAM_TOKEN_PRICE_CENTS, REGULAR_ANALYSIS_PRICE_CENTS, discountedUnitCents } from '@/lib/team-tokens'
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
  const session = await getOrgSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { playerUserIds, quantity, teamId } = await req.json()

    if (!Array.isArray(playerUserIds) || playerUserIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one player' }, { status: 400 })
    }
    if (!teamId || typeof teamId !== 'string') {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    // The team must belong to this org.
    const [team] = (await db`
      SELECT id FROM teams WHERE id = ${teamId} AND organization_id = ${session.orgId}
    `) as unknown as [{ id: string } | undefined]
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }
    // Org owners unlock $0.99 org-wide once ANY of their teams is initiated.
    const orgInitiated = await orgHasInitiatedTeam(session.orgId)
    const baseAmount = orgInitiated ? TEAM_TOKEN_PRICE_CENTS : REGULAR_ANALYSIS_PRICE_CENTS
    const qty = typeof quantity === 'number' ? Math.floor(quantity) : 1
    if (qty < 1 || qty > 1000) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    const ids = playerUserIds.filter((id: unknown): id is string => typeof id === 'string' && !!id)
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Select at least one player' }, { status: 400 })
    }

    const totalTokens = ids.length * qty
    // The tier is set by the whole order — tokens per player x number of players.
    const unitAmount = discountedUnitCents(baseAmount, totalTokens)
    console.log('[buy-player-tokens] org pricing', { orgId: session.orgId, teamId, orgInitiated, baseAmount, unitAmount, totalTokens })

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
        orgId: session.orgId,
      },
      success_url: `${BASE_URL}/org/dashboard?tokens_purchased=1`,
      allow_promotion_codes: true,
      cancel_url: `${BASE_URL}/org/dashboard`,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('Org player tokens checkout error:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
