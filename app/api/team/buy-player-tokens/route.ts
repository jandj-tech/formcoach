import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { db } from '@/lib/db'
import { discountedUnitCents } from '@/lib/team-tokens'
import { teamTier } from '@/lib/team-features'
import { rejectInAppPurchase } from '@/lib/in-app'
import { currencyForRequest } from '@/lib/region'
import { resolveBaseUrl } from '@/lib/base-url'
import { membershipStripe } from '@/lib/org-membership-stripe'
import {
  attachGrantSession,
  createPendingTokenGrant,
  deletePendingTokenGrant,
  MAX_GRANT_RECIPIENTS,
} from '@/lib/token-grants'

const BASE_URL = resolveBaseUrl()
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

    const ids = [...new Set(playerUserIds.filter((id: unknown): id is string => typeof id === 'string' && UUID_RE.test(id)))]
    if (ids.length === 0 || ids.length !== playerUserIds.length) {
      return NextResponse.json({ error: 'Select at least one player' }, { status: 400 })
    }
    if (ids.length > MAX_GRANT_RECIPIENTS) {
      return NextResponse.json({ error: `At most ${MAX_GRANT_RECIPIENTS} players per order` }, { status: 400 })
    }

    // Every recipient must be on the coach's own team.
    const owned = (await db`
      SELECT user_id::text AS user_id FROM team_memberships
      WHERE team_id = ${session.teamId} AND user_id::text = ANY(${ids}::text[])
    `) as unknown as Array<{ user_id: string }>
    if (owned.length !== ids.length) {
      return NextResponse.json({ error: 'One or more players are not on your team' }, { status: 403 })
    }

    // A team in a lapsed organization pays the regular rate on new tokens.
    const tier = await teamTier(session.teamId)

    const totalTokens = ids.length * qty
    // The tier is set by the whole order — tokens per player x number of players.
    const unitAmount = discountedUnitCents(tier, totalTokens)

    // Recipients live server-side; metadata only points at them.
    const grantId = await createPendingTokenGrant({
      buyerKind: 'team', buyerRef: session.teamId, recipientUserIds: ids, tokensEach: qty,
    })
    let checkout
    try {
      checkout = await membershipStripe().createCheckout({
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
          grantId,
          tokensEach: String(qty),
          recipientCount: String(ids.length),
          teamId: session.teamId,
        },
        success_url: `${BASE_URL}/team/dashboard?tokens_purchased=1`,
        allow_promotion_codes: true,
        cancel_url: `${BASE_URL}/team/dashboard`,
      })
    } catch (err) {
      await deletePendingTokenGrant(grantId)
      throw err
    }
    await attachGrantSession(grantId, checkout.id)

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('Team player tokens checkout error:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
