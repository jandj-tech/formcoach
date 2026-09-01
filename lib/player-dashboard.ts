import { db } from '@/lib/db'
import {
  getPlayerSubscription,
  getSubscriptionUsage,
  subscriptionEntitled,
  type PlayerSubscription,
} from '@/lib/player-subscription'
import {
  activeWeeksCount,
  CONSISTENCY_EXPLANATION,
  consistencyScore,
  currentStreakWeeks,
  PLAYER_PLANS,
  planAllowanceLabel,
  quotaDecision,
  weekStartUtc,
  type PlayerBillingInterval,
  type PlayerPlan,
  type WeekActivity,
} from '@/lib/player-plans'

/**
 * The consolidated read model behind the player dashboard — website and app
 * both render from this one summary, so the two can never disagree about how
 * many analyses are left. Kept to a handful of queries on purpose: this backs
 * the signed-in home surface (see PERFORMANCE note at the bottom).
 */

export interface UsageSummary {
  /** 'player' | 'pro' | null when the user has no player subscription. */
  plan: PlayerPlan | null
  planName: string | null
  billingFrequency: PlayerBillingInterval | null
  subscriptionStatus: string | null
  /** Whether the plan currently grants its included allowance. */
  entitled: boolean
  cancelAtPeriodEnd: boolean
  /** End of the current Stripe billing period (next charge, or access end). */
  nextBillingAt: string | null
  allowanceLabel: string | null
  weeklyUsed: number
  weeklyLimit: number
  weeklyRemaining: number
  weeklyResetAt: string | null
  /** Whole days until the weekly reset (min 1) — precomputed here so render
   * code never has to call Date.now(). */
  weeklyResetInDays: number | null
  monthlyUsed: number
  monthlyLimit: number
  monthlyRemaining: number
  monthlyResetAt: string | null
  monthlyResetInDays: number | null
  /** Purchased one-off tokens — tracked separately from the subscription
   * allowance, never mixed into the weekly/monthly numbers. */
  purchasedTokens: number
  /** Pre-2026 subscribers grandfathered on unlimited analyses. */
  legacyUnlimited: boolean
  /** What the next analysis would be funded by, so the UI can warn BEFORE a
   * purchased token is consumed ("This analysis will use 1 purchased token"). */
  nextAnalysisSource: 'legacy' | 'subscription' | 'token' | 'none'
}

interface UserBalanceRow {
  analysis_tokens: number | null
  subscription_type: string | null
  subscription_expires_at: string | Date | null
}

async function getUserBalances(userId: string): Promise<UserBalanceRow | undefined> {
  const [row] = (await db`
    SELECT analysis_tokens, subscription_type, subscription_expires_at
    FROM users WHERE id = ${userId}
  `) as unknown as [UserBalanceRow | undefined]
  return row
}

function legacyUnlimitedFrom(row: UserBalanceRow | undefined): boolean {
  return (
    !!row?.subscription_type &&
    !!row?.subscription_expires_at &&
    new Date(row.subscription_expires_at) > new Date()
  )
}

export async function getUsageSummary(userId: string, now = new Date()): Promise<UsageSummary> {
  const [sub, balances] = await Promise.all([getPlayerSubscription(userId), getUserBalances(userId)])
  return buildUsageSummary(userId, sub, balances, now)
}

