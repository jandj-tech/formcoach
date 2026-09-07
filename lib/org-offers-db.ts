// Server-side queries for per-organization offers and result-visibility
// settings. Pure logic (types, pricing, validation) lives in lib/org-offers.ts
// so client components never import this file.

import { db } from '@/lib/db'
import type { OrgOffer, OfferKind, UnlockScope } from '@/lib/org-offers'
import { DEFAULT_OFFERS, orgSharePercent, platformFeeFor } from '@/lib/org-offers'
import { ENTITLED_STATUSES, statusIsEntitled } from '@/lib/team-features'
import type { VisibilityTier } from '@/lib/result-visibility'
import { isVisibilityTier } from '@/lib/result-visibility'

export interface OrgResultSettings {
  freeTier: VisibilityTier
  unlockTier: VisibilityTier
}

// 'full' free by default: a new org sends complete reports until it opts into
// a paywall, so a first send is never an accidental score-only email.
export const DEFAULT_RESULT_SETTINGS: OrgResultSettings = {
  freeTier: 'full',
  unlockTier: 'full',
}

interface OfferRow {
  id: string
  org_id: string
  kind: string
  title: string
  description: string | null
  includes_breakdown: boolean
  includes_ball: boolean
  includes_course: boolean
  regular_price_cents: number
  club_price_cents: number | null
  discount_price_cents: number | null
  shipping_cents: number
  join_team_id: string | null
  unlock_scope: string
  active: boolean
  platform_share_percent: string | null // NUMERIC comes back as a string
  platform_share_cents: number | null
  sort_order: number
}

function mapOffer(row: OfferRow): OrgOffer {
  return {
    id: row.id,
    orgId: row.org_id,
    kind: row.kind as OfferKind,
    title: row.title,
    description: row.description,
    includesBreakdown: row.includes_breakdown,
    includesBall: row.includes_ball,
    includesCourse: row.includes_course,
    regularPriceCents: row.regular_price_cents,
    clubPriceCents: row.club_price_cents,
    discountPriceCents: row.discount_price_cents,
    shippingCents: row.shipping_cents,
    joinTeamId: row.join_team_id,
    unlockScope: (row.unlock_scope === 'player' ? 'player' : 'submission') as UnlockScope,
    active: row.active,
    platformSharePercent:
      row.platform_share_percent === null ? null : parseFloat(row.platform_share_percent),
    platformShareCents: row.platform_share_cents === null ? null : Number(row.platform_share_cents),
    sortOrder: row.sort_order,
  }
}

/** Every offer the org has, drafts included, in builder order. */
export async function getOrgOffers(orgId: string): Promise<OrgOffer[]> {
  const rows = await db`
    SELECT id, org_id, kind, title, description, includes_breakdown, includes_ball,
           includes_course, regular_price_cents, club_price_cents, discount_price_cents,
           shipping_cents, join_team_id, unlock_scope, active, platform_share_percent, platform_share_cents, sort_order
    FROM org_offers WHERE org_id = ${orgId} ORDER BY sort_order, created_at
  `
  return (rows as unknown as OfferRow[]).map(mapOffer)
}

export async function getOfferById(offerId: string): Promise<OrgOffer | null> {
  const rows = await db`
    SELECT id, org_id, kind, title, description, includes_breakdown, includes_ball,
           includes_course, regular_price_cents, club_price_cents, discount_price_cents,
           shipping_cents, join_team_id, unlock_scope, active, platform_share_percent, platform_share_cents, sort_order
    FROM org_offers WHERE id = ${offerId}
  `
  const row = (rows as unknown as OfferRow[])[0]
  return row ? mapOffer(row) : null
}

/**
 * Seed the draft offers on an org's first visit to the builder, then return
 * the full list. The check runs again inside the transaction so two
 * concurrent first visits can't each insert a seed set.
 */
