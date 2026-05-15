import { NextRequest, NextResponse } from 'next/server'
import { getStripe, PRODUCT, BUNDLE } from '@/lib/stripe'
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

type IncomingBallItem = {
  productSlug: 'ball'
  variant?: string
  size?: string
  quantity?: number
}

type IncomingBundleItem = {
  productSlug: 'bundle'
  variant1?: string
  size1?: string
  variant2?: string
  size2?: string
}

type IncomingItem = IncomingBallItem | IncomingBundleItem | { productSlug?: string; variant?: string; size?: string; quantity?: number }

function variantLabel(v: string) {
  return v === 'left' ? 'Left-handed' : 'Right-handed'
}

function sizeLabel(s: string) {
  return `Size ${s} (${SIZE_INCHES[s]})`
}

function validateVariant(v: unknown): asserts v is 'left' | 'right' {
  if (v !== 'left' && v !== 'right') throw new Error('Invalid variant')
}

function validateSize(s: unknown): asserts s is '5' | '6' | '7' {
  if (s !== '5' && s !== '6' && s !== '7') throw new Error('Invalid size')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const region = body?.region

    if (region !== 'US' && region !== 'CA') {
      return NextResponse.json({ error: 'Invalid region' }, { status: 400 })
    }

    const rawItems: IncomingItem[] = Array.isArray(body?.items)
      ? body.items
      : [{ variant: body?.variant, size: body?.size, quantity: 1, productSlug: 'ball' }]

    if (rawItems.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
    }

    let currency: 'usd' | 'cad' = 'usd'
    let unitAmount = PRODUCT.priceCents
    let ball1Amount = BUNDLE.ball1PriceCents
    let ball2Amount = BUNDLE.ball2PriceCents

    if (region === 'CA') {
      const rate = await getUsdToCadRate()
      currency = 'cad'
      unitAmount = Math.round(PRODUCT.priceCents * rate)
      ball1Amount = Math.round(BUNDLE.ball1PriceCents * rate)
      ball2Amount = Math.round(BUNDLE.ball2PriceCents * rate)
    }

    const line_items: {
      quantity: number
      price_data: {
        currency: string
        unit_amount: number
        product_data: { name: string; description: string }
      }
    }[] = []

    let hasBundles = false
    let firstBallVariant: string | undefined
    let firstBallSize: string | undefined

    for (const it of rawItems) {
      if (it.productSlug === 'bundle') {
        const bundleItem = it as IncomingBundleItem
        validateVariant(bundleItem.variant1)
        validateSize(bundleItem.size1)
        validateVariant(bundleItem.variant2)
        validateSize(bundleItem.size2)

        if (!firstBallVariant) {
          firstBallVariant = bundleItem.variant1
          firstBallSize = bundleItem.size1
        }

        hasBundles = true
        line_items.push({
          quantity: 1,
          price_data: {
            currency,
            unit_amount: ball1Amount,
            product_data: {
              name: `${PRODUCT.name} — ${variantLabel(bundleItem.variant1)}, ${sizeLabel(bundleItem.size1)} (Bundle Ball 1)`,
              description: 'Co-designed with Maple Basketball.',
            },
          },
        })
        line_items.push({
          quantity: 1,
          price_data: {
            currency,
            unit_amount: ball2Amount,
            product_data: {
              name: `${PRODUCT.name} — ${variantLabel(bundleItem.variant2)}, ${sizeLabel(bundleItem.size2)} (Bundle Ball 2 — 50% off)`,
              description: 'Co-designed with Maple Basketball.',
            },
          },
        })
      } else {
        const ballItem = it as IncomingBallItem
        validateVariant(ballItem.variant)
        validateSize(ballItem.size)
        const qty = typeof ballItem.quantity === 'number' ? Math.floor(ballItem.quantity) : 1
        if (qty < 1 || qty > 99) throw new Error('Invalid quantity')

        if (!firstBallVariant) {
          firstBallVariant = ballItem.variant
          firstBallSize = ballItem.size
        }

        line_items.push({
          quantity: qty,
          price_data: {
            currency,
            unit_amount: unitAmount,
            product_data: {
              name: `${PRODUCT.name} — ${variantLabel(ballItem.variant)}, ${sizeLabel(ballItem.size)}`,
              description: 'Co-designed with Maple Basketball.',
            },
          },
        })
      }
    }

    const metadata: Record<string, string> = {
      region,
      variant: firstBallVariant ?? '',
      size: firstBallSize ?? '',
      items_count: String(rawItems.length),
    }

    if (hasBundles) {
      metadata.bundle_uploads = String(BUNDLE.uploadsGranted)
    }

    const cartJson = JSON.stringify(
      rawItems.map((it) =>
        it.productSlug === 'bundle'
          ? { productSlug: 'bundle', variant1: (it as IncomingBundleItem).variant1, size1: (it as IncomingBundleItem).size1, variant2: (it as IncomingBundleItem).variant2, size2: (it as IncomingBundleItem).size2 }
          : { productSlug: 'ball', variant: (it as IncomingBallItem).variant, size: (it as IncomingBallItem).size, quantity: (it as IncomingBallItem).quantity }
      )
    )
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