async function buildUsageSummary(
  userId: string,
  sub: PlayerSubscription | null,
  balances: UserBalanceRow | undefined,
  now: Date,
): Promise<UsageSummary> {
  const purchasedTokens = balances?.analysis_tokens ?? 0
  const legacyUnlimited = legacyUnlimitedFrom(balances)
  const entitled = subscriptionEntitled(sub)

  let weeklyUsed = 0
  let monthlyUsed = 0
  let weeklyResetAt: string | null = null
  let monthlyResetAt: string | null = null
  let weeklyResetInDays: number | null = null
  let monthlyResetInDays: number | null = null
  let weeklyRemaining = 0
  let monthlyRemaining = 0

  if (entitled) {
    const usage = await getSubscriptionUsage(userId, sub, now)
    weeklyUsed = usage.weeklyUsed
    monthlyUsed = usage.monthlyUsed
    weeklyResetAt = usage.weeklyResetAt.toISOString()
    monthlyResetAt = usage.monthlyResetAt.toISOString()
    const days = (d: Date) => Math.max(1, Math.ceil((d.getTime() - now.getTime()) / 86400_000))
    weeklyResetInDays = days(usage.weeklyResetAt)
    monthlyResetInDays = days(usage.monthlyResetAt)
    const decision = quotaDecision(sub.plan, weeklyUsed, monthlyUsed)
    weeklyRemaining = decision.weeklyRemaining
    monthlyRemaining = decision.monthlyRemaining
  }

  const includedAvailable = entitled && weeklyRemaining > 0 && monthlyRemaining > 0

  return {
    plan: sub?.plan ?? null,
    planName: sub ? PLAYER_PLANS[sub.plan].name : null,
    billingFrequency: sub?.interval ?? null,
    subscriptionStatus: sub?.status ?? null,
    entitled,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    nextBillingAt: sub?.periodEnd ? sub.periodEnd.toISOString() : null,
    allowanceLabel: sub ? planAllowanceLabel(sub.plan) : null,
    weeklyUsed,
    weeklyLimit: sub ? PLAYER_PLANS[sub.plan].weeklyLimit : 0,
    weeklyRemaining,
    weeklyResetAt,
    weeklyResetInDays,
    monthlyUsed,
    monthlyLimit: sub ? PLAYER_PLANS[sub.plan].monthlyLimit : 0,
    monthlyRemaining,
    monthlyResetAt,
    monthlyResetInDays,
    purchasedTokens,
    legacyUnlimited,
    nextAnalysisSource: legacyUnlimited
      ? 'legacy'
      : includedAvailable
        ? 'subscription'
        : purchasedTokens > 0
          ? 'token'
          : 'none',
  }
}

// --- training + consistency ----------------------------------------------

export interface TrainingEntry {
  id: string
  activityType: 'form_work' | 'basketball'
  durationMinutes: number
  activityDate: string
  note: string | null
  createdAt: string
}

export interface PlayerDashboard {
  usage: UsageSummary
  /** Trailing weeks (oldest first, current week last), Monday-UTC aligned,
   * zero-filled so charts never have holes. */
  weeks: WeekActivity[]
  currentStreakWeeks: number
  /** Active weeks out of the trailing 8. */
  activeWeeks: number
  activeWeeksWindow: number
  /** 0–100 over the last 4 weeks; see lib/player-plans.ts for the formula. */
  consistencyScore: number
  consistencyExplanation: string
  totalAnalyses: number
  /** Current Monday-UTC week. */
  weekFormMinutes: number
  weekBasketballMinutes: number
  weekAnalyses: number
  /** Current calendar month (UTC) — training reads naturally on real months. */
  monthFormMinutes: number
  monthBasketballMinutes: number
  recentTraining: TrainingEntry[]
}

const SERIES_WEEKS = 8

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * The full dashboard read: 5 fixed-size queries regardless of history length.
 * PERFORMANCE: charts only ever need the trailing SERIES_WEEKS, so every
 * query here is bounded by a date floor — never a lifetime table scan.
 */
