import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import {
  CLASS_MIN_PLAYERS,
  CLASS_PRICE_PER_PLAYER_CENTS,
  CLASS_BULK_PRICE_PER_PLAYER_CENTS,
  CLASS_BULK_THRESHOLD,
  CLASS_ANALYSES_PER_PLAYER,
  classPriceCents,
} from '@/lib/org-class-pricing'

export async function POST(req: NextRequest) {
  const session = await getOrgSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { playerCount } = await req.json()
  if (!playerCount || typeof playerCount !== 'number' || playerCount < CLASS_MIN_PLAYERS) {
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

  const stripeSession = await getStripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: org.admin_email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: totalCents,
          product_data: {
            name: `LearnHoops Class Program — ${playerCount} Players`,
            description: `${playerCount} training ball${playerCount !== 1 ? 's' : ''}, ${playerCount * CLASS_ANALYSES_PER_PLAYER} shot analyses, ${playerCount} completion certificate${playerCount !== 1 ? 's' : ''}. ${playerCount >= CLASS_BULK_THRESHOLD ? `Bulk rate: $${CLASS_BULK_PRICE_PER_PLAYER_CENTS / 100}/player` : `$${CLASS_PRICE_PER_PLAYER_CENTS / 100}/player`}`,
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
    },
    success_url: `${baseUrl}/org/dashboard?class_success=1`,
    allow_promotion_codes: true,
    cancel_url: `${baseUrl}/org/dashboard`,
  })

  return NextResponse.json({ url: stripeSession.url })
}
