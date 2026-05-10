import { NextRequest, NextResponse } from 'next/server'
import { getStripe, PRODUCT } from '@/lib/stripe'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL && process.env.NEXT_PUBLIC_BASE_URL !== 'http://localhost:3000'
  ? process.env.NEXT_PUBLIC_BASE_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

const SIZE_INCHES: Record<string, string> = {
  '5': '27.5"',
  '6': '28.5"',
  '7': '29.5"',
}

export async function POST(req: NextRequest) {
  try {
    const { variant, size } = await req.json()

    if (variant !== 'left' && variant !== 'right') {
      return NextResponse.json({ error: 'Invalid variant' }, { status: 400 })
    }
    if (size !== '5' && size !== '6' && size !== '7') {
      return NextResponse.json({ error: 'Invalid size' }, { status: 400 })
    }

    const variantLabel = variant === 'left' ? 'Left-handed' : 'Right-handed'
    const sizeLabel = `Size ${size} (${SIZE_INCHES[size]})`

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: PRODUCT.currency,
            unit_amount: PRODUCT.priceCents,
            product_data: {
              name: `${PRODUCT.name} — ${variantLabel}, ${sizeLabel}`,
              description: 'Co-designed with Maple Basketball.',
            },
          },
        },
      ],
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      phone_number_collection: { enabled: true },
      metadata: { variant, size },
      success_url: `${BASE_URL}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/shop`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Checkout error:', err)
    const message = err instanceof Error ? err.message : 'Checkout failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
