// Pure logic for per-organization offers — no DB imports, so this file is
// safe to import from client components. Server-side queries live in
// lib/org-offers-db.ts.
//
// Pricing model: `regular` is the crossed-out anchor every visitor sees;
// `club` is what this organization's players actually pay; `discount` is an
// optional promo that beats club. The effective price is the lowest defined
// rung. NO price in this file is ever charged directly — every charge reads
// the org's own org_offers row, and the numbers here are only the editable
// drafts seeded for a brand-new org (pricing is quote-negotiated per org and
// finalized later; nothing is hard-coded into purchase logic).
//
// Selling is ON for every entitled (paid/approved) organization. LearnHoops
// keeps DEFAULT_PLATFORM_SHARE_PERCENT of each sale unless the site admin sets
// a per-org percent override, and class sign-ups carry a fixed fee instead.
// The admin can pause selling for one org (organizations.selling_disabled).

export type OfferKind = 'breakdown' | 'ball' | 'course' | 'bundle'

export function isOfferKind(value: unknown): value is OfferKind {
  return value === 'breakdown' || value === 'ball' || value === 'course' || value === 'bundle'
}

/**
 * What a purchase unlocks. 'submission' = the one report it was bought from
 * (a weekly breakdown). 'player' = every report the org releases to that
 * player, past and future — a family that bought the class or the ball is
 * never re-paywalled the following week.
 */
export type UnlockScope = 'submission' | 'player'

export function isUnlockScope(value: unknown): value is UnlockScope {
  return value === 'submission' || value === 'player'
}

/**
 * Parse a platform share percent that came off the wire or out of Stripe
 * metadata (always a string there) or a NUMERIC column (a string from
 * postgres.js). Returns null for anything that isn't a finite 0–100 number so
 * a webhook can refuse to settle an order on garbage rather than NaN-ing a
 * ledger row.
 */
export function parseSharePercent(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value))
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return n
}

export interface OrgOfferPricing {
  regularPriceCents: number
  clubPriceCents: number | null
  discountPriceCents: number | null
}

export interface OrgOffer extends OrgOfferPricing {
  id: string
  orgId: string
  kind: OfferKind
  title: string
  description: string | null
  includesBreakdown: boolean
  includesBall: boolean
  includesCourse: boolean
  shippingCents: number
  joinTeamId: string | null
  unlockScope: UnlockScope
  active: boolean
  /** Per-offer percent override; null = the org's quoted percent. */
  platformSharePercent: number | null
  /** Fixed LearnHoops fee per sale (cents); when set it wins over any percent. */
  platformShareCents: number | null
  sortOrder: number
}

/** The price a player actually pays: the lowest defined rung. */
export function effectivePriceCents(offer: OrgOfferPricing): number {
  return offer.discountPriceCents ?? offer.clubPriceCents ?? offer.regularPriceCents
}

/** True when the regular price should render struck-through beside the effective one. */
export function hasAnchorPrice(offer: OrgOfferPricing): boolean {
  return effectivePriceCents(offer) < offer.regularPriceCents
}

/**
 * LearnHoops' share of a sale when an org has no override and the offer has
 * no fixed fee. A single number here so the admin dashboard, the org's
 * "You get" lines and the checkout all agree.
 */
export const DEFAULT_PLATFORM_SHARE_PERCENT = 30

/** The percent that applies to an org: its override, else the default. */
export function orgSharePercent(override: number | null | undefined): number {
  return override === null || override === undefined ? DEFAULT_PLATFORM_SHARE_PERCENT : override
}

/** Stripe's minimum charge is $0.50; keep a whole-dollar floor for sanity. */
export const MIN_OFFER_PRICE_CENTS = 100
export const MAX_OFFER_PRICE_CENTS = 500000

/**
 * Validate an offer's three price rungs. Returns an error message or null.
 * Rungs must be whole cents within bounds and strictly ordered where defined:
 * discount ≤ club ≤ regular (equal is allowed — it just shows no anchor).
 */
