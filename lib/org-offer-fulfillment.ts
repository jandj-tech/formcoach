// Fulfills a paid org-offer checkout: ledger rows, the unlock, and the emails.
// Called by the Stripe webhook AND by the results page when the buyer lands
// back with ?offer_session= (a safety net for a lagging or failed webhook).
// Idempotent through claimStripeSession, so whichever arrives first does the
// work and the other no-ops.
//
// Everything the fulfillment needs is snapshotted in the checkout session's
// metadata at purchase time (title, includes, scope, promised tier, split
// percent, shipping). The offer row is consulted only for the join-team code,
// so an offer edited or deleted after checkout can't change what was bought.

import type Stripe from 'stripe'
import { db } from '@/lib/db'
import { claimStripeSession, releaseStripeSessionClaim } from '@/lib/stripe-idempotency'
import { applyShareRule, parseSharePercent, type ShareRule } from '@/lib/org-offers'
import { isVisibilityTier, type VisibilityTier } from '@/lib/result-visibility'
import { sendOfferPurchaseConfirmationEmail, sendOfferSaleNotificationEmail } from '@/lib/email'

export type FulfillOutcome = 'fulfilled' | 'already_processed' | 'not_paid' | 'not_offer' | 'failed'

export async function fulfillOfferSession(
  session: Stripe.Checkout.Session,
  source: 'webhook' | 'success'
): Promise<FulfillOutcome> {
  const m = session.metadata ?? {}
  if (m.type !== 'org_offer') return 'not_offer'
  if (session.payment_status === 'unpaid') return 'not_paid'

  const email = (session.customer_details?.email ?? session.customer_email ?? '').trim().toLowerCase()
  const claim = await claimStripeSession(session.id, 0, email || null)
  if (claim === 'already_processed') return 'already_processed'

  try {
    const orgId = m.orgId ?? ''
    const offerId = m.offerId ?? ''
    const releaseId = m.releaseId || null
    // Fixed fee wins over percent; both were frozen into metadata at checkout.
    const flatCents = m.platformShareCents ? Math.floor(Number(m.platformShareCents)) : NaN
    const pct = parseSharePercent(m.platformSharePercent)
    const rule: ShareRule | null = Number.isFinite(flatCents) && flatCents >= 0
      ? { mode: 'flat', cents: flatCents }
      : pct !== null
        ? { mode: 'percent', percent: pct }
        : null
    if (!orgId || !offerId || !rule) {
      throw new Error(`org_offer metadata invalid: orgId=${orgId} offerId=${offerId} flat=${m.platformShareCents} pct=${m.platformSharePercent}`)
    }
    const includes = new Set((m.includes ?? '').split(',').filter(Boolean))
    const includesBreakdown = includes.has('breakdown')
    const includesBall = includes.has('ball')
    const includesCourse = includes.has('course')
    const unlockScope = m.unlockScope === 'player' ? 'player' : 'submission'
    const unlockedTier: VisibilityTier = isVisibilityTier(m.unlockedTier) ? m.unlockedTier : 'full'
    const title = (m.title ?? 'Offer').slice(0, 255)
    const shippingCents = Math.max(0, Math.floor(Number(m.shippingCents ?? 0)) || 0)

    const total = session.amount_total ?? 0
    const currency = session.currency ?? 'usd'
    // Shipping is platform pass-through — only the product portion is split.
    const productPortion = Math.max(0, total - shippingCents)
    const { orgShareCents, platformShareCents } = applyShareRule(productPortion, rule)
    const paymentIntent =
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
    const name = session.customer_details?.name ?? null
    const phone = session.customer_details?.phone ?? null

    const inserted = (await db`
      INSERT INTO orders (
        stripe_session_id, stripe_payment_intent_id, email, customer_name, phone,
        variant, size, amount_total, currency, kind, quantity, description,
        buyer_kind, buyer_ref, org_id, offer_id, org_share_cents, platform_share_cents, status
      ) VALUES (
        ${session.id}, ${paymentIntent}, ${email || 'unknown'}, ${name}, ${phone},
        NULL, NULL, ${total}, ${currency}, 'org_offer', 1, ${title},
        'player', ${email || null}, ${orgId}, ${offerId}, ${orgShareCents}, ${platformShareCents}, 'paid'
      )
      ON CONFLICT (stripe_session_id) DO NOTHING
      RETURNING id
    `) as unknown as Array<{ id: string }>
    const orderId =
      inserted[0]?.id ??
      ((await db`SELECT id FROM orders WHERE stripe_session_id = ${session.id}`) as unknown as Array<{ id: string }>)[0]?.id ??
      null

    if (includesBall) {
      const size = ['5', '6', '7'].includes(m.ballSize ?? '') ? m.ballSize : '7'
      const variant = m.ballVariant === 'left' ? 'left' : 'right'
      const ship = session.collected_information?.shipping_details
      await db`
        INSERT INTO orders (
          stripe_session_id, email, customer_name, phone, variant, size, amount_total, currency,
          shipping_name, shipping_line1, shipping_line2, shipping_city, shipping_state,
          shipping_postal_code, shipping_country, shipping_cost_cents,
          kind, quantity, description, buyer_kind, buyer_ref, org_id, offer_id, status
        ) VALUES (
          ${session.id + '__ball'}, ${email || 'unknown'}, ${ship?.name ?? name}, ${phone},
          ${variant}, ${size}, 0, ${currency},
          ${ship?.name ?? null}, ${ship?.address?.line1 ?? null}, ${ship?.address?.line2 ?? null},
          ${ship?.address?.city ?? null}, ${ship?.address?.state ?? null},
          ${ship?.address?.postal_code ?? null}, ${ship?.address?.country ?? null}, ${shippingCents},
          'org_offer_ball', 1, ${title + ' — ball'}, 'player', ${email || null}, ${orgId}, ${offerId}, 'paid'
        )
        ON CONFLICT (stripe_session_id) DO NOTHING
      `
    }

    let recipientUserId: string | null = null
    let recipientEmail: string | null = email || null
    const resultsToken: string | null = m.submissionToken || null
    if (includesBreakdown && releaseId) {
      const rows = (await db`
        UPDATE result_releases
        SET unlocked = TRUE,
            unlocked_at = COALESCE(unlocked_at, NOW()),
            unlock_order_id = COALESCE(unlock_order_id, ${orderId}::uuid),
            unlocked_tier = COALESCE(unlocked_tier, ${unlockedTier})
        WHERE id = ${releaseId}::uuid
        RETURNING recipient_user_id, recipient_email
      `) as unknown as Array<{ recipient_user_id: string | null; recipient_email: string | null }>
      if (rows[0]) {
        recipientUserId = rows[0].recipient_user_id
        recipientEmail = rows[0].recipient_email ?? recipientEmail
      }
    }
    if (includesBreakdown && unlockScope === 'player') {
      await db`
        INSERT INTO org_player_unlocks (org_id, user_id, email, unlocked_tier, order_id)
        VALUES (${orgId}, ${recipientUserId}, ${recipientEmail}, ${unlockedTier}, ${orderId}::uuid)
      `
      // A parent often pays from their own address while the release went to
      // the player's — record both so either one matches future releases.
      if (email && recipientEmail && email !== recipientEmail.toLowerCase()) {
        await db`
          INSERT INTO org_player_unlocks (org_id, user_id, email, unlocked_tier, order_id)
          VALUES (${orgId}, NULL, ${email}, ${unlockedTier}, ${orderId}::uuid)
        `
      }
    }

    // Emails are best-effort: the money and the unlock have landed.
    const [org] = (await db`SELECT name, admin_email FROM organizations WHERE id = ${orgId}`) as unknown as [
      { name: string; admin_email: string } | undefined,
    ]
    let joinTeamCode: string | null = null
    if (includesCourse) {
      const [t] = (await db`
        SELECT t.access_code FROM org_offers o JOIN teams t ON t.id = o.join_team_id WHERE o.id = ${offerId}
      `) as unknown as [{ access_code: string } | undefined]
      joinTeamCode = t?.access_code ?? null
    }
    if (org && email) {
      const input = {
        buyerEmail: email,
        buyerName: name,
        orgName: org.name,
        orgAdminEmail: org.admin_email,
        offerTitle: title,
        amountCents: total,
        currency,
        resultsToken,
        includesBreakdown,
        includesBall,
        includesCourse,
        joinTeamCode,
        orgShareCents,
        platformShareCents,
      }
      await Promise.allSettled([sendOfferPurchaseConfirmationEmail(input), sendOfferSaleNotificationEmail(input)])
    }

    console.log('[org-offer] fulfilled', { sessionId: session.id, source, orgId, offerId, total, currency, orgShareCents })
    return 'fulfilled'
  } catch (err) {
    console.error('[org-offer] fulfillment failed:', err)
    await releaseStripeSessionClaim(session.id, `org_offer:${source}`)
    return 'failed'
  }
}