export async function getPlayerDashboard(userId: string, now = new Date()): Promise<PlayerDashboard> {
  const currentWeekStart = weekStartUtc(now)
  const seriesFloor = new Date(currentWeekStart.getTime() - (SERIES_WEEKS - 1) * WEEK_MS)
  const monthFloor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const floor = new Date(Math.min(seriesFloor.getTime(), monthFloor.getTime()))

  const [sub, balances] = await Promise.all([getPlayerSubscription(userId), getUserBalances(userId)])

  const [usage, analysisWeeks, trainingRows, totals, recentTraining] = await Promise.all([
    buildUsageSummary(userId, sub, balances, now),
    db`
      SELECT (date_trunc('week', created_at AT TIME ZONE 'utc'))::date::text AS week_start,
             COUNT(*)::int AS analyses
      FROM submissions
      WHERE user_id = ${userId} AND status = 'complete' AND created_at >= ${seriesFloor}
      GROUP BY 1
    ` as unknown as Promise<Array<{ week_start: string; analyses: number }>>,
    db`
      SELECT activity_date::text AS activity_date, activity_type,
             SUM(duration_minutes)::int AS minutes
      FROM training_activities
      WHERE user_id = ${userId} AND activity_date >= ${floor.toISOString().slice(0, 10)}
      GROUP BY 1, 2
    ` as unknown as Promise<
      Array<{ activity_date: string; activity_type: 'form_work' | 'basketball'; minutes: number }>
    >,
    db`
      SELECT COUNT(*)::int AS total
      FROM submissions
      WHERE user_id = ${userId} AND status = 'complete'
    ` as unknown as Promise<[{ total: number }]>,
    db`
      SELECT id, activity_type, duration_minutes, activity_date::text AS activity_date,
             note, created_at
      FROM training_activities
      WHERE user_id = ${userId}
      ORDER BY activity_date DESC, created_at DESC
      LIMIT 30
    ` as unknown as Promise<
      Array<{
        id: string
        activity_type: 'form_work' | 'basketball'
        duration_minutes: number
        activity_date: string
        note: string | null
        created_at: string | Date
      }>
    >,
  ]).catch(async (err) => {
    // A database that hasn't run the training migration yet should degrade to
    // an empty log, not 500 the whole dashboard — the house convention.
    const msg = err instanceof Error ? err.message : String(err)
    if (!/relation .* does not exist|column .* does not exist/i.test(msg)) throw err
    console.warn('[player-dashboard] training tables missing — run `npm run migrate`.')
    const [usageOnly, totalRows] = await Promise.all([
      buildUsageSummary(userId, sub, balances, now),
      db`
        SELECT COUNT(*)::int AS total FROM submissions
        WHERE user_id = ${userId} AND status = 'complete'
      ` as unknown as Promise<[{ total: number }]>,
    ])
    return [usageOnly, [], [], totalRows, []] as const
  })

  // Zero-filled trailing weeks, oldest first.
  const weekMap = new Map<string, WeekActivity>()
  for (let i = SERIES_WEEKS - 1; i >= 0; i--) {
    const start = new Date(currentWeekStart.getTime() - i * WEEK_MS)
    const key = start.toISOString().slice(0, 10)
    weekMap.set(key, { weekStart: key, analyses: 0, formMinutes: 0, basketballMinutes: 0 })
  }
  for (const row of analysisWeeks) {
    const w = weekMap.get(row.week_start)
    if (w) w.analyses = row.analyses
  }

  let monthFormMinutes = 0
  let monthBasketballMinutes = 0
  const monthKey = monthFloor.toISOString().slice(0, 7)
  for (const row of trainingRows) {
    const d = new Date(`${row.activity_date}T00:00:00Z`)
    const w = weekMap.get(weekStartUtc(d).toISOString().slice(0, 10))
    if (w) {
      if (row.activity_type === 'form_work') w.formMinutes += row.minutes
      else w.basketballMinutes += row.minutes
    }
    if (row.activity_date.startsWith(monthKey)) {
      if (row.activity_type === 'form_work') monthFormMinutes += row.minutes
      else monthBasketballMinutes += row.minutes
    }
  }

  const weeks = [...weekMap.values()]
  const current = weeks[weeks.length - 1]

  return {
    usage,
    weeks,
    currentStreakWeeks: currentStreakWeeks(weeks, now),
    activeWeeks: activeWeeksCount(weeks, now, SERIES_WEEKS),
    activeWeeksWindow: SERIES_WEEKS,
    consistencyScore: consistencyScore(weeks, now),
    consistencyExplanation: CONSISTENCY_EXPLANATION,
    totalAnalyses: totals[0]?.total ?? 0,
    weekFormMinutes: current?.formMinutes ?? 0,
    weekBasketballMinutes: current?.basketballMinutes ?? 0,
    weekAnalyses: current?.analyses ?? 0,
    monthFormMinutes,
    monthBasketballMinutes,
    recentTraining: recentTraining.map((r) => ({
      id: r.id,
      activityType: r.activity_type,
      durationMinutes: r.duration_minutes,
      activityDate: r.activity_date,
      note: r.note,
      createdAt: new Date(r.created_at).toISOString(),
    })),
  }
}