export function validateOfferPrices(p: OrgOfferPricing): string | null {
  const rungs: Array<[string, number | null]> = [
    ['Regular price', p.regularPriceCents],
    ['Club price', p.clubPriceCents],
    ['Discount price', p.discountPriceCents],
  ]
  for (const [label, cents] of rungs) {
    if (cents === null) continue
    if (!Number.isInteger(cents)) return `${label} must be a whole number of cents`
    if (cents < MIN_OFFER_PRICE_CENTS) return `${label} must be at least $${(MIN_OFFER_PRICE_CENTS / 100).toFixed(2)}`
    if (cents > MAX_OFFER_PRICE_CENTS) return `${label} can be at most $${(MAX_OFFER_PRICE_CENTS / 100).toFixed(2)}`
  }
  if (p.clubPriceCents !== null && p.clubPriceCents > p.regularPriceCents)
    return 'Club price cannot be higher than the regular price'
  const ceiling = p.clubPriceCents ?? p.regularPriceCents
  if (p.discountPriceCents !== null && p.discountPriceCents > ceiling)
    return 'Discount price cannot be higher than the club price'
  return null
}

/**
 * Split a paid amount between LearnHoops and the org. The percent is the
 * PLATFORM's share, snapshotted into checkout metadata and recomputed by the
 * webhook from the amount actually paid (so promo codes shrink both shares
 * proportionally). Platform rounds up, the org gets the exact remainder —
 * deterministic, and the two always sum to the total.
 */
export function shareSplit(
  totalCents: number,
  platformSharePercent: number
): { orgShareCents: number; platformShareCents: number } {
  const total = Math.max(0, Math.floor(totalCents))
  const pct = Math.min(100, Math.max(0, platformSharePercent))
  const platformShareCents = Math.ceil((total * pct) / 100)
  return { orgShareCents: total - platformShareCents, platformShareCents }
}

export type ShareRule =
  | { mode: 'flat'; cents: number }
  | { mode: 'percent'; percent: number }

/**
 * Which rule applies to an offer: its own fixed fee, else its own percent,
 * else the org's quoted percent. null when the org has no quote yet.
 */
export function shareRuleFor(
  offer: { platformShareCents: number | null; platformSharePercent: number | null },
  orgPercent: number | null | undefined
): ShareRule | null {
  if (offer.platformShareCents !== null && offer.platformShareCents !== undefined) {
    return { mode: 'flat', cents: offer.platformShareCents }
  }
  if (offer.platformSharePercent !== null && offer.platformSharePercent !== undefined) {
    return { mode: 'percent', percent: offer.platformSharePercent }
  }
  if (orgPercent !== null && orgPercent !== undefined) return { mode: 'percent', percent: orgPercent }
  return null
}

/**
 * Apply a share rule to the product portion of a sale. A fixed fee larger
 * than the sale takes the whole sale (the org's share is never negative).
 */
export function applyShareRule(
  baseCents: number,
  rule: ShareRule
): { orgShareCents: number; platformShareCents: number } {
  const base = Math.max(0, Math.floor(baseCents))
  if (rule.mode === 'flat') {
    const platformShareCents = Math.min(base, Math.max(0, Math.floor(rule.cents)))
    return { orgShareCents: base - platformShareCents, platformShareCents }
  }
  return shareSplit(base, rule.percent)
}

/** Human label for a rule: "$100 per sale" or "30% of each sale". */
export function shareRuleLabel(rule: ShareRule): string {
  return rule.mode === 'flat'
    ? `${offerUsd(rule.cents)} per sale`
    : `${Math.round(rule.percent * 100) / 100}% of each sale`
}

/** Format cents for display: 2999 -> "$29.99". */
export function offerUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export interface DefaultOfferSeed {
  kind: OfferKind
  title: string
  description: string
  includesBreakdown: boolean
  includesBall: boolean
  includesCourse: boolean
  unlockScope: UnlockScope
  regularPriceCents: number
  clubPriceCents: number
  /** Fixed LearnHoops fee seeded on class and ball offers; admin can change it. */
  platformShareCents: number | null
  sortOrder: number
}

