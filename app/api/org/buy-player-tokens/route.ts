import { NextRequest, NextResponse } from 'next/server'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'
import { discountedUnitCents } from '@/lib/team-tokens'
import { orgTierById } from '@/lib/team-features'
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
    // A lapsed organization pays the regular rate on new purchases. Tokens it
    // already bought keep working — see lib/team-features.ts.
    const tier = await orgTierById(session.orgId)
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

    // Every recipient must be rostered on one of THIS org's teams — the old
    // route credited whatever user ids it was sent.
    const owned = (await db`
      SELECT DISTINCT tm.user_id::text AS user_id
      FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
      WHERE t.organization_id = ${session.orgId} AND tm.user_id::text = ANY(${ids}::text[])
    `) as unknown as Array<{ user_id: string }>
    if (owned.length !== ids.length) {
      return NextResponse.json({ error: 'One or more players are not on your teams' }, { status: 403 })
    }

    const totalTokens = ids.length * qty
    // The tier is set by the whole order — tokens per player x number of players.
    const unitAmount = discountedUnitCents(tier, totalTokens)
    console.log('[buy-player-tokens] org pricing', { orgId: session.orgId, teamId, tier, unitAmount, totalTokens })

    // Recipients live server-side; metadata only points at them.
    const grantId = await createPendingTokenGrant({
      buyerKind: 'org', buyerRef: session.orgId, recipientUserIds: ids, tokensEach: qty,
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
          orgId: session.orgId,
        },
        success_url: `${BASE_URL}/org/dashboard?tokens_purchased=1`,
        allow_promotion_codes: true,
        cancel_url: `${BASE_URL}/org/dashboard`,
      })
    } catch (err) {
      await deletePendingTokenGrant(grantId)
      throw err
    }
    await attachGrantSession(grantId, checkout.id)

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('Org player tokens checkout error:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
