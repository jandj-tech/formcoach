// Pure pricing constants for the analysis-token model — no DB imports, so this
// file is safe to import from client components.

/**
 * What a buyer's organization plan entitles them to, for pricing purposes.
 *
 *   none  — an individual, or a team whose organization has lapsed
 *   basic — the entry plan
 *   plus  — the full plan; also what every grandfathered team and org resolves to
 *
 * This is an enum rather than a boolean because Basic and Plus share the same
 * $2.49 base and differ only in how far the volume ladder goes. The ladder used
 * to be inferred from the base rate, which cannot tell those two apart, so the
 * tier is now passed explicitly and the base is derived from it rather than the
 * other way round.
 */
export type OrgTier = 'none' | 'basic' | 'plus'

/** True for a tier string that came off the wire or out of the database. */
export function isOrgTier(value: unknown): value is OrgTier {
  return value === 'none' || value === 'basic' || value === 'plus'
}

/** Regular per-analysis price (cents) — individuals, and lapsed organizations. */
export const REGULAR_ANALYSIS_PRICE_CENTS = 349

/**
 * The subscriber per-token price for a SMALL order (1–4 tokens), in cents.
 *
 * Basic and Plus both start here; they diverge from 5 tokens on. Small orders
 * sit at $2.49 because the payment-processor fee eats most of the margin on a
 * single-token purchase, so buyers are nudged to buy in fives.
 */
export const TEAM_TOKEN_PRICE_CENTS = 249

/** The cheapest rate anywhere (cents) — the Plus floor, from 10 tokens up. */
export const TEAM_FULL_RATE_CENTS = 129

/** Tokens a subscriber must buy in one order to reach their first discount. */
export const TEAM_FULL_RATE_MIN_QTY = 5

/**
 * Per-order quantity ceilings, shared by the buy UI and the routes that
 * charge, so a stepper can never offer a quantity checkout would reject.
 */
export const MAX_TOKENS_PER_ORDER = 1000
export const MAX_COACH_CREDITS_PER_ORDER = 500

export type VolumeTier = { minQty: number; percentOff: number }

/**
 * Volume discount tiers, applied to a SINGLE order.
 *
 * The percentage comes off every token in the order, not just the ones above
 * the threshold. That matters: it means a larger order is never more expensive
 * per token than a smaller one, so crossing a tier always rewards the buyer
 * instead of punishing them.
 *
 * Ordered highest-first — `find` returns the best tier the quantity qualifies
 * for. The percentages are odd numbers because they are derived from the
 * advertised prices rather than chosen, which is why scripts/test-pricing.ts
 * pins the resulting cents and not the percentages.
 */

/** No plan: 3 for $6.99, 5 for $8.95, floors at $1.65 from 10 up. */
export const REGULAR_VOLUME_TIERS: ReadonlyArray<VolumeTier> = [
  { minQty: 10, percentOff: 52.7 }, // → 165
  { minQty: 5, percentOff: 48.7 }, //  → 179
  { minQty: 3, percentOff: 33.2 }, //  → 233
]

/**
 * Basic: $2.49, then $1.65 at 5+, floors at $1.49 from 10 up.
 *
 * Every step must stay at or below the no-plan ladder from 5 tokens on, or the
 * plan costs more than not subscribing. scripts/test-pricing.ts asserts exactly
 * that; the only place Basic is dearer is the 3–4 window, which is pinned there
 * too so it cannot widen unnoticed.
 */
export const BASIC_VOLUME_TIERS: ReadonlyArray<VolumeTier> = [
  { minQty: 10, percentOff: 40.16 }, // → 149
  { minQty: 5, percentOff: 33.73 }, //  → 165
]

/** Plus: $2.49, then $1.49 at 5+, floors at $1.29 from 10 up — cheapest anywhere. */
export const PLUS_VOLUME_TIERS: ReadonlyArray<VolumeTier> = [
  { minQty: 10, percentOff: 48.19 }, // → 129
  { minQty: 5, percentOff: 40.16 }, //  → 149
]

/** The base rate a tier pays before any volume discount. */
export function analysisBaseCents(tier: OrgTier): number {
  return tier === 'none' ? REGULAR_ANALYSIS_PRICE_CENTS : TEAM_TOKEN_PRICE_CENTS
}

/** Which ladder a tier earns. */
export function tiersFor(tier: OrgTier): ReadonlyArray<VolumeTier> {
  if (tier === 'plus') return PLUS_VOLUME_TIERS
  if (tier === 'basic') return BASIC_VOLUME_TIERS
  return REGULAR_VOLUME_TIERS
}

/**
 * Percent off for an order of `quantity` on `tier`. 0 below the first tier.
 * Floors the quantity, so a fractional one can never price a tier it does not
 * actually buy.
 */
export function volumeDiscountPercent(tier: OrgTier, quantity: number): number {
  if (!Number.isFinite(quantity)) return 0
  const qty = Math.floor(quantity)
  if (qty < 1) return 0
  return tiersFor(tier).find((t) => qty >= t.minQty)?.percentOff ?? 0
}

/**
 * Per-token price (cents) after the volume discount. Rounded to whole cents
 * because Stripe bills unit_amount × quantity and will not take a fraction.
 */
export function discountedUnitCents(tier: OrgTier, quantity: number): number {
  const base = analysisBaseCents(tier)
  const percentOff = volumeDiscountPercent(tier, quantity)
  if (percentOff === 0) return base
  return Math.round((base * (100 - percentOff)) / 100)
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

/** Format cents for display: 179 -> "$1.79". */
export function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * A tier percentage as it should be shown: a whole number.
 *
 * The tiers themselves carry decimals on purpose — 52.7% off 349¢ is what
 * lands on the advertised $1.65, and rounding the tier would move the price
 * itself. So only the label rounds: "save 53%" sits beside the exact cent
 * figure it came from.
 */
export function percentLabel(percentOff: number): number {
  return Math.round(percentOff)
}
