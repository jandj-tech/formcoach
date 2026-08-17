// Pure pricing constants for the team token model — no DB imports, so this
// file is safe to import from client components.

/**
 * A team unlocks the discounted token price once it reaches this many joined
 * players (or has a class package bought for it).
 */
export const INITIATION_MIN_PLAYERS = 8

/** Regular per-analysis price (cents) — players, and coaches/orgs before their team is initiated. */
export const REGULAR_ANALYSIS_PRICE_CENTS = 179

/** Discounted per-token price (cents) once a team is initiated. */
export const TEAM_TOKEN_PRICE_CENTS = 99

/**
 * Per-order quantity ceilings, shared by the buy UI and the routes that
 * charge, so a stepper can never offer a quantity checkout would reject.
 * These match the caps the equivalent coach and org routes already used.
 */
export const MAX_TOKENS_PER_ORDER = 1000
export const MAX_COACH_CREDITS_PER_ORDER = 500

/**
 * The per-analysis base price for one buyer, before volume discounts.
 *
 * Every surface that shows or charges an analysis price goes through here —
 * players, coaches and orgs alike. Reading the two constants directly is what
 * let the same player see $1.79 on one page and $0.99 on another.
 */
export function analysisUnitCents(initiated: boolean): number {
  return initiated ? TEAM_TOKEN_PRICE_CENTS : REGULAR_ANALYSIS_PRICE_CENTS
}

export type VolumeTier = { minQty: number; percentOff: number }

/**
 * Volume discount tiers, applied to a SINGLE order.
 *
 * The percentage comes off every token in the order, not just the ones above
 * the threshold. That matters: it means a larger order is never more expensive
 * per token than a smaller one, so crossing a tier always rewards the buyer
 * instead of punishing them.
 *
 * Ordered highest-first — `find` returns the best tier the quantity qualifies for.
 */
export const REGULAR_VOLUME_TIERS: ReadonlyArray<VolumeTier> = [
  { minQty: 100, percentOff: 30 },
  { minQty: 50, percentOff: 25 },
  { minQty: 25, percentOff: 20 },
  { minQty: 10, percentOff: 15 },
  { minQty: 5, percentOff: 10 },
  { minQty: 3, percentOff: 5 },
]

/**
 * The ladder for buyers already on the discounted team rate — deliberately
 * shallower, and starting later, than the regular one.
 *
 * TEAM_TOKEN_PRICE_CENTS is itself the volume discount: 45% off list, given
 * for filling a roster rather than for the size of one order. Stacking the
 * regular ladder on top of it would compound two discounts and take an
 * analysis to well under half what a single one earns, so a team's bulk
 * pricing starts where the reward for a genuinely large order begins.
 *
 * These four tiers are the single ladder everyone shared before the split, so
 * no existing team's price moved when the regular ladder was deepened.
 */
export const TEAM_VOLUME_TIERS: ReadonlyArray<VolumeTier> = [
  { minQty: 100, percentOff: 25 },
  { minQty: 50, percentOff: 15 },
  { minQty: 25, percentOff: 10 },
  { minQty: 10, percentOff: 5 },
]

/**
 * Which ladder a base rate earns.
 *
 * The base price already says which kind of buyer this is — every charging
 * route resolves `initiated` into TEAM_TOKEN_PRICE_CENTS or
 * REGULAR_ANALYSIS_PRICE_CENTS before pricing anything — so reading the ladder
 * back off the base is what keeps the rate and the discount from ever
 * disagreeing. No caller passes a separate flag, so no caller can pass the
 * wrong one.
 *
 * `<=` rather than `===` on purpose: a rate at or below the team rate is
 * already a cut price, so any future cheaper rate falls into the shallow
 * ladder rather than stacking the deep one on top of it.
 */
export function tiersFor(baseUnitCents: number): ReadonlyArray<VolumeTier> {
  return baseUnitCents <= TEAM_TOKEN_PRICE_CENTS ? TEAM_VOLUME_TIERS : REGULAR_VOLUME_TIERS
}

/**
 * Percent off for an order of `quantity` at `baseUnitCents`. 0 below the first
 * tier. Floors the quantity, so a fractional one can never price a tier it
 * does not actually buy.
 */
export function volumeDiscountPercent(baseUnitCents: number, quantity: number): number {
  if (!Number.isFinite(quantity)) return 0
  const qty = Math.floor(quantity)
  if (qty < 1) return 0
  return tiersFor(baseUnitCents).find((t) => qty >= t.minQty)?.percentOff ?? 0
}

/**
 * Per-token price (cents) after the volume discount. Rounded to whole cents
 * because Stripe bills unit_amount × quantity and will not take a fraction.
 */
export function discountedUnitCents(baseUnitCents: number, quantity: number): number {
  const percentOff = volumeDiscountPercent(baseUnitCents, quantity)
  if (percentOff === 0) return baseUnitCents
  return Math.round((baseUnitCents * (100 - percentOff)) / 100)
}

/**
 * What an order costs, what the discount saved, and the nearest tier above —
 * drives both checkout and the UI. `nextTier` is null in the top tier.
 */
export function orderPricing(baseUnitCents: number, quantity: number) {
  const percentOff = volumeDiscountPercent(baseUnitCents, quantity)
  const unitCents = discountedUnitCents(baseUnitCents, quantity)
  const qty = Math.max(0, Math.floor(quantity) || 0)
  const totalCents = unitCents * qty
  const fullTotalCents = baseUnitCents * qty
  // Tiers are highest-first, so the last one still above `qty` is the nearest.
  const above = tiersFor(baseUnitCents).filter((t) => t.minQty > qty)
  return {
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
