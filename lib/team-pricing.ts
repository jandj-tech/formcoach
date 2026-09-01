// Pure pricing constants for the analysis-token model — no DB imports, so this
// file is safe to import from client components.

/**
 * What a buyer's organization plan entitles them to, for pricing purposes.
 *
 *   none  — an individual, or a team whose organization has lapsed
 *   basic — the entry plan
 *   plus  — the full plan; also what every grandfathered team and org resolves to
 *
 * Since the 2026-09 repricing Basic and Plus earn the SAME token pricing (the
 * org bulk rate); the tier still matters for features (lib/team-features.ts)
 * and is kept here so a lapsed org ('none') prices as an individual.
 */
export type OrgTier = 'none' | 'basic' | 'plus'

/** True for a tier string that came off the wire or out of the database. */
export function isOrgTier(value: unknown): value is OrgTier {
  return value === 'none' || value === 'basic' || value === 'plus'
}

/**
 * The public per-analysis price (cents) for a SMALL order: 1–4 tokens.
 * Everyone pays this — individuals, org members buying a few, everyone.
 */
export const REGULAR_ANALYSIS_PRICE_CENTS = 999

/**
 * The public volume rate (cents): from REGULAR_VOLUME_MIN_QTY tokens up,
 * EVERY token in the order is priced here — not just the ones past the
 * threshold. 5 tokens is $25.00 flat, never $9.99×4 + $5.
 */
export const REGULAR_VOLUME_PRICE_CENTS = 500
export const REGULAR_VOLUME_MIN_QTY = 5

/**
 * The organization bulk rate (cents), for members of an organization with an
 * entitled plan (Basic or Plus): $2.49 per token, but ONLY on orders of
 * ORG_BULK_MIN_QTY or more, and ONLY on the website — there is deliberately
 * no in-app purchase at this rate (lib/in-app.ts already 403s every Stripe
 * checkout inside the iOS app). Below the minimum, org members simply pay the
 * regular public pricing; they are never forced up to 10.
 */
export const ORG_BULK_PRICE_CENTS = 249
export const ORG_BULK_MIN_QTY = 10

/**
 * Legacy aliases, kept so long-lived call sites keep compiling and keep
 * meaning something true: the "team rate" IS the org bulk rate now, and its
 * minimum quantity is the bulk minimum.
 */
export const TEAM_TOKEN_PRICE_CENTS = ORG_BULK_PRICE_CENTS
export const TEAM_FULL_RATE_CENTS = ORG_BULK_PRICE_CENTS
export const TEAM_FULL_RATE_MIN_QTY = ORG_BULK_MIN_QTY

/**
 * Per-order quantity ceilings, shared by the buy UI and the routes that
 * charge, so a stepper can never offer a quantity checkout would reject.
 */
export const MAX_TOKENS_PER_ORDER = 1000
export const MAX_COACH_CREDITS_PER_ORDER = 500

/**
 * A volume tier: at `minQty` and up, every token in the order costs
 * `unitCents`. `percentOff` is DERIVED from the cents (never hand-tuned) and
 * exists for display — the nudge chips render "5+ save 50%".
 */
export type VolumeTier = { minQty: number; unitCents: number; percentOff: number }

function tierOf(minQty: number, unitCents: number): VolumeTier {
  return {
    minQty,
    unitCents,
    percentOff: ((REGULAR_ANALYSIS_PRICE_CENTS - unitCents) / REGULAR_ANALYSIS_PRICE_CENTS) * 100,
  }
}

/**
 * Ladders are ordered highest-minQty first — `find` returns the best tier the
 * quantity qualifies for. The discount prices the WHOLE order, so a larger
 * order is never dearer per token than a smaller one.
 */

/** No plan: $9.99 each, $5.00 each from 5 up. */
export const REGULAR_VOLUME_TIERS: ReadonlyArray<VolumeTier> = [
  tierOf(REGULAR_VOLUME_MIN_QTY, REGULAR_VOLUME_PRICE_CENTS),
]

