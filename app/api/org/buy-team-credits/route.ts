import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'
import { TEAM_TOKEN_PRICE_CENTS, REGULAR_ANALYSIS_PRICE_CENTS, discountedUnitCents } from '@/lib/team-tokens'
import { orgIsEntitledById } from '@/lib/team-features'
import { rejectInAppPurchase } from '@/lib/in-app'
import { currencyForRequest } from '@/lib/region'
import { resolveBaseUrl } from '@/lib/base-url'

const BASE_URL = resolveBaseUrl()

export async function POST(req: NextRequest) {
  // Digital goods cannot be sold via Stripe inside the iOS app (guideline 3.1.1).
  const inAppBlock = rejectInAppPurchase(req)
  if (inAppBlock) return inAppBlock
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

    // Every organization gets the team rate on every buy flow, coach credits
    // included — no roster minimum anywhere.
    // A lapsed organization pays the regular rate on new purchases. Tokens it
    // already bought keep working — see lib/team-features.ts.
    const entitled = await orgIsEntitledById(session.orgId)
    const baseAmount = entitled ? TEAM_TOKEN_PRICE_CENTS : REGULAR_ANALYSIS_PRICE_CENTS
    // Volume discount comes off whichever base rate applies to this buyer.
    const unitAmount = discountedUnitCents(baseAmount, quantity)
    console.log('[buy-team-credits] org pricing', { orgId: session.orgId, teamId: team.id, entitled, baseAmount, unitAmount, quantity })

    const stripeSession = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity,
        price_data: {
          currency: currencyForRequest(req),
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
