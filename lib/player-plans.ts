// Pure constants and date math for the player subscription plans — no DB or
// Stripe imports, so this file is safe to import from client components.
// Same rule as lib/team-pricing.ts and lib/org-subscription-pricing.ts.

/** The two things a player picks: which plan, and how often they are billed. */
export type PlayerPlan = 'player' | 'pro'
export type PlayerBillingInterval = 'monthly' | 'annual'

export function isPlayerPlan(value: unknown): value is PlayerPlan {
  return value === 'player' || value === 'pro'
}
export function isPlayerBillingInterval(value: unknown): value is PlayerBillingInterval {
  return value === 'monthly' || value === 'annual'
}

export interface PlayerPlanDef {
  id: PlayerPlan
  name: string
  blurb: string
  /** Charged every month on the monthly plan (cents). */
  monthlyCents: number
  /** Charged once a year on the annual plan (cents). */
  annualTotalCents: number
  /** Included analyses per 7-day window. */
  weeklyLimit: number
  /** Included analyses per billing month. */
  monthlyLimit: number
}

/**
 * The plans. Every price on every surface reads from here, so there is exactly
 * one place to change what a plan costs.
 *
 * BOTH limits always apply: a subscriber who has used their weekly allowance
 * waits for the weekly reset even with monthly headroom, and one who has used
 * the monthly allowance waits for the billing month to roll even with weekly
 * headroom. Unused analyses never roll over in either window.
 */
export const PLAYER_PLANS: Readonly<Record<PlayerPlan, PlayerPlanDef>> = {
  player: {
    id: 'player',
    name: 'LearnHoops Player',
    blurb: 'Consistent feedback, every week',
    monthlyCents: 1895,
    annualTotalCents: 19900,
    weeklyLimit: 2,
    monthlyLimit: 6,
  },
  pro: {
    id: 'pro',
    name: 'LearnHoops Pro',
    blurb: 'For players training seriously',
    monthlyCents: 2895,
    annualTotalCents: 29900,
    weeklyLimit: 5,
    monthlyLimit: 15,
  },
}

export const PLAYER_PLAN_ORDER: ReadonlyArray<PlayerPlan> = ['player', 'pro']

/** What one billing cycle costs, in cents. */
export function playerPlanTotalCents(plan: PlayerPlan, interval: PlayerBillingInterval): number {
  const p = PLAYER_PLANS[plan]
  return interval === 'annual' ? p.annualTotalCents : p.monthlyCents
}

/** The per-month figure the annual plan is advertised at (cents, rounded). */
export function playerAnnualPerMonthCents(plan: PlayerPlan): number {
  return Math.round(PLAYER_PLANS[plan].annualTotalCents / 12)
}

/** What annual saves against twelve monthly payments (cents). */
export function playerAnnualSavingsCents(plan: PlayerPlan): number {
  const p = PLAYER_PLANS[plan]
  return p.monthlyCents * 12 - p.annualTotalCents
}

/**
 * How much cheaper annual is, as a whole percent — CALCULATED, never asserted,
 * so the advertised "Save N%" can only ever match the arithmetic.
 * Player: 12%. Pro: 14%.
 */
export function playerAnnualPercentOff(plan: PlayerPlan): number {
  const p = PLAYER_PLANS[plan]
  return Math.round((playerAnnualSavingsCents(plan) / (p.monthlyCents * 12)) * 100)
}

/**
 * The caps, phrased the one way that cannot be misread. Never advertise
 * "2 analyses/week" alone — a reader multiplies by ~4.3 and expects 8–10 a
 * month. This exact string appears on the pricing page, checkout, plan cards,
 * and subscription management so every surface tells the same story.
 */
export function planAllowanceLabel(plan: PlayerPlan): string {
  const p = PLAYER_PLANS[plan]
  return `${p.weeklyLimit} analyses per week, up to ${p.monthlyLimit} per month`
}

/** Subscription statuses that still grant the included allowance. Mirrors the
 * org's ENTITLED_STATUSES: past_due keeps access during the retry window so a
 * flaky card doesn't cut a paying player off mid-week; canceled/unpaid do not. */
export const PLAYER_ENTITLED_STATUSES: ReadonlyArray<string> = ['active', 'trialing', 'past_due']

export function playerStatusEntitled(status: string | null | undefined): boolean {
  return !!status && PLAYER_ENTITLED_STATUSES.includes(status)
}

