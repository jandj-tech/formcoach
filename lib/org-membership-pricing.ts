// Pure pricing for ORG-SPONSORED player memberships — no DB, env or Stripe
// imports, so this file is safe to import from client components (same rule
// as lib/team-pricing.ts and lib/player-plans.ts).
//
// An organization prepays a block of seats (one Stripe Checkout, mode
// 'payment', never recurring). Each seat carries the Player or Pro allowance
// for a fixed term and can be assigned to one player at a time.
//
// Prices are flat numeric cents charged in the buyer's region currency — the
// same convention as every other price in the product ($149 USD in the US,
// $149 CAD in Canada; see lib/stripe.ts and lib/region.ts).

import { addMonthsClamped, PLAYER_PLANS, type PlayerPlan } from './player-plans'

/** Same ids as lib/player-plans.ts — a seat grants exactly that plan's caps. */
export type MembershipPlan = PlayerPlan
export type MembershipTerm = 'm3' | 'm6' | 'm12'

export const MEMBERSHIP_TERMS: { id: MembershipTerm; label: string; months: number }[] = [
  { id: 'm3', label: '3 months', months: 3 },
  { id: 'm6', label: '6 months', months: 6 },
  { id: 'm12', label: '12 months', months: 12 },
]

export const MEMBERSHIP_PLANS: ReadonlyArray<MembershipPlan> = ['player', 'pro']

/** Smallest first order. Top-ups may be smaller once the org holds this many live seats. */
export const MIN_MEMBERSHIP_SEATS = 10

/** Largest single order — a sanity ceiling, far above any real club. */
export const MAX_MEMBERSHIP_SEATS_PER_ORDER = 500

/** Tier thresholds, ascending. Index i of each price triple is tier MEMBERSHIP_TIERS[i]. */
export const MEMBERSHIP_TIERS: readonly number[] = [10, 25, 50]

export type MembershipTier = 10 | 25 | 50

/**
 * Per-player price (cents) for the whole term, at tiers 10+ / 25+ / 50+.
 * Final table from MEMBERSHIP-PRICING.md (2026-09-28), including the new
 * 3-month term and the three trimmed Year cells (Player 25+ $135, Pro 25+
 * $229, Pro 50+ $219). Invariants (unit-tested in
 * scripts/test-org-membership-pricing.ts): per-month price strictly falls as
 * the term lengthens in every tier, and as the tier grows in every term.
 */
export const MEMBERSHIP_PRICE_CENTS: Record<
  MembershipPlan,
  Record<MembershipTerm, [number, number, number]>
> = {
  player: {
    m3: [4200, 3900, 3600],
    m6: [7500, 6900, 6500],
    m12: [14900, 13500, 12900],
  },
  pro: {
    m3: [7200, 6700, 6200],
    m6: [12900, 11900, 11200],
    m12: [24900, 22900, 21900],
  },
}

export function isMembershipPlan(value: unknown): value is MembershipPlan {
  return value === 'player' || value === 'pro'
}

export function isMembershipTerm(value: unknown): value is MembershipTerm {
  return value === 'm3' || value === 'm6' || value === 'm12'
}

export function termMonths(term: MembershipTerm): number {
  return MEMBERSHIP_TERMS.find((t) => t.id === term)!.months
}

export function termLabel(term: MembershipTerm): string {
  return MEMBERSHIP_TERMS.find((t) => t.id === term)!.label
}

/** When a seat bought for `term` starting at `startsAt` stops covering (exclusive). */
export function membershipEndsAt(startsAt: Date, term: MembershipTerm): Date {
  return addMonthsClamped(startsAt, termMonths(term))
}

/** The tier an order lands in: the org's live unexpired seats PLUS the new ones. */
export function membershipTierFor(totalSeats: number): MembershipTier {
  if (totalSeats >= 50) return 50
  if (totalSeats >= 25) return 25
  return 10
}

