import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { grantBallCreditsOnce } from '@/lib/grant-ball-credits'

// Safety net for the free-analysis grant — the success page calls this
// after Stripe redirects back. The webhook is the primary path; this
// route exists so a missed webhook (signature mismatch, queue backlog,
// dropped delivery) can't strand the credits the buyer paid for.
// Idempotency lives in grantBallCreditsOnce via processed_stripe_sessions.
export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json().catch(() => ({}))
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }

    const session = await getStripe().checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      return NextResponse.json({ granted: false, reason: 'not_paid' })
    }

    const tokensToGrant = parseInt(session.metadata?.analysis_tokens ?? '0', 10)
    const recipient = session.metadata?.token_recipient ?? ''
    const email = session.customer_details?.email ?? null

    const result = await grantBallCreditsOnce({
      sessionId,
      recipient,
      tokensToGrant,
      email,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[shop/claim-credits] failed:', err)
    return NextResponse.json({ error: 'claim failed' }, { status: 500 })
  }
}
