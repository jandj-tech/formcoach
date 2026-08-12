import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { getShippingOptions } from '@/lib/shipping'

// Called by the embedded checkout's onShippingDetailsChange handler when the
// buyer completes the address form. Quotes live carrier rates for that
// address and writes them onto the session, so the shipping line the buyer
// sees is the real cost. The response body is passed straight back to
// Stripe's iframe: { type: 'accept' } or { type: 'reject', errorMessage }.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const sessionId: unknown = body?.checkout_session_id
    const details = body?.shipping_details

    if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
      return NextResponse.json({ type: 'reject', errorMessage: 'Invalid session' }, { status: 400 })
    }
    const address = details?.address
    if (!address?.country || (address.country !== 'US' && address.country !== 'CA')) {
      return NextResponse.json({ type: 'reject', errorMessage: 'We only ship to the US and Canada.' })
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.status !== 'open') {
      return NextResponse.json({ type: 'reject', errorMessage: 'This checkout is no longer active.' })
    }
    // Only ball-shop sessions carry ball_count; anything else has no
    // business hitting this endpoint.
    const ballCount = parseInt(session.metadata?.ball_count ?? '0', 10)
    if (!ballCount) {
      return NextResponse.json({ type: 'reject', errorMessage: 'Shipping not available for this order.' })
    }

    const currency = (session.currency === 'cad' ? 'cad' : 'usd') as 'usd' | 'cad'

    // Comp orders were fully free before shipping existed; keep them free so
    // the card-free flow survives (Stripe coupons don't discount shipping).
    const quotes = session.metadata?.comp === '1'
      ? [{
          displayName: 'Free Shipping (comp)',
          amountCents: 0,
          currency,
          carrier: 'comp',
          service: 'comp',
          estDaysMin: 3,
          estDaysMax: 9,
          source: 'live' as const,
        }]
      : await getShippingOptions(
          {
            name: details?.name,
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            state: address.state,
            postalCode: address.postal_code,
            country: address.country,
          },
          ballCount,
          currency
        )

    await stripe.checkout.sessions.update(sessionId, {
      collected_information: {
        shipping_details: {
          name: details?.name || 'Customer',
          address: {
            country: address.country,
            line1: address.line1 || '',
            line2: address.line2 || undefined,
            city: address.city || undefined,
            state: address.state || undefined,
            postal_code: address.postal_code || undefined,
          },
        },
      },
      shipping_options: quotes.map((q) => ({
        shipping_rate_data: {
          display_name: q.displayName,
          type: 'fixed_amount' as const,
          fixed_amount: { amount: q.amountCents, currency: q.currency },
          ...(q.estDaysMin && q.estDaysMax
            ? {
                delivery_estimate: {
                  minimum: { unit: 'business_day' as const, value: q.estDaysMin },
                  maximum: { unit: 'business_day' as const, value: q.estDaysMax },
                },
              }
            : {}),
          // Read back by the webhook to record what carrier/service was paid for.
          metadata: { carrier: q.carrier, service: q.service, source: q.source },
        },
      })),
    })

    return NextResponse.json({ type: 'accept' })
  } catch (err) {
    // getShippingOptions never throws (flat fallback), so failures here are
    // Stripe-side (e.g. session completed mid-update) — reject cleanly.
    console.error('[shipping-options] failed:', err)
    return NextResponse.json({
      type: 'reject',
      errorMessage: 'Could not calculate shipping for that address. Please check it and try again.',
    })
  }
}
