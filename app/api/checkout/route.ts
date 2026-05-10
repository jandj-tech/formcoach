import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe, PRODUCT } from '@/lib/stripe'
import { getUsdToCadRate } from '@/lib/fx'

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

type IncomingItem = {
  productSlug?: string
  variant?: string
  size?: string
  quantity?: number
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const region = body?.region

    if (region !== 'US' && region !== 'CA') {
      return NextResponse.json({ error: 'Invalid region' }, { status: 400 })
    }

    // Accept new multi-item shape; fall back to legacy single-item shape.
    const rawItems: IncomingItem[] = Array.isArray(body?.items)
      ? body.items
      : [{ variant: body?.variant, size: body?.size, quantity: 1, productSlug: 'ball' }]

    if (rawItems.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
    }

    const items = rawItems.map((it) => {
      if (it.variant !== 'left' && it.variant !== 'right') {
        throw new Error('Invalid variant')
      }
      if (it.size !== '5' && it.size !== '6' && it.size !== '7') {
        throw new Error('Invalid size')
      }
      const qty = typeof it.quantity === 'number' ? Math.floor(it.quantity) : 1
      if (qty < 1 || qty > 99) {
        throw new Error('Invalid quantity')
      }
      return {
        variant: it.variant as 'left' | 'right',
        size: it.size as '5' | '6' | '7',
        quantity: qty,
      }
    })

    let currency: 'usd' | 'cad' = 'usd'
    let unitAmount = PRODUCT.priceCents
    if (region === 'CA') {
      const rate = await getUsdToCadRate()
      currency = 'cad'
      unitAmount = Math.round(PRODUCT.priceCents * rate)
    }

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((it) => {
      const variantLabel = it.variant === 'left' ? 'Left-handed' : 'Right-handed'
      const sizeLabel = `Size ${it.size} (${SIZE_INCHES[it.size]})`
      return {
        quantity: it.quantity,
        price_data: {
          currency,
          unit_amount: unitAmount,
          product_data: {
            name: `${PRODUCT.name} — ${variantLabel}, ${sizeLabel}`,
            description: 'Co-designed with Maple Basketball.',
          },
        },
      }
    })

    // Keep legacy variant/size in metadata (first item) so the existing webhook
    // continues to work without a schema change. Full cart is also stringified
    // for future use.
    const first = items[0]
    const cartJson = JSON.stringify(items)
    const metadata: Record<string, string> = {
      region,
      variant: first.variant,
      size: first.size,
      items_count: String(items.length),
    }
    if (cartJson.length <= 480) {
      metadata.cart = cartJson
    }

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      phone_number_collection: { enabled: true },
      metadata,
      success_url: `${BASE_URL}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/cart`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Checkout error:', err)
    const message = err instanceof Error ? err.message : 'Checkout failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
