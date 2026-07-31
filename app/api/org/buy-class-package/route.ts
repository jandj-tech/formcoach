import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { rejectInAppPurchase } from '@/lib/in-app'
import {
  CLASS_MIN_PLAYERS,
  CLASS_PRICE_PER_PLAYER_CENTS,
  CLASS_BULK_PRICE_PER_PLAYER_CENTS,
  CLASS_BULK_THRESHOLD,
  CLASS_ANALYSES_PER_PLAYER,
  classPriceCents,
} from '@/lib/org-class-pricing'

export async function POST(req: NextRequest) {
  // Digital goods cannot be sold via Stripe inside the iOS app (guideline 3.1.1).
  const inAppBlock = rejectInAppPurchase(req)
  if (inAppBlock) return inAppBlock
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const size5 = Math.max(0, Math.floor(Number(body.size5) || 0))
  const size6 = Math.max(0, Math.floor(Number(body.size6) || 0))
  const size7 = Math.max(0, Math.floor(Number(body.size7) || 0))
  const playerCount = size5 + size6 + size7

  if (playerCount < CLASS_MIN_PLAYERS) {
    return NextResponse.json({ error: `Minimum ${CLASS_MIN_PLAYERS} players required` }, { status: 400 })
  }

  const orgRows = await db`SELECT id, name, admin_email FROM organizations WHERE id = ${session.orgId}` as unknown as { id: string; name: string; admin_email: string }[]
  const org = orgRows[0]
  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  const pricePerPlayer = playerCount >= CLASS_BULK_THRESHOLD
    ? CLASS_BULK_PRICE_PER_PLAYER_CENTS
    : CLASS_PRICE_PER_PLAYER_CENTS
  const totalCents = classPriceCents(playerCount)

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://learnhoops.com'

  const ballBreakdown = [
    size5 > 0 ? `${size5}× size 5` : null,
    size6 > 0 ? `${size6}× size 6` : null,
    size7 > 0 ? `${size7}× size 7` : null,
  ].filter(Boolean).join(', ')

  // Don't pre-fill customer_email — Stripe locks it when set, and the
  // buyer may want the receipt to go to a different address (e.g. a
  // coach or finance person). Order confirmation still uses
  // org.admin_email server-side via the webhook.
  const stripeSession = await getStripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: totalCents,
          product_data: {
            name: `LearnHoops Class Program — ${playerCount} Players`,
            description: `${playerCount} training balls (${ballBreakdown}), ${playerCount * CLASS_ANALYSES_PER_PLAYER} shot analyses, ${playerCount} completion certificate${playerCount !== 1 ? 's' : ''}. ${playerCount >= CLASS_BULK_THRESHOLD ? `Bulk rate: $${CLASS_BULK_PRICE_PER_PLAYER_CENTS / 100}/player` : `$${CLASS_PRICE_PER_PLAYER_CENTS / 100}/player`}`,
          },
        },
      },
    ],
    metadata: {
      type: 'org_class_package',
      orgId: org.id,
      orgName: org.name,
      playerCount: String(playerCount),
      pricePerPlayerCents: String(pricePerPlayer),
      totalCents: String(totalCents),
      size5: String(size5),
      size6: String(size6),
      size7: String(size7),
    },
    shipping_address_collection: { allowed_countries: ['US', 'CA'] },
    phone_number_collection: { enabled: true },
    success_url: `${baseUrl}/org/class-success/{CHECKOUT_SESSION_ID}`,
    allow_promotion_codes: true,
    cancel_url: `${baseUrl}/org/dashboard`,
  })

  return NextResponse.json({ url: stripeSession.url })
}