/**
 * Entitled org members (Basic and Plus alike): the public ladder, plus the
 * $2.49 bulk rate from 10 up. An org buying 5–9 pays the public $5.00 rate;
 * buying 1–4 pays $9.99 — exactly what a regular customer would.
 */
export const ORG_VOLUME_TIERS: ReadonlyArray<VolumeTier> = [
  tierOf(ORG_BULK_MIN_QTY, ORG_BULK_PRICE_CENTS),
  tierOf(REGULAR_VOLUME_MIN_QTY, REGULAR_VOLUME_PRICE_CENTS),
]

/** Basic and Plus intentionally share one ladder since the 2026-09 repricing. */
export const BASIC_VOLUME_TIERS: ReadonlyArray<VolumeTier> = ORG_VOLUME_TIERS
export const PLUS_VOLUME_TIERS: ReadonlyArray<VolumeTier> = ORG_VOLUME_TIERS

/**
 * The base rate before any volume discount — the same $9.99 for every tier
 * now. Kept tier-parameterized so call sites don't churn and a future split
 * has somewhere to live.
 */
export function analysisBaseCents(_tier: OrgTier): number {
  return REGULAR_ANALYSIS_PRICE_CENTS
}

/** Which ladder a tier earns. */
export function tiersFor(tier: OrgTier): ReadonlyArray<VolumeTier> {
  return tier === 'none' ? REGULAR_VOLUME_TIERS : ORG_VOLUME_TIERS
}

function tierMatch(tier: OrgTier, quantity: number): VolumeTier | null {
  if (!Number.isFinite(quantity)) return null
  const qty = Math.floor(quantity)
  if (qty < 1) return null
  return tiersFor(tier).find((t) => qty >= t.minQty) ?? null
}

/**
 * Percent off for an order of `quantity` on `tier`. 0 below the first tier.
 * Floors the quantity, so a fractional one can never price a tier it does not
 * actually buy.
 */
export function volumeDiscountPercent(tier: OrgTier, quantity: number): number {
  return tierMatch(tier, quantity)?.percentOff ?? 0
}

/**
 * Per-token price (cents) after the volume discount — whole cents by
 * construction now that tiers carry cents directly, which is also why the
 * eligibility rules cannot round themselves into a new price: the org bulk
 * minimum is enforced HERE, in the one function every checkout route calls,
 * not in each route's own quantity check.
 */
export function discountedUnitCents(tier: OrgTier, quantity: number): number {
  return tierMatch(tier, quantity)?.unitCents ?? analysisBaseCents(tier)
}

/**
 * What an order costs, what the discount saved, and the nearest tier above —
 * drives both checkout and the UI. `nextTier` is null in the top tier.
 */
export function orderPricing(tier: OrgTier, quantity: number) {
  const baseUnitCents = analysisBaseCents(tier)
  const percentOff = volumeDiscountPercent(tier, quantity)
  const unitCents = discountedUnitCents(tier, quantity)
  const qty = Math.max(0, Math.floor(quantity) || 0)
  const totalCents = unitCents * qty
  const fullTotalCents = baseUnitCents * qty
  // Tiers are highest-first, so the last one still above `qty` is the nearest.
  const above = tiersFor(tier).filter((t) => t.minQty > qty)
  return {
    baseUnitCents,
    percentOff,
    unitCents,
    totalCents,
    fullTotalCents,
    savingsCents: fullTotalCents - totalCents,
    nextTier: above.length > 0 ? above[above.length - 1] : null,
  }
}

/** Format cents for display: 500 -> "$5.00". */
export function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * A tier percentage as it should be shown: a whole number. The exact
 * percentages are derived from the cent prices ($9.99 → $5.00 is 49.95%), so
 * only the label rounds — "save 50%" sits beside the exact figure it came from.
 */
export function percentLabel(percentOff: number): number {
  return Math.round(percentOff)
}
