// Pure constants for the organization subscription — no DB or Stripe imports,
// so this file is safe to import from client components. Same rule as
// lib/team-pricing.ts and lib/org-class-pricing.ts.

import { discountedUnitCents, usd, type OrgTier } from '@/lib/team-pricing'

/** The two things a buyer picks: which plan, and how often they are billed. */
export type PaidTier = 'basic' | 'plus'
export type BillingInterval = 'monthly' | 'annual'

export function isPaidTier(value: unknown): value is PaidTier {
  return value === 'basic' || value === 'plus'
}
export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'annual'
}

export interface OrgTierPlan {
  id: PaidTier
  name: string
  blurb: string
  /** Charged every month on the monthly plan (cents). */
  monthlyCents: number
  /** Charged once a year on the annual plan (cents). */
  annualTotalCents: number
  /** The per-month figure the annual plan is advertised at (cents). */
  annualMonthlyCents: number
  /** How many non-class teams this plan may have. Infinity for unlimited. */
  maxTeams: number
}

/**
 * The plans, in the order they appear on the page.
 *
 * Every price on every surface reads from here, so there is exactly one place
 * to change what a plan costs.
 */
export const ORG_TIERS: Readonly<Record<PaidTier, OrgTierPlan>> = {
  basic: {
    id: 'basic',
    name: 'Basic',
    blurb: 'One team, cheaper analyses',
    monthlyCents: 1299,
    annualTotalCents: 12588, // $10.49/mo
    annualMonthlyCents: 1049,
    maxTeams: 1,
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    blurb: 'Every team, every feature',
    monthlyCents: 2649,
    annualTotalCents: 23988, // $19.99/mo
    annualMonthlyCents: 1999,
    maxTeams: Infinity,
  },
}

export const ORG_TIER_ORDER: ReadonlyArray<PaidTier> = ['basic', 'plus']

/** What one billing cycle costs, in cents. */
export function planTotalCents(tier: PaidTier, interval: BillingInterval): number {
  const p = ORG_TIERS[tier]
  return interval === 'annual' ? p.annualTotalCents : p.monthlyCents
}

/** The figure shown as "per month" for either interval. */
export function planPerMonthCents(tier: PaidTier, interval: BillingInterval): number {
  const p = ORG_TIERS[tier]
  return interval === 'annual' ? p.annualMonthlyCents : p.monthlyCents
}

/** What annual saves against twelve monthly payments (cents). $30 / $78. */
export function annualSavingsCents(tier: PaidTier): number {
  const p = ORG_TIERS[tier]
  return p.monthlyCents * 12 - p.annualTotalCents
}

/** How much cheaper annual is, as a whole percent. 19% / 25%. */
export function annualPercentOff(tier: PaidTier): number {
  const p = ORG_TIERS[tier]
  return Math.round((annualSavingsCents(tier) / (p.monthlyCents * 12)) * 100)
}

// --- launch offer ----------------------------------------------------------

/** Launch offer: a quarter off the first three months of a MONTHLY plan. */
export const LAUNCH_OFFER_PERCENT_OFF = 25
export const LAUNCH_OFFER_MONTHS = 3

/**
 * The discount as a fixed AMOUNT per tier, not a percentage.
 *
 * A percentage lands on fractional cents — 1299 × 25% = 324.75 — which would
 * leave Stripe's rounding to decide what the invoice says while the page had
 * already committed to a number. A fixed amount lands exactly, and keeps the
 * offer prices clean:
 *
 *   Basic  $12.99 − $3.50 = $9.49
 *   Plus   $26.49 − $7.00 = $19.49
 *
 * Both are a hair over a quarter off (26.9% / 26.4%), so advertising "25% off"
 * gives slightly MORE than promised rather than less — the safe direction to
 * err. Changing these amounts mints NEW Stripe coupons automatically, because
 * the amount is baked into the coupon id (launchCouponId below); older coupons
 * stay attached to whoever already redeemed them.
 */
export const LAUNCH_OFFER_AMOUNT_OFF_CENTS: Readonly<Record<PaidTier, number>> = {
  basic: 350,
  plus: 700,
}

/** How long the launch offer stays open once the pricing page is loaded. */
export const LAUNCH_OFFER_WINDOW_SECONDS = 300

// There is no re-arm cap any more. The countdown is set once, when the signup
// form is submitted, and starting a fresh signup is the only way to reset it —
// so the rate limiter on /api/org/signup/start is what bounds how often the
// offer can be renewed, rather than a counter on the row.

/**
 * Stripe coupon id for a tier's launch offer. Created lazily — see
 * lib/org-subscription.ts.
 *
 * The amount is baked into the id so changing the discount creates a NEW
 * coupon rather than silently reusing one carrying the old figure. A Stripe
 * coupon's amount cannot be edited after creation.
 */
export function launchCouponId(tier: PaidTier): string {
  return `org-launch-${tier}-${LAUNCH_OFFER_AMOUNT_OFF_CENTS[tier]}off-${LAUNCH_OFFER_MONTHS}mo`
}

/**
 * The discounted first-3-months monthly price (cents). Exact by construction —
 * see LAUNCH_OFFER_AMOUNT_OFF_CENTS for why this is an amount, not a percent.
 */
export function launchOfferMonthlyCents(tier: PaidTier): number {
  return ORG_TIERS[tier].monthlyCents - LAUNCH_OFFER_AMOUNT_OFF_CENTS[tier]
}

// --- what each plan includes ----------------------------------------------

/**
 * One row per capability, with a flag per plan.
 *
 * Deliberately a single list rather than two, so both cards render the same
 * rows and a cross appears next to what Basic lacks. The difference between the
 * plans is then visible on the page instead of implied by absence — which is
 * both more honest and the entire upsell.
 */
export interface OrgPlanFeature {
  label: string
  note?: string
  basic: boolean
  plus: boolean
}

export const ORG_PLAN_FEATURES: ReadonlyArray<OrgPlanFeature> = [
  {
    label: 'Bulk analysis tokens',
    // Basic and Plus share the org bulk rate: $2.49 each on website orders of
    // 10+, vs the public $5.00 volume rate. Derived, so a reprice updates it.
    note: `${usd(discountedUnitCents('basic', 10))} each when buying 10+ on the website — vs ${usd(discountedUnitCents('none', 10))} without a plan`,
    basic: true,
    plus: true,
  },
  { label: 'Team chat for coaches and players', basic: true, plus: true },
  { label: 'Player leaderboards and improvement tracking', basic: true, plus: true },
  {
    label: 'Access to the 10-week shooting class',
    note: 'enrolment billed per player',
    basic: true,
    plus: true,
  },
  { label: 'Team scheduling with RSVPs', basic: false, plus: true },
  { label: 'Unlimited teams and coaches', note: 'Basic covers one team', basic: false, plus: true },
]

/** Format cents for display: 1499 -> "$14.99". */
export function orgUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * The pricing tier a paid plan grants. Trivial today, but it keeps the mapping
 * in one place: `PaidTier` is what someone buys, `OrgTier` is what the token
 * ladder reads, and they are separate ideas — a lapsed org is `none` for
 * pricing while never having been a `PaidTier` at all.
 */
export function pricingTierFor(tier: PaidTier): OrgTier {
  return tier
}
