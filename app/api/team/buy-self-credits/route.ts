import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { getStripe } from '@/lib/stripe'
import { getTeamTokenState, orgHasInitiatedTeam, TEAM_TOKEN_PRICE_CENTS, REGULAR_ANALYSIS_PRICE_CENTS, discountedUnitCents } from '@/lib/team-tokens'
import { rejectInAppPurchase } from '@/lib/in-app'
import { currencyForRequest } from '@/lib/region'
import { resolveBaseUrl } from '@/lib/base-url'

const BASE_URL = resolveBaseUrl()

// A coach or org owner buys analysis credits for their own shot uploads.
// $1.49 each once their team has 8+ players, $3.49 before.
export async function POST(req: NextRequest) {
  // Digital goods cannot be sold via Stripe inside the iOS app (guideline 3.1.1).
  const inAppBlock = rejectInAppPurchase(req)
  if (inAppBlock) return inAppBlock
  const teamSession = await getTeamSessionFromRequest(req)
  const orgSession = teamSession ? null : await getOrgSessionFromRequest(req)
  if (!teamSession && !orgSession) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { quantity } = await req.json()
    const qty = typeof quantity === 'number' ? Math.floor(quantity) : 1
    if (qty < 1 || qty > 500) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    // A team coach (no org) only gets $1.49 if their own team is initiated.
    // An org owner gets $1.49 once any team in their org is initiated.
    let liveTeam = false
    if (teamSession) {
      const state = await getTeamTokenState(teamSession.teamId)
      liveTeam = !!state?.initiated
    } else {
      liveTeam = await orgHasInitiatedTeam(orgSession!.orgId)
    }

    const coachEmail = teamSession?.adminEmail ?? orgSession!.adminEmail
    const baseAmount = liveTeam ? TEAM_TOKEN_PRICE_CENTS : REGULAR_ANALYSIS_PRICE_CENTS
    // Volume discount comes off whichever base rate applies to this buyer.
    const unitAmount = discountedUnitCents(baseAmount, qty)
    console.log('[buy-self-credits] pricing', { teamId: teamSession?.teamId, orgId: orgSession?.orgId, liveTeam, baseAmount, unitAmount, qty })

    const checkout = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: qty,
          price_data: {
            currency: currencyForRequest(req),
            unit_amount: unitAmount,
            product_data: {
              name: `${qty} Shot Analysis Credit${qty > 1 ? 's' : ''}`,
              description: 'For analyzing your own shots on the Analyze page.',
            },
          },
        },
      ],
      // An org owner's self-credits go into the org token balance; a team
      // coach's go into their personal coach_credits.
      metadata: orgSession
        ? { type: 'org_token_purchase', orgId: orgSession.orgId, quantity: String(qty) }
        : { type: 'coach_self_credits', coachEmail, quantity: String(qty) },
      success_url: `${BASE_URL}/analyze?credits=1`,
      allow_promotion_codes: true,
      cancel_url: `${BASE_URL}/analyze`,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('Coach self-credits checkout error:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
