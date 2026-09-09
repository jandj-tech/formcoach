import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'

/**
 * The minimum a success page needs to fire the browser-side Purchase pixel:
 * amount, currency, and the session id used as the dedupe key.
 *
 * Exists because the two biggest groups of buyers never reach /shop/success —
 * a guest ball buyer is sent to /signup to claim their free analyses, and a new
 * subscriber lands on /dashboard. Reading the amount back from Stripe (rather
 * than trusting URL parameters) means a hand-edited link cannot invent a
 * conversion value.
 *
 * Deliberately returns NO customer details: session ids are unguessable, but
 * this endpoint is unauthenticated, so it must never become a way to look up
 * who bought what.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('session_id') ?? ''
  if (!/^cs_[A-Za-z0-9_]{10,120}$/.test(id)) {
    return NextResponse.json({ error: 'Bad session id' }, { status: 400 })
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(id)
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      return NextResponse.json({ paid: false })
    }
    return NextResponse.json({
      paid: true,
      value: (session.amount_total ?? 0) / 100,
      currency: (session.currency ?? 'usd').toUpperCase(),
      eventId: session.id,
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
