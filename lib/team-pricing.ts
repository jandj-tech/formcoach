// Pure pricing constants for the team token model — no DB imports, so this
// file is safe to import from client components.

/** Regular per-analysis price (cents) — individuals who are not on a team. */
export const REGULAR_ANALYSIS_PRICE_CENTS = 349

/**
 * Team / org per-token price for a SMALL order (1–4 tokens), in cents.
 *
 * Every team and every organization gets this rate from day one — there is no
 * member minimum. The full rate ($1.49) is unlocked by buying
 * TEAM_FULL_RATE_MIN_QTY+ in one order — see TEAM_VOLUME_TIERS. Small orders sit
 * at $2.49 because the payment-processor fee eats most of the margin on a
 * single-token purchase, so buyers are nudged to buy in fives.
 */
export const TEAM_TOKEN_PRICE_CENTS = 249

/** The full team / org rate (cents), reached at 5+ tokens in one order — and the floor. */
export const TEAM_FULL_RATE_CENTS = 149

/** Tokens a team / org must buy in one order to reach TEAM_FULL_RATE_CENTS. */
export const TEAM_FULL_RATE_MIN_QTY = 5

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
 *
 * `onTeam` means exactly what it says: on a team, or an organization. There is
 * no roster minimum behind it.
 */
export function analysisUnitCents(onTeam: boolean): number {
  return onTeam ? TEAM_TOKEN_PRICE_CENTS : REGULAR_ANALYSIS_PRICE_CENTS
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
  // The advertised curve: 3 for $6.99 ($2.33/ea), 5–9 at the 5-pack rate
  // ($1.79/ea), and from 10 the price floors at $1.65/ea. Individual (non-team)
  // buyers never go below this floor — the deeper discount is reserved for
  // teams and orgs, whose rate ($1.49) stays the cheapest anywhere.
  { minQty: 10, percentOff: 52.7 },
  { minQty: 5, percentOff: 48.7 },
  { minQty: 3, percentOff: 33.2 },
]

/**
 * The team / org ladder — one step, and it IS the team deal.
 *
 * A small order (1–4) is charged the $2.49 base; at 5+ the price drops to the
 * $1.49 full org rate and floors there — no order, however large, goes lower.
 * The single step exists so orgs are rewarded for buying in fives rather than
 * one at a time (where the card fee erases the margin), not for the raw size of
 * a bulk order. 40.16% off 249¢ rounds to exactly 149¢.
 */
export const TEAM_VOLUME_TIERS: ReadonlyArray<VolumeTier> = [
  { minQty: TEAM_FULL_RATE_MIN_QTY, percentOff: 40.16 },
]

/**
 * Which ladder a base rate earns.
 *
 * The base price already says which kind of buyer this is — every charging
 * route resolves `onTeam` into TEAM_TOKEN_PRICE_CENTS or
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
