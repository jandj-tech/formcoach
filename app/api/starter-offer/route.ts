import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getSessionFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://learnhoops.com'

// One-time new-account offer: 5 analysis tokens for $10 (vs $2.79 each).
const STARTER_TOKENS = 5
const STARTER_PRICE_CENTS = 1000

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session) {
      return NextResponse.json({ error: 'Login required' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({})) as { region?: string }
    const region = body.region ?? 'US'

    // The offer is stamped onto the account at signup and burned by the
    // webhook on purchase, so eligibility is a single row check.
    let eligible = false
    try {
      const [row] = (await db`
        SELECT (starter_offer_used_at IS NULL AND starter_offer_expires_at > NOW()) AS eligible
        FROM users WHERE id = ${session.userId}
      `) as unknown as [{ eligible: boolean } | undefined]
      eligible = !!row?.eligible
    } catch {
      // starter-offer migration not applied yet
    }
    if (!eligible) {
      return NextResponse.json({ error: 'This offer is no longer available.' }, { status: 403 })
    }

    const stripeSession = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: region === 'CA' ? 'cad' : 'usd',
          unit_amount: STARTER_PRICE_CENTS,
          product_data: {
            name: `Starter Pack — ${STARTER_TOKENS} Shot Analyses`,
            description: `One-time new player offer: ${STARTER_TOKENS} AI-powered basketball shot analyses on LearnHoops.com`,
          },
        },
      }],
      customer_email: session.email,
      metadata: {
        type: 'starter_pack',
        userId: session.userId,
        tokens: String(STARTER_TOKENS),
      },
      success_url: `${BASE_URL}/dashboard?starter=1`,
      cancel_url: `${BASE_URL}/dashboard`,
    })

    return NextResponse.json({ url: stripeSession.url })
  } catch (err) {
    console.error('Starter offer error:', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
