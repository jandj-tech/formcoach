import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { getStripe } from '@/lib/stripe'
import { getTeamTokenState } from '@/lib/team-tokens'
import { db } from '@/lib/db'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL && process.env.NEXT_PUBLIC_BASE_URL !== 'http://localhost:3000'
  ? process.env.NEXT_PUBLIC_BASE_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

// A coach or org owner buys analysis credits for their own shot uploads.
// $2.50 each once their team is initiated, $4.99 otherwise.
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

    // $2.50 if their team is initiated, $4.99 otherwise.
    let initiated = false
    if (teamSession) {
      const state = await getTeamTokenState(teamSession.teamId)
      initiated = !!state?.initiated
    } else {
      const rows = (await db`
        SELECT 1 FROM teams
        WHERE organization_id = ${orgSession!.orgId} AND initiated_at IS NOT NULL
        LIMIT 1
      `) as unknown as unknown[]
      initiated = rows.length > 0
    }

    const coachEmail = teamSession?.adminEmail ?? orgSession!.adminEmail
    const unitAmount = initiated ? 250 : 499

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
      metadata: {
        type: 'coach_self_credits',
        coachEmail,
        quantity: String(qty),
      },
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