export async function ensureDefaultOffers(orgId: string): Promise<OrgOffer[]> {
  const existing = await db`SELECT 1 FROM org_offers WHERE org_id = ${orgId} LIMIT 1`
  if (existing.length === 0) {
    await db.begin(async (tx) => {
      // Advisory lock, not FOR UPDATE: there are no rows to lock yet, so row
      // locking can't stop two first visits from both seeing "empty".
      await tx`SELECT pg_advisory_xact_lock(hashtext(${'org-offers-seed:' + orgId}))`
      const again = await tx`SELECT 1 FROM org_offers WHERE org_id = ${orgId} LIMIT 1`
      if (again.length > 0) return
      for (const s of DEFAULT_OFFERS) {
        await tx`
          INSERT INTO org_offers (
            org_id, kind, title, description, includes_breakdown, includes_ball,
            includes_course, unlock_scope, regular_price_cents, club_price_cents,
            platform_share_cents, sort_order, active
          ) VALUES (
            ${orgId}, ${s.kind}, ${s.title}, ${s.description}, ${s.includesBreakdown},
            ${s.includesBall}, ${s.includesCourse}, ${s.unlockScope}, ${s.regularPriceCents},
            ${s.clubPriceCents}, ${s.platformShareCents}, ${s.sortOrder}, FALSE
          )
        `
      }
    })
  }
  return getOrgOffers(orgId)
}

/** The org's visibility settings, or the defaults when the row doesn't exist yet. */
export async function getOrgResultSettings(orgId: string): Promise<OrgResultSettings> {
  const rows = await db`
    SELECT free_tier, unlock_tier FROM org_result_settings WHERE org_id = ${orgId}
  `
  const row = rows[0] as { free_tier: string; unlock_tier: string } | undefined
  if (!row) return DEFAULT_RESULT_SETTINGS
  return {
    freeTier: isVisibilityTier(row.free_tier) ? row.free_tier : DEFAULT_RESULT_SETTINGS.freeTier,
    unlockTier: isVisibilityTier(row.unlock_tier)
      ? row.unlock_tier
      : DEFAULT_RESULT_SETTINGS.unlockTier,
  }
}

export async function saveOrgResultSettings(
  orgId: string,
  settings: OrgResultSettings
): Promise<void> {
  await db`
    INSERT INTO org_result_settings (org_id, free_tier, unlock_tier, updated_at)
    VALUES (${orgId}, ${settings.freeTier}, ${settings.unlockTier}, NOW())
    ON CONFLICT (org_id) DO UPDATE
      SET free_tier = EXCLUDED.free_tier,
          unlock_tier = EXCLUDED.unlock_tier,
          updated_at = NOW()
  `
}

export interface OrgSellingState {
  /** The percent that applies to this org (override or the platform default). */
  platformSharePercent: number
  /** The admin's per-org override, null when the default applies. */
  overridePercent: number | null
  /** Paid/approved plan (active, trialing, legacy, comp, past_due). */
  entitled: boolean
  /** Paused by the site admin. */
  disabled: boolean
  /** entitled && !disabled — the one flag the UI and checkout gate on. */
  enabled: boolean
  offersRequestedAt: Date | null
}

export async function getOrgSellingState(orgId: string): Promise<OrgSellingState> {
  const rows = await db`
    SELECT platform_share_percent, offers_requested_at, selling_disabled, subscription_status
    FROM organizations WHERE id = ${orgId}
  `
  const row = rows[0] as
    | {
        platform_share_percent: string | null
        offers_requested_at: Date | null
        selling_disabled: boolean | null
        subscription_status: string | null
      }
    | undefined
  const override = row?.platform_share_percent == null ? null : parseFloat(row.platform_share_percent)
  const entitled = !!row && statusIsEntitled(row.subscription_status)
  const disabled = !!row?.selling_disabled
  return {
    platformSharePercent: orgSharePercent(override),
    overridePercent: override,
    entitled,
    disabled,
    enabled: entitled && !disabled,
    offersRequestedAt: row?.offers_requested_at ?? null,
  }
}

/**
 * The offers a PLAYER may buy right now: active rows of an entitled org whose
 * selling hasn't been paused. Anything else returns [] so a results page can
 * never show a dead-end buy button.
 */
