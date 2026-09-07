import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { rejectInAppPurchase } from '@/lib/in-app'
import { currencyForRequest } from '@/lib/region'
import { rateLimitByIp } from '@/lib/rate-limit'
import { resolveBaseUrl } from '@/lib/base-url'
import { getOfferById, getOrgResultSettings, getOrgSellingState } from '@/lib/org-offers-db'
import { effectivePriceCents, shareRuleFor } from '@/lib/org-offers'
import { stripeAttributionMetadata } from '@/lib/meta-server'

const BASE_URL = resolveBaseUrl()

// Public checkout for an organization's offer. The buyer is a parent or player
// with no account: identity is the results link they arrived from (a release
// token) or, for a standalone class purchase, the org id in the offers page URL.
//
// Everything fulfillment needs is snapshotted into metadata here so a later
// edit to the offer or the org's split can't change what this buyer bought.
// No promotion codes: an org's share must never shrink from a platform-wide
// coupon it didn't approve — the org has its own discount price for promos.
export async function POST(req: NextRequest) {
  const inAppBlock = rejectInAppPurchase(req)
  if (inAppBlock) return inAppBlock

  const limit = await rateLimitByIp(req, 'offer-checkout', 20, 600)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many attempts — please try again in a few minutes.' }, { status: 429 })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: unknown
      orgId?: unknown
      offerId?: unknown
      size?: unknown
      variant?: unknown
    }
    const offerId = typeof body.offerId === 'string' ? body.offerId : ''
    const token = typeof body.token === 'string' ? body.token : ''
    const orgIdParam = typeof body.orgId === 'string' ? body.orgId : ''
    if (!offerId || (!token && !orgIdParam)) {
      return NextResponse.json({ error: 'Missing offer' }, { status: 400 })
    }

    // Resolve the buying context.
    let orgId = ''
    let releaseId: string | null = null
    let prefillEmail: string | null = null
    if (token) {
      const [row] = (await db`
        SELECT r.id, r.org_id, r.recipient_email
        FROM result_releases r
        JOIN submissions s ON s.id = r.submission_id
        WHERE s.token = ${token}
      `) as unknown as [{ id: string; org_id: string; recipient_email: string | null } | undefined]
      if (!row) return NextResponse.json({ error: 'These results have not been shared for purchase yet.' }, { status: 404 })
      orgId = row.org_id
      releaseId = row.id
      prefillEmail = row.recipient_email
    } else {
      orgId = orgIdParam
    }

    const offer = await getOfferById(offerId)
    if (!offer || offer.orgId !== orgId || !offer.active) {
      return NextResponse.json({ error: 'This offer is no longer available.' }, { status: 404 })
    }
    const selling = await getOrgSellingState(orgId)
    if (!selling.enabled) {
      return NextResponse.json({ error: 'This organization is not selling yet.' }, { status: 403 })
    }
    const [org] = (await db`SELECT name FROM organizations WHERE id = ${orgId}`) as unknown as [{ name: string } | undefined]
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    let ballSize = ''
    let ballVariant = ''
    if (offer.includesBall) {
      ballSize = typeof body.size === 'string' && ['5', '6', '7'].includes(body.size) ? body.size : ''
      ballVariant = body.variant === 'left' || body.variant === 'right' ? body.variant : ''
      if (!ballSize || !ballVariant) {
        return NextResponse.json({ error: 'Choose a ball size and shooting hand first.' }, { status: 400 })
      }
    }

    const settings = await getOrgResultSettings(orgId)
    const currency = currencyForRequest(req)
    const priceCents = effectivePriceCents(offer)
    const shippingCents = offer.includesBall ? offer.shippingCents : 0
    const rule = shareRuleFor(offer, selling.platformSharePercent)
    if (!rule) return NextResponse.json({ error: 'This organization is not selling yet.' }, { status: 403 })
    const includes = [
      offer.includesBreakdown ? 'breakdown' : null,
      offer.includesBall ? 'ball' : null,
      offer.includesCourse ? 'course' : null,
    ]
      .filter(Boolean)
      .join(',')

    const returnPath = token ? `/results/${token}` : `/offers/${orgId}`
    const sep = '?'
    const description = [
      offer.description,
      offer.includesBall ? `Ball: size ${ballSize}, ${ballVariant}-handed` : null,
    ]
      .filter(Boolean)
      .join(' · ')

    const stripeSession = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: priceCents,
            product_data: {
              name: `${offer.title} — ${org.name}`,
              ...(description ? { description: description.slice(0, 500) } : {}),
            },
          },
        },
      ],
      ...(offer.includesBall
        ? {
            shipping_address_collection: { allowed_countries: ['US', 'CA'] },
            phone_number_collection: { enabled: true },
            ...(shippingCents > 0
              ? {
                  shipping_options: [
                    {
                      shipping_rate_data: {
                        type: 'fixed_amount' as const,
                        display_name: 'Shipping',
                        fixed_amount: { amount: shippingCents, currency },
                      },
                    },
                  ],
                }
              : {}),
          }
        : {}),
      ...(prefillEmail ? { customer_email: prefillEmail } : {}),
      metadata: {
        type: 'org_offer',
        orgId,
        offerId: offer.id,
        releaseId: releaseId ?? '',
        submissionToken: token,
        // The LearnHoops share rule, frozen at purchase: a fixed fee wins over
        // a percent. Fulfillment reads these, never the live offer row.
        platformShareCents: rule.mode === 'flat' ? String(rule.cents) : '',
        platformSharePercent: rule.mode === 'percent' ? String(rule.percent) : '',
        shippingCents: String(shippingCents),
        ballSize,
        ballVariant,
        unlockScope: offer.unlockScope,
        unlockedTier: settings.unlockTier,
        includes,
        title: offer.title.slice(0, 200),
        // Ad-click attribution for the webhook's Conversions API Purchase.
        ...stripeAttributionMetadata(req),
      },
      success_url: `${BASE_URL}${returnPath}${sep}offer_purchased=1&offer_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}${returnPath}`,
    })

    return NextResponse.json({ url: stripeSession.url })
  } catch (err) {
    console.error('[offer-checkout] failed:', err)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