/**
 * What the same player would pay personally for the same stretch of time,
 * measured against the MONTHLY retail price for every term (Player $18.95,
 * Pro $28.95 × months). One yardstick for all three terms keeps "save N%"
 * readable: a longer term or a bigger tier always saves at least as much.
 * (The personal annual plan is a discount in its own right, so comparing the
 * 12-month term against it made the Year cells look like the worst deal.)
 */
export function membershipRetailCents(plan: MembershipPlan, term: MembershipTerm): number {
  return PLAYER_PLANS[plan].monthlyCents * termMonths(term)
}

/** The personal monthly price the savings are measured against ($18.95 / $28.95). */
export function membershipRetailMonthlyCents(plan: MembershipPlan): number {
  return PLAYER_PLANS[plan].monthlyCents
}

/** Per-player price spread over the term's months, rounded to the cent ($149 / 12 → $12.42). */
export function membershipPerMonthCents(unitCents: number, term: MembershipTerm): number {
  return Math.round(unitCents / termMonths(term))
}

/** Whole-percent saving of `unitCents` against the monthly retail price × months. */
export function membershipSavingsPercent(plan: MembershipPlan, term: MembershipTerm, unitCents: number): number {
  const retail = membershipRetailCents(plan, term)
  return Math.round(((retail - unitCents) / retail) * 100)
}

/**
 * Why an order of `newSeats` is not allowed, or null when it is. The minimum
 * applies to the ORDER, unless the org already holds MIN_MEMBERSHIP_SEATS live
 * seats — then a top-up of any size is fine. Exposed so the UI can validate
 * without try/catch around membershipQuote.
 */
export function membershipSeatsError(newSeats: number, liveSeats: number): string | null {
  if (!Number.isInteger(newSeats) || newSeats < 1) return 'Enter a whole number of seats.'
  if (newSeats > MAX_MEMBERSHIP_SEATS_PER_ORDER) {
    return `At most ${MAX_MEMBERSHIP_SEATS_PER_ORDER} seats per order.`
  }
  const live = Math.max(0, Math.floor(liveSeats) || 0)
  if (live < MIN_MEMBERSHIP_SEATS && newSeats < MIN_MEMBERSHIP_SEATS) {
    return `The minimum order is ${MIN_MEMBERSHIP_SEATS} seats.`
  }
  return null
}

export interface MembershipQuote {
  tier: MembershipTier
  unitCents: number
  totalCents: number
  /** unitCents spread over the term's months. */
  perMonthCents: number
  /** Monthly retail price × the term's months (never the personal annual price). */
  retailPerPlayerCents: number
  /** Saving vs retailPerPlayerCents, whole percent. */
  savingsPercent: number
}

/**
 * Price an order of `newSeats` seats. `liveSeats` is the org's live,
 * unexpired seats across ALL plans and terms (paid, not refunded, ends_at in
 * the future) — it sets the tier together with the new seats, and existing
 * seats are never repriced. Throws RangeError when the order is not allowed
 * (see membershipSeatsError).
 */
export function membershipQuote(
  plan: MembershipPlan,
  term: MembershipTerm,
  newSeats: number,
  liveSeats: number,
): MembershipQuote {
  if (!isMembershipPlan(plan)) throw new RangeError('Unknown plan')
  if (!isMembershipTerm(term)) throw new RangeError('Unknown term')
  const err = membershipSeatsError(newSeats, liveSeats)
  if (err) throw new RangeError(err)
  const live = Math.max(0, Math.floor(liveSeats) || 0)
  const tier = membershipTierFor(live + newSeats)
  const unitCents = MEMBERSHIP_PRICE_CENTS[plan][term][MEMBERSHIP_TIERS.indexOf(tier)]
  return {
    tier,
    unitCents,
    totalCents: unitCents * newSeats,
    perMonthCents: membershipPerMonthCents(unitCents, term),
    retailPerPlayerCents: membershipRetailCents(plan, term),
    savingsPercent: membershipSavingsPercent(plan, term, unitCents),
  }
}
