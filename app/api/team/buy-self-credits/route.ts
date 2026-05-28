import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { getStripe } from '@/lib/stripe'
import { getTeamTokenState, orgHasInitiatedTeam, TEAM_TOKEN_PRICE_CENTS, REGULAR_ANALYSIS_PRICE_CENTS } from '@/lib/team-tokens'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL && process.env.NEXT_PUBLIC_BASE_URL !== 'http://localhost:3000'
  ? process.env.NEXT_PUBLIC_BASE_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

// A coach or org owner buys analysis credits for their own shot uploads.
// $1.49 each once their team has 8+ players, $2.79 before.
export async function POST(req: NextRequest) {
  const teamSession = await getTeamSessionFromRequest(req)
  const orgSession = teamSession ? null : await getOrgSessionFromRequest(req)
  if (!teamSession && !orgSession) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { quantity } = await req.json()
    const qty = typeof quantity === 'number' ? Math.floor(quantity) : 1
    if (![1, 5, 10].includes(qty)) {
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
    const unitAmount = liveTeam ? TEAM_TOKEN_PRICE_CENTS : REGULAR_ANALYSIS_PRICE_CENTS

    const checkout = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: qty,
          price_data: {
            currency: 'usd',
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
