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

/**
 * Volume discount tiers, applied to a SINGLE order.
 *
 * The percentage comes off every token in the order, not just the ones above
 * the threshold. That matters: it means a larger order is never more expensive
 * than a smaller one, so crossing a tier always rewards the buyer instead of
 * punishing them. It also stacks on whichever base rate the buyer is on, so a
 * team already paying TEAM_TOKEN_PRICE_CENTS gets the same percentages off.
 *
 * Ordered highest-first — `find` returns the best tier the quantity qualifies for.
 */
export const VOLUME_TIERS: ReadonlyArray<{ minQty: number; percentOff: number }> = [
  { minQty: 100, percentOff: 25 },
  { minQty: 50, percentOff: 15 },
  { minQty: 25, percentOff: 10 },
  { minQty: 10, percentOff: 5 },
]

/** Percent off for an order of `quantity` tokens. 0 below the first tier. */
export function volumeDiscountPercent(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity < 1) return 0
  return VOLUME_TIERS.find((t) => quantity >= t.minQty)?.percentOff ?? 0
}

/**
 * Per-token price (cents) after the volume discount. Rounded to whole cents
 * because Stripe bills unit_amount × quantity and will not take a fraction.
 */
export function discountedUnitCents(baseUnitCents: number, quantity: number): number {
  const percentOff = volumeDiscountPercent(quantity)
  if (percentOff === 0) return baseUnitCents
  return Math.round((baseUnitCents * (100 - percentOff)) / 100)
}

/** What an order costs and what the discount saved — drives both checkout and the UI. */
export function orderPricing(baseUnitCents: number, quantity: number) {
  const percentOff = volumeDiscountPercent(quantity)
  const unitCents = discountedUnitCents(baseUnitCents, quantity)
  const qty = Math.max(0, Math.floor(quantity) || 0)
  const totalCents = unitCents * qty
  const fullTotalCents = baseUnitCents * qty
  return {
    percentOff,
    unitCents,
    totalCents,
    fullTotalCents,
    savingsCents: fullTotalCents - totalCents,
  }
}

/**
 * The next tier up from `quantity`, for "add N more and save X%" nudges.
 * Null once the buyer is already in the top tier.
 */
export function nextVolumeTier(quantity: number): { minQty: number; percentOff: number } | null {
  const above = VOLUME_TIERS.filter((t) => t.minQty > quantity)
  // VOLUME_TIERS is highest-first, so the last match is the nearest tier up.
  return above.length > 0 ? above[above.length - 1] : null
}

/** Format cents for display: 179 -> "$1.79". */
export function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
