// Pure pricing constants for the team token model — no DB imports, so this
// file is safe to import from client components.

/**
 * A team unlocks the discounted token price once it reaches this many joined
 * players (or has a class package bought for it).
 */
export const INITIATION_MIN_PLAYERS = 8

/** Regular per-analysis price (cents) — players, and coaches/orgs before their team is initiated. */
export const REGULAR_ANALYSIS_PRICE_CENTS = 349

/**
 * Discounted per-token price (cents) once a team is initiated — this is the
 * org/team HARD FLOOR: no volume discount ever prices an org/team analysis
 * below this.
 */
export const TEAM_TOKEN_PRICE_CENTS = 149

/**
 * Hard floor (cents) for regular (non-initiated) buyers — even the deepest
 * bulk order never prices a regular analysis below this.
 */
export const REGULAR_FLOOR_CENTS = 179

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
 * let the same player see $1.79 on one page and $1.49 on another.
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
  // The advertised curve: 3 for $6.99 ($2.33/ea), and from 5 the price floors
  // at $1.79/ea (REGULAR_FLOOR_CENTS) — larger orders never go below the floor.
  { minQty: 5, percentOff: 48.7 },
  { minQty: 3, percentOff: 33.2 },
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
// The org/team rate ($1.49) is itself the hard floor — the cheapest price
// anyone can get — so there is no further bulk discount on top of it.
export const TEAM_VOLUME_TIERS: ReadonlyArray<VolumeTier> = []

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
  const raw = percentOff === 0
    ? baseUnitCents
    : Math.round((baseUnitCents * (100 - percentOff)) / 100)
  // Hard floors: org/team never below TEAM_TOKEN_PRICE_CENTS ($1.49), regular
  // never below REGULAR_FLOOR_CENTS ($1.79) — even at the deepest bulk tier.
  const floor = baseUnitCents <= TEAM_TOKEN_PRICE_CENTS ? TEAM_TOKEN_PRICE_CENTS : REGULAR_FLOOR_CENTS
  return Math.max(floor, raw)
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
