import { NextRequest, NextResponse } from 'next/server'
import { getShippingOptions } from '@/lib/shipping'

// Powers the cart page's shipping estimator: given a destination (country +
// state or postal code) and ball count, returns the same Standard/Express
// quotes that will be attached to the checkout session.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const country = body?.country
    if (country !== 'US' && country !== 'CA') {
      return NextResponse.json({ error: 'Invalid country' }, { status: 400 })
    }
    const ballCount = Math.min(200, Math.max(1, Math.floor(Number(body?.ballCount) || 1)))
    const currency = country === 'CA' ? 'cad' : 'usd'

    const quotes = await getShippingOptions(
      {
        country,
        state: typeof body?.state === 'string' ? body.state.slice(0, 3) : undefined,
        postalCode: typeof body?.postalCode === 'string' ? body.postalCode.slice(0, 10) : undefined,
      },
      ballCount,
      currency
    )

    return NextResponse.json({
      quotes: quotes.map((q) => ({
        displayName: q.displayName,
        amountCents: q.amountCents,
        currency: q.currency,
        estDaysMin: q.estDaysMin,
        estDaysMax: q.estDaysMax,
      })),
    })
  } catch (err) {
    console.error('[shipping-estimate] failed:', err)
    return NextResponse.json({ error: 'Estimate failed' }, { status: 500 })
  }
}
