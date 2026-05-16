import { NextRequest, NextResponse } from 'next/server'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getStripe } from '@/lib/stripe'
import { getTeamTokenState } from '@/lib/team-tokens'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL && process.env.NEXT_PUBLIC_BASE_URL !== 'http://localhost:3000'
  ? process.env.NEXT_PUBLIC_BASE_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

// A coach buys analysis credits for their own shot uploads ("My Uploads").
// $2.50 each once their team is initiated, $5.00 otherwise.
export async function POST(req: NextRequest) {
  const session = await getTeamSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { quantity } = await req.json()
    const qty = typeof quantity === 'number' ? Math.floor(quantity) : 1
    if (![1, 5, 10].includes(qty)) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    const state = await getTeamTokenState(session.teamId)
    const initiated = !!state?.initiated
    const unitAmount = initiated ? 250 : 500

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
              name: `${qty} Shot Analysis Credit${qty > 1 ? 's' : ''} — coach`,
              description: 'For analyzing your own shots in the My Uploads section.',
            },
          },
        },
      ],
      metadata: {
        type: 'coach_self_credits',
        coachEmail: session.adminEmail,
        quantity: String(qty),
      },
      success_url: `${BASE_URL}/team/dashboard?self_credits=1`,
      cancel_url: `${BASE_URL}/team/dashboard`,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (err) {
    console.error('Coach self-credits checkout error:', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