export async function getPurchasableOffers(orgId: string): Promise<OrgOffer[]> {
  const rows = await db`
    SELECT o.id, o.org_id, o.kind, o.title, o.description, o.includes_breakdown,
           o.includes_ball, o.includes_course, o.regular_price_cents, o.club_price_cents,
           o.discount_price_cents, o.shipping_cents, o.join_team_id, o.unlock_scope, o.active,
           o.platform_share_percent, o.platform_share_cents, o.sort_order
    FROM org_offers o
    JOIN organizations org ON org.id = o.org_id
    WHERE o.org_id = ${orgId} AND o.active = TRUE
      AND org.selling_disabled = FALSE
      AND org.subscription_status = ANY(${[...ENTITLED_STATUSES]}::text[])
    ORDER BY o.sort_order, o.created_at
  `
  return (rows as unknown as OfferRow[]).map(mapOffer)
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

import type { OfferInput } from '@/lib/org-offer-input'

export async function createOffer(orgId: string, input: OfferInput): Promise<OrgOffer> {
  // Class sign-ups and balls carry their fixed LearnHoops fees from the
  // start; the admin can still change it per offer.
  const flatFee = platformFeeFor(input)
  const rows = await db`
    INSERT INTO org_offers (
      org_id, kind, title, description, includes_breakdown, includes_ball, includes_course,
      regular_price_cents, club_price_cents, discount_price_cents, shipping_cents,
      join_team_id, unlock_scope, platform_share_cents, sort_order, active
    ) VALUES (
      ${orgId}, ${input.kind}, ${input.title}, ${input.description}, ${input.includesBreakdown},
      ${input.includesBall}, ${input.includesCourse}, ${input.regularPriceCents},
      ${input.clubPriceCents}, ${input.discountPriceCents}, ${input.shippingCents},
      ${input.joinTeamId}, ${input.unlockScope}, ${flatFee}, ${input.sortOrder}, FALSE
    )
    RETURNING id
  `
  const id = (rows[0] as { id: string }).id
  return (await getOfferById(id))!
}

/**
 * Update an offer's fields. `active` and `platformSharePercent` are separate
 * from the content fields because they have their own gates (selling enabled;
 * admin only).
 */
export async function updateOffer(
  offerId: string,
  input: OfferInput,
  extra: { active?: boolean; platformSharePercent?: number | null; platformShareCents?: number | null }
): Promise<OrgOffer | null> {
  await db`
    UPDATE org_offers SET
      kind = ${input.kind},
      title = ${input.title},
      description = ${input.description},
      includes_breakdown = ${input.includesBreakdown},
      includes_ball = ${input.includesBall},
      includes_course = ${input.includesCourse},
      regular_price_cents = ${input.regularPriceCents},
      club_price_cents = ${input.clubPriceCents},
      discount_price_cents = ${input.discountPriceCents},
      shipping_cents = ${input.shippingCents},
      join_team_id = ${input.joinTeamId},
      unlock_scope = ${input.unlockScope},
      sort_order = ${input.sortOrder},
      active = ${extra.active === undefined ? db`active` : extra.active},
      platform_share_percent = ${
        extra.platformSharePercent === undefined ? db`platform_share_percent` : extra.platformSharePercent
      },
      platform_share_cents = ${
        extra.platformShareCents === undefined ? db`platform_share_cents` : extra.platformShareCents
      },
      updated_at = NOW()
    WHERE id = ${offerId}
  `
  return getOfferById(offerId)
}

export async function deleteOffer(offerId: string): Promise<void> {
  await db`DELETE FROM org_offers WHERE id = ${offerId}`
}

/** Mark the org as having asked to sell; idempotent. */
export async function requestSelling(orgId: string): Promise<void> {
  await db`
    UPDATE organizations SET offers_requested_at = COALESCE(offers_requested_at, NOW())
    WHERE id = ${orgId}
  `
}

/** Admin sets (or clears, back to the default) an org's percent override. */
export async function setOrgSplit(orgId: string, platformSharePercent: number | null): Promise<void> {
  await db`UPDATE organizations SET platform_share_percent = ${platformSharePercent} WHERE id = ${orgId}`
}

/**
 * Admin pauses or resumes selling for one org. Pausing also switches every
 * offer off so no live paywall points at a checkout that would 403.
 */
export async function setOrgSellingDisabled(orgId: string, disabled: boolean): Promise<void> {
  await db.begin(async (tx) => {
    await tx`UPDATE organizations SET selling_disabled = ${disabled} WHERE id = ${orgId}`
    if (disabled) {
      await tx`UPDATE org_offers SET active = FALSE, updated_at = NOW() WHERE org_id = ${orgId}`
    }
  })
}
