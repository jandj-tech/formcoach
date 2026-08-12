import { NextRequest, NextResponse } from 'next/server'
import { getStripe, PRODUCT, BUNDLE, BALL_ANALYSES_GRANTED } from '@/lib/stripe'
import { getSessionFromRequest } from '@/lib/auth'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { db } from '@/lib/db'
import { isValidCompCode, getCompCouponId } from '@/lib/comp'

const BALL_DESCRIPTION = 'Training basketball with hand-placement guide lines that build consistent shooting form.'

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
    const playerSession = await getSessionFromRequest(req)
    const teamSession = playerSession ? null : await getTeamSessionFromRequest(req)
    const orgSession = playerSession || teamSession ? null : await getOrgSessionFromRequest(req)
    const isGuest = !playerSession && !teamSession && !orgSession

    const body = await req.json()
    const region = body?.region

    if (region !== 'US' && region !== 'CA') {
      return NextResponse.json({ error: 'Invalid region' }, { status: 400 })
    }

    // Where the free analysis tokens land: always the BUYER'S personal
    // balance, regardless of session type. Coaches and org owners can
    // transfer to a team / players later from their dashboard.
    //   user:<id>  → users.analysis_tokens
    //   coach:<email> → coach_credits.credits (team coach's personal pool)
    //   org:<id>   → organizations.token_balance (org owner's personal pool)
    let tokenRecipient = ''
    let guestClaimToken: string | undefined

    if (isGuest) {
      // Guest purchase — generate claim token now so it can go in the success URL.
      // Tokens are held in pending_credit_claims until they sign up.
      guestClaimToken = crypto.randomUUID()
    } else if (playerSession) {
      tokenRecipient = `user:${playerSession.userId}`
    } else if (teamSession) {
      tokenRecipient = `coach:${teamSession.adminEmail.toLowerCase()}`
    } else if (orgSession) {
      tokenRecipient = `org:${orgSession.orgId}`
    }

    const rawItems: IncomingItem[] = Array.isArray(body?.items)
      ? body.items
      : [{ variant: body?.variant, size: body?.size, quantity: 1, productSlug: 'ball' }]

    if (rawItems.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
    }

    const currency: 'usd' | 'cad' = region === 'CA' ? 'cad' : 'usd'
    const unitAmount = PRODUCT.priceCents
    const ball1Amount = BUNDLE.ball1PriceCents
    const ball2Amount = BUNDLE.ball2PriceCents

    const line_items: {
      quantity: number
      price_data: {
        currency: string
        unit_amount: number
        product_data: { name: string; description: string }
      }
    }[] = []

    // Free shot analyses earned: 5 per single ball, 10 for a 2-ball bundle.
    let analysisTokens = 0
    // Total physical balls in the order — drives the parcel size used to
    // quote live shipping rates once the buyer enters their address.
    let ballCount = 0
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

        analysisTokens += BUNDLE.uploadsGranted
        ballCount += 2
        line_items.push({
          quantity: 1,
          price_data: {
            currency,
            unit_amount: ball1Amount,
            product_data: {
              name: `${PRODUCT.name} — ${variantLabel(bundleItem.variant1)}, ${sizeLabel(bundleItem.size1)} (Bundle Ball 1)`,
              description: BALL_DESCRIPTION,
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
              description: BALL_DESCRIPTION,
            },
          },
        })
      } else {
        const ballItem = it as IncomingBallItem
        validateVariant(ballItem.variant)
        validateSize(ballItem.size)
        const qty = typeof ballItem.quantity === 'number' ? Math.floor(ballItem.quantity) : 1
        if (qty < 1 || qty > 99) throw new Error('Invalid quantity')

        analysisTokens += BALL_ANALYSES_GRANTED * qty
        ballCount += qty

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
              description: BALL_DESCRIPTION,
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

    metadata.analysis_tokens = String(analysisTokens)
    metadata.token_recipient = tokenRecipient
    metadata.ball_count = String(ballCount)
    if (guestClaimToken) metadata.claim_token = guestClaimToken

    // 5 per single ball × qty, 10 per 2-ball bundle. Logged so any future
    // "I didn't get my credits" can be cross-checked against checkout intent.
    console.log('[checkout] free-analysis grant computed', {
      itemsCount: rawItems.length,
      analysisTokens,
      tokenRecipient,
    })

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

    // Guest buyers: insert the claim record now so the signup page can redeem it
    // immediately after the Stripe redirect, before the webhook fires.
    if (guestClaimToken && analysisTokens > 0) {
      await db`
        INSERT INTO pending_credit_claims (claim_token, tokens_to_grant)
        VALUES (${guestClaimToken}, ${analysisTokens})
        ON CONFLICT (claim_token) DO NOTHING
      `
    }

    const returnUrl = guestClaimToken
      ? `${BASE_URL}/signup?claimToken=${guestClaimToken}&credits=${analysisTokens}`
      : `${BASE_URL}/shop/success?session_id={CHECKOUT_SESSION_ID}`

    // A valid comp code applies a 100%-off coupon server-side, so the
    // Stripe total is $0 and the card form is skipped (shipping is still
    // collected). allow_promotion_codes and discounts are mutually
    // exclusive, so only one is set. Coupons don't discount shipping, so
    // the shipping-options endpoint reads metadata.comp and quotes $0.
    const comp = isValidCompCode(body?.compCode)
    if (comp) metadata.comp = '1'
    const discountOpts = comp
      ? { discounts: [{ coupon: await getCompCouponId() }] }
      : { allow_promotion_codes: true as const }

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      // Embedded checkout with server-controlled shipping: the iframe calls
      // onShippingDetailsChange when the buyer completes their address, our
      // shipping-options endpoint quotes carrier-calibrated rates and updates the
      // session. The $0 placeholder below is replaced by real rates then.
      // Note: express wallets (Apple/Google Pay) are disabled by Stripe
      // under server_only shipping permissions.
      ui_mode: 'embedded_page',
      permissions: { update_shipping_details: 'server_only' },
      shipping_options: [{
        shipping_rate_data: {
          display_name: 'Enter address to calculate',
          type: 'fixed_amount',
          fixed_amount: { amount: 0, currency },
        },
      }],
      // Leave email unset so the buyer can edit it at Stripe. Order
      // routing in the webhook uses metadata.token_recipient, not the
      // checkout email, so receipts going to a different address are
      // fine. We still record the entered email on the orders row.
      line_items,
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      phone_number_collection: { enabled: true },
      metadata,
      ...discountOpts,
      return_url: returnUrl,
      // The session expires after 1 hour and Stripe fires
      // checkout.session.expired; the webhook emails buyers who got far
      // enough to enter their email but never paid, linking back to /cart.
      // (after_expiration.recovery reopens a Stripe-hosted copy of the
      // session, which can't do server-driven shipping — not used here.)
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    })

    return NextResponse.json({ clientSecret: session.client_secret })
  } catch (err) {
    console.error('Checkout error:', err)
    const message = err instanceof Error ? err.message : 'Checkout failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
