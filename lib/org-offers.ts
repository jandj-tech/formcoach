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
// Selling is quote-gated: organizations.platform_share_percent is NULL until
// the site admin sets that org's revenue split, and offers cannot be
// activated or purchased before then.

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
  platformSharePercent: number | null
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

/** Selling is enabled for an org once the admin has quoted its split. */
export function sellingEnabled(platformSharePercent: number | null | undefined): boolean {
  return platformSharePercent !== null && platformSharePercent !== undefined
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
  sortOrder: number
}

/**
 * Draft offers seeded (INACTIVE) for an org's first visit to the builder.
 * These numbers are conversation-starters, not policy: the org and the site
 * admin edit them freely, and nothing can be bought until the org's split is
 * quoted AND the org turns an offer on.
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
    sortOrder: 4,
  },
]