// --- billing-anchored usage windows -----------------------------------------
//
// All window math is UTC and anchored to the subscription's billing cycle
// anchor (the moment the subscription started), never to calendar weeks or
// viewer timezones. One server-side anchor means a player in Vancouver and one
// in Halifax get identical windows, and nobody gains or loses an analysis by
// crossing a timezone. Windows are half-open: [start, end).

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Add `k` calendar months to `anchor` in UTC, clamping the day-of-month the
 * way billing systems do: an anchor on Jan 31 lands on Feb 28/29, then Mar 31.
 * Clamping (rather than JS Date rollover, which would turn Feb 31 into Mar 3)
 * keeps every window boundary on the same day-of-month the subscription
 * started, which is also how Stripe advances the billing period.
 */
export function addMonthsClamped(anchor: Date, k: number): Date {
  const y = anchor.getUTCFullYear()
  const m = anchor.getUTCMonth() + k
  const targetYear = y + Math.floor(m / 12)
  const targetMonth = ((m % 12) + 12) % 12
  const daysInTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const day = Math.min(anchor.getUTCDate(), daysInTarget)
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  )
}

export interface UsageWindow {
  start: Date
  end: Date
}

/**
 * The 7-day usage window containing `now`, as consecutive weeks from the
 * billing anchor. An annual subscriber gets the same subscription-aligned
 * weeks as a monthly one — never an upfront bank of analyses.
 */
export function weeklyWindow(anchor: Date, now: Date): UsageWindow {
  const elapsed = now.getTime() - anchor.getTime()
  const k = elapsed >= 0 ? Math.floor(elapsed / WEEK_MS) : 0
  const start = new Date(anchor.getTime() + k * WEEK_MS)
  return { start, end: new Date(start.getTime() + WEEK_MS) }
}

/**
 * The billing-month usage window containing `now`: calendar months stepped
 * from the anchor. For a monthly subscription this is exactly the Stripe
 * billing period; for an annual one it slices the year into the twelve months
 * the allowance resets on.
 */
export function monthlyWindow(anchor: Date, now: Date): UsageWindow {
  if (now.getTime() < anchor.getTime()) {
    return { start: anchor, end: addMonthsClamped(anchor, 1) }
  }
  // Estimate the month index, then correct — clamping makes a pure formula
  // off-by-one near short months, so the estimate is verified both ways.
  let k =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - anchor.getUTCMonth())
  while (k > 0 && addMonthsClamped(anchor, k).getTime() > now.getTime()) k--
  while (addMonthsClamped(anchor, k + 1).getTime() <= now.getTime()) k++
  return { start: addMonthsClamped(anchor, k), end: addMonthsClamped(anchor, k + 1) }
}

// --- the quota decision ------------------------------------------------------

export type QuotaBlock = 'weekly' | 'monthly'

export interface QuotaDecision {
  allowed: boolean
  /** Which cap blocked it, when not allowed. Monthly wins the tie: a weekly
   * reset cannot help someone whose billing month is spent. */
  blockedBy?: QuotaBlock
  weeklyRemaining: number
  monthlyRemaining: number
}

/**
 * Whether one more included analysis fits under BOTH caps. Pure, so the same
 * arithmetic is unit-tested directly and shared by the API, the dashboard,
 * and the reservation transaction.
 */
export function quotaDecision(plan: PlayerPlan, weeklyUsed: number, monthlyUsed: number): QuotaDecision {
  const p = PLAYER_PLANS[plan]
  const weeklyRemaining = Math.max(0, p.weeklyLimit - weeklyUsed)
  const monthlyRemaining = Math.max(0, p.monthlyLimit - monthlyUsed)
  if (monthlyRemaining <= 0) {
    return { allowed: false, blockedBy: 'monthly', weeklyRemaining, monthlyRemaining }
  }
  if (weeklyRemaining <= 0) {
    return { allowed: false, blockedBy: 'weekly', weeklyRemaining, monthlyRemaining }
  }
  return { allowed: true, weeklyRemaining, monthlyRemaining }
}

// --- consistency & streaks ---------------------------------------------------
//
// Consistency is measured on fixed Monday-start UTC weeks (not billing weeks):
// it also has to work for players with no subscription at all, and "did you
// show up this week" reads most naturally on real weeks.

/** Midnight UTC on the Monday of the week containing `d`. */
export function weekStartUtc(d: Date): Date {
  const daysSinceMonday = (d.getUTCDay() + 6) % 7
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday),
  )
}

export interface WeekActivity {
  /** Monday-UTC start of the week, as an ISO date string (YYYY-MM-DD). */
  weekStart: string
  analyses: number
  formMinutes: number
  basketballMinutes: number
}

