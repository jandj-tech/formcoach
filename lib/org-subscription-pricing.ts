// Pure constants for the organization subscription — no DB or Stripe imports,
// so this file is safe to import from client components. Same rule as
// lib/team-pricing.ts and lib/org-class-pricing.ts.

/** Monthly plan, billed every month (cents). */
export const ORG_MONTHLY_CENTS = 1499

/** Annual plan, billed once a year (cents). Works out to $9.99/month. */
export const ORG_ANNUAL_TOTAL_CENTS = 11988

/** The per-month figure the annual plan is advertised at (cents). */
export const ORG_ANNUAL_MONTHLY_CENTS = 999

/** Launch offer: half off the first three months of the MONTHLY plan. */
export const LAUNCH_OFFER_PERCENT_OFF = 50
export const LAUNCH_OFFER_MONTHS = 3

/** How long the launch offer stays open once the pricing page is loaded. */
export const LAUNCH_OFFER_WINDOW_SECONDS = 300

/**
 * How many times one signup may re-arm the countdown.
 *
 * The offer is meant to reset when someone comes back, so this is not a
 * per-visit limit in any way a real person would notice — it is a ceiling that
 * stops the discount from being renewable forever by a script.
 */
export const LAUNCH_OFFER_MAX_GRANTS = 10

/** Stripe coupon id for the launch offer. Created lazily — see lib/org-subscription.ts. */
export const LAUNCH_COUPON_ID = 'org-launch-50-3mo'

export type OrgPlan = 'monthly' | 'annual'

/** True for a plan string that came off the wire. */
export function isOrgPlan(value: unknown): value is OrgPlan {
  return value === 'monthly' || value === 'annual'
}

/** What one billing cycle costs, in cents. */
export function planTotalCents(plan: OrgPlan): number {
  return plan === 'annual' ? ORG_ANNUAL_TOTAL_CENTS : ORG_MONTHLY_CENTS
}

/**
 * The discounted first-3-months monthly price (cents).
 *
 * Note 1499 * 50% is 749.5¢, so this rounds. Stripe does its own rounding on
 * the invoice — confirm the first invoice really reads this figure in test mode
 * before advertising it.
 */
export function launchOfferMonthlyCents(): number {
  return Math.round((ORG_MONTHLY_CENTS * (100 - LAUNCH_OFFER_PERCENT_OFF)) / 100)
}

/** What the annual plan saves against twelve monthly payments (cents). Exactly $60.00. */
export function annualSavingsCents(): number {
  return ORG_MONTHLY_CENTS * 12 - ORG_ANNUAL_TOTAL_CENTS
}

/** How much cheaper the annual plan is, as a whole percent. */
export function annualPercentOff(): number {
  return Math.round((annualSavingsCents() / (ORG_MONTHLY_CENTS * 12)) * 100)
}

/** Format cents for display: 1499 -> "$14.99". */
export function orgUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * What the plan includes, in the order it reads best on the pricing card.
 *
 * `note` carries the honest caveat where there is one. The shooting class is
 * the important case: the plan grants the right to enrol, but enrolment is
 * still billed per player, and a card that implies otherwise is a refund
 * request waiting to happen.
 */
export interface OrgPlanFeature {
  label: string
  note?: string
}

export const ORG_PLAN_FEATURES: ReadonlyArray<OrgPlanFeature> = [
  { label: 'Analysis tokens at $2.49', note: '$1.49 each when you buy 5 or more — vs $3.49 solo' },
  { label: 'Team scheduling with RSVPs' },
  { label: 'Team chat for coaches and players' },
  { label: 'Player leaderboards and improvement tracking' },
  { label: 'Unlimited teams and coaches under one organization' },
  { label: 'Access to the 10-week shooting class', note: 'enrolment billed per player' },
]