/**
 * LearnHoops' fixed fee on every Shooting Class sign-up sold through an org's
 * results/offers pages: $100 to LearnHoops, the rest to the club. Seeded on
 * class offers; the site admin can change it per offer.
 */
export const CLASS_PLATFORM_FEE_CENTS = 10000

/**
 * LearnHoops' fixed fee on every offer that ships a ball, on a cost basis
 * rather than retail: the landed cost of a ball (~$9–12, top of the range)
 * plus a deliberately small allowance toward shipping (carrier rates in
 * lib/shipping.ts run ~$12–24, so LearnHoops absorbs part of it). The club
 * keeps whatever it charges above this. Change the two inputs, not the sum.
 */
export const BALL_COST_CENTS = 1200
export const BALL_SHIPPING_ALLOWANCE_CENTS = 800
export const BALL_PLATFORM_FEE_CENTS = BALL_COST_CENTS + BALL_SHIPPING_ALLOWANCE_CENTS

/**
 * The default fixed LearnHoops fee for an offer, from what it includes: the
 * class fee, the ball fee, or both. null for offers with neither (they use
 * the percent split). Seeds, org-created offers and org edits all go through
 * this so the two fees can't drift apart; the admin can still override per
 * offer.
 */
export function platformFeeFor(includes: { includesCourse: boolean; includesBall: boolean }): number | null {
  const fee = (includes.includesCourse ? CLASS_PLATFORM_FEE_CENTS : 0) + (includes.includesBall ? BALL_PLATFORM_FEE_CENTS : 0)
  return fee > 0 ? fee : null
}

/**
 * Draft offers seeded (INACTIVE) for an org's first visit to the builder.
 * These numbers are conversation-starters, not policy: the org and the site
 * admin edit them freely, and nothing can be bought until the org turns an
 * offer on.
 */
export const DEFAULT_OFFERS: readonly DefaultOfferSeed[] = [
  {
    kind: 'breakdown',
    title: 'Full Shot Breakdown',
    description:
      'See the complete breakdown of your score — every check we grade, what is holding your shot back, and exactly how to fix it.',
    includesBreakdown: true,
    includesBall: false,
    includesCourse: false,
    unlockScope: 'submission',
    regularPriceCents: 4999,
    clubPriceCents: 2999,
    platformShareCents: null,
    sortOrder: 1,
  },
  {
    kind: 'ball',
    title: 'LearnHoops Ball + Full Analysis',
    description:
      'The official LearnHoops training ball shipped to your door, plus the complete breakdown of your shot.',
    includesBreakdown: true,
    includesBall: true,
    includesCourse: false,
    unlockScope: 'player',
    regularPriceCents: 7999,
    clubPriceCents: 5000,
    platformShareCents: BALL_PLATFORM_FEE_CENTS,
    sortOrder: 2,
  },
  {
    kind: 'course',
    title: 'Shooting Class',
    description:
      'Join the training class: weekly coached sessions that rebuild your shot from the ground up. Includes your full shot analysis.',
    includesBreakdown: true,
    includesBall: false,
    includesCourse: true,
    unlockScope: 'player',
    regularPriceCents: 39900,
    clubPriceCents: 30000,
    platformShareCents: CLASS_PLATFORM_FEE_CENTS,
    sortOrder: 3,
  },
  {
    kind: 'bundle',
    title: 'Shooting Class + Ball',
    description:
      'The full package: the training class, the official LearnHoops ball, and your complete shot analysis.',
    includesBreakdown: true,
    includesBall: true,
    includesCourse: true,
    unlockScope: 'player',
    regularPriceCents: 44900,
    clubPriceCents: 34500,
    platformShareCents: CLASS_PLATFORM_FEE_CENTS + BALL_PLATFORM_FEE_CENTS,
    sortOrder: 4,
  },
]