export function weekKey(d: Date): string {
  return weekStartUtc(d).toISOString().slice(0, 10)
}

/** How many points each kind of showing-up earns per week (sums to 25, so
 * four weeks sum to 100). The split slightly favors analyzing — the product's
 * core loop — but a week of logged training still counts most of the way. */
export const CONSISTENCY_WEEK_POINTS = { analysis: 10, formWork: 8, basketball: 7 } as const
export const CONSISTENCY_WINDOW_WEEKS = 4

/**
 * Consistency score, 0–100, over the `CONSISTENCY_WINDOW_WEEKS` most recent
 * whole-ish weeks (the current week counts as one of them).
 *
 * Deliberately transparent — no model, no weights a player can't audit: each
 * of the last four weeks earns up to 25 points, 10 for completing at least one
 * shot analysis, 8 for logging any form work, 7 for logging any other
 * basketball activity. Doing something every week beats doing everything in
 * one week: 10 hours logged in a single day can never outscore four separate
 * active weeks, because a week's points cap at 25 no matter the volume.
 */
export function consistencyScore(weeks: ReadonlyArray<WeekActivity>, now: Date): number {
  const currentStart = weekStartUtc(now)
  const byKey = new Map(weeks.map((w) => [w.weekStart, w]))
  let score = 0
  for (let i = 0; i < CONSISTENCY_WINDOW_WEEKS; i++) {
    const start = new Date(currentStart.getTime() - i * WEEK_MS)
    const w = byKey.get(start.toISOString().slice(0, 10))
    if (!w) continue
    if (w.analyses > 0) score += CONSISTENCY_WEEK_POINTS.analysis
    if (w.formMinutes > 0) score += CONSISTENCY_WEEK_POINTS.formWork
    if (w.basketballMinutes > 0) score += CONSISTENCY_WEEK_POINTS.basketball
  }
  return score
}

/** The one-line explanation shown beside the score, kept next to the formula
 * so the two cannot drift apart. */
export const CONSISTENCY_EXPLANATION =
  'Based on how regularly you’ve analyzed your shot and logged basketball training during the last four weeks.'

function weekIsActive(w: WeekActivity | undefined): boolean {
  return !!w && (w.analyses > 0 || w.formMinutes > 0 || w.basketballMinutes > 0)
}

/**
 * Consecutive active weeks. The streak survives the current week being quiet
 * so far — a streak that read 0 every Monday morning would punish exactly the
 * players it is meant to motivate — but breaks on a fully quiet completed week.
 */
export function currentStreakWeeks(weeks: ReadonlyArray<WeekActivity>, now: Date): number {
  const currentStart = weekStartUtc(now)
  const byKey = new Map(weeks.map((w) => [w.weekStart, w]))
  const at = (i: number) =>
    byKey.get(new Date(currentStart.getTime() - i * WEEK_MS).toISOString().slice(0, 10))

  let streak = 0
  let i = 0
  // The current week only extends a streak; its absence never ends one.
  if (weekIsActive(at(0))) streak++
  i = 1
  while (weekIsActive(at(i))) {
    streak++
    i++
  }
  return streak
}

/** Active weeks out of the trailing `windowWeeks` (current week included). */
export function activeWeeksCount(
  weeks: ReadonlyArray<WeekActivity>,
  now: Date,
  windowWeeks: number,
): number {
  const currentStart = weekStartUtc(now)
  const byKey = new Map(weeks.map((w) => [w.weekStart, w]))
  let active = 0
  for (let i = 0; i < windowWeeks; i++) {
    const start = new Date(currentStart.getTime() - i * WEEK_MS)
    if (weekIsActive(byKey.get(start.toISOString().slice(0, 10)))) active++
  }
  return active
}

// --- training activity -------------------------------------------------------

export type TrainingActivityType = 'form_work' | 'basketball'

export function isTrainingActivityType(value: unknown): value is TrainingActivityType {
  return value === 'form_work' || value === 'basketball'
}

export const TRAINING_ACTIVITY_LABELS: Readonly<Record<TrainingActivityType, string>> = {
  form_work: 'Shooting / Form Work',
  basketball: 'Basketball Activity',
}

/** Longest single entry: 12 hours. Anything above is a typo, not a workout. */
export const TRAINING_MAX_MINUTES = 720
/** How far back an entry may be dated. Recent corrections yes, rewriting a
 * whole season of history (and with it the consistency score) no. */
export const TRAINING_BACKDATE_DAYS = 30
export const TRAINING_NOTE_MAX_CHARS = 280

/** "1h 30m" / "45m" / "3h" — one formatter for web and app parity. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}
