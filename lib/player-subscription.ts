import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { stripeIdOf, subscriptionPeriodEnd } from '@/lib/org-subscription'
import {
  isPlayerBillingInterval,
  isPlayerPlan,
  monthlyWindow,
  playerStatusEntitled,
  quotaDecision,
  weeklyWindow,
  type PlayerBillingInterval,
  type PlayerPlan,
  type QuotaDecision,
} from '@/lib/player-plans'

/**
 * Stripe-side and database-side plumbing for the PLAYER subscription
 * (LearnHoops Player / Pro), mirroring lib/org-subscription.ts for orgs.
 *
 * Two invariants live here and nowhere else:
 *
 *   1. Usage is DERIVED, never counted up: an included analysis is a
 *      submissions row stamped entitlement_source='subscription' inside the
 *      current billing-anchored window. There is no counter to drift, and
 *      unused allowance cannot roll over because last window's rows simply
 *      fall outside the next window's predicate.
 *
 *   2. Reservation is SERIALIZED per user: the stamp happens inside a
 *      transaction that first locks the user row, so two tabs racing for the
 *      last included analysis cannot both count the same usage snapshot.
 */

export interface PlayerSubscription {
  plan: PlayerPlan
  interval: PlayerBillingInterval
  status: string
  /** Billing cycle anchor — every usage window derives from this. */
  anchor: Date
  periodEnd: Date | null
  cancelAtPeriodEnd: boolean
  stripeSubscriptionId: string | null
  stripeCustomerId: string | null
}

interface UserPlanRow {
  plan: string | null
  plan_interval: string | null
  plan_status: string | null
  plan_anchor: string | Date | null
  plan_period_end: string | Date | null
  plan_cancel_at_period_end: boolean | null
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
}

function rowToSubscription(row: UserPlanRow | undefined): PlayerSubscription | null {
  if (!row || !isPlayerPlan(row.plan) || !row.plan_anchor) return null
  const interval = isPlayerBillingInterval(row.plan_interval) ? row.plan_interval : 'monthly'
  return {
    plan: row.plan,
    interval,
    status: row.plan_status ?? 'canceled',
    anchor: new Date(row.plan_anchor),
    periodEnd: row.plan_period_end ? new Date(row.plan_period_end) : null,
    cancelAtPeriodEnd: row.plan_cancel_at_period_end ?? false,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripeCustomerId: row.stripe_customer_id,
  }
}

const PLAN_COLUMNS_MISSING = /column .* does not exist/i

/**
 * The user's player subscription, or null when they never had one. A canceled
 * subscription still comes back (status tells the story) so the dashboard can
 * say "your plan ended" instead of pretending it never existed. Degrades to
 * null on a database that hasn't run `npm run migrate` yet, matching the
 * house self-healing convention.
 */
export async function getPlayerSubscription(userId: string): Promise<PlayerSubscription | null> {
  try {
    const [row] = (await db`
      SELECT plan, plan_interval, plan_status, plan_anchor, plan_period_end,
             plan_cancel_at_period_end, stripe_subscription_id, stripe_customer_id
      FROM users WHERE id = ${userId}
    `) as unknown as [UserPlanRow | undefined]
    return rowToSubscription(row)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (PLAN_COLUMNS_MISSING.test(msg)) return null
    throw err
  }
}

/** Entitled = the plan currently grants its included allowance. */
export function subscriptionEntitled(sub: PlayerSubscription | null): sub is PlayerSubscription {
  return !!sub && playerStatusEntitled(sub.status)
}

/**
 * Read the plan/interval a live Stripe subscription represents, trusting the
 * price actually attached over metadata (metadata says what checkout intended;
 * the item says what is billed today, and plan changes rewrite the item).
 */
function planFromStripeSubscription(sub: Stripe.Subscription): {
  plan: PlayerPlan | null
  interval: PlayerBillingInterval
} {
  const metaPlan = sub.metadata?.playerPlan
  const plan = isPlayerPlan(metaPlan) ? metaPlan : null
  const stripeInterval = sub.items?.data?.[0]?.price?.recurring?.interval
  const interval: PlayerBillingInterval = stripeInterval === 'year' ? 'annual' : 'monthly'
  return { plan, interval }
}

/**
 * Mirror a Stripe subscription's state onto its user. Driven by
 * customer.subscription.updated/.deleted (renewals ride on `updated`, same as
 * the org path — no invoice.paid handler). Keyed on stripe_subscription_id, so
 * an event for a subscription this app does not know is a harmless no-op.
 */
export async function syncSubscriptionToUser(sub: Stripe.Subscription): Promise<void> {
  const { plan, interval } = planFromStripeSubscription(sub)
  const periodEnd = subscriptionPeriodEnd(sub)
  const anchor =
    typeof sub.billing_cycle_anchor === 'number' ? new Date(sub.billing_cycle_anchor * 1000) : null
  try {
    await db`
      UPDATE users
      SET plan = COALESCE(${plan}, plan),
          plan_interval = ${interval},
          plan_status = ${sub.status},
          plan_cancel_at_period_end = ${sub.cancel_at_period_end ?? false},
          plan_period_end = ${periodEnd},
          plan_anchor = COALESCE(${anchor}, plan_anchor)
      WHERE stripe_subscription_id = ${sub.id}
    `
  } catch (err) {
    console.error('[player-subscription] sync failed:', sub.id, err)
  }
}

/**
 * Attach a freshly-paid subscription checkout to its user.
 *
 * Shared by the Stripe webhook and the success route the buyer lands on, for
 * the same reason the org flow is: whichever arrives first wins and the other
 * is a harmless repeat (idempotent — same values every time). Returns false
 * when the metadata carries no userId or nothing matched.
 */
export async function applyPlayerSubscriptionCheckout(
  session: Stripe.Checkout.Session,
): Promise<boolean> {
  const userId = session.metadata?.userId
  const plan = session.metadata?.playerPlan
  if (!userId || !isPlayerPlan(plan)) return false

  const customerId = stripeIdOf(session.customer as string | { id: string } | null)
  const subscriptionId = stripeIdOf(session.subscription as string | { id: string } | null)
  if (!subscriptionId) return false

  // The checkout session doesn't carry the billing anchor or period — the
  // subscription does. One retrieve gets the authoritative values instead of
  // guessing "now", which would drift from Stripe by the seconds checkout took.
  let status = 'active'
  let interval: PlayerBillingInterval =
    session.metadata?.playerInterval === 'annual' ? 'annual' : 'monthly'
  let anchor = new Date()
  let periodEnd: Date | null = null
  try {
    const sub = await getStripe().subscriptions.retrieve(subscriptionId)
    status = sub.status
    interval = planFromStripeSubscription(sub).interval
    if (typeof sub.billing_cycle_anchor === 'number') {
      anchor = new Date(sub.billing_cycle_anchor * 1000)
    }
    periodEnd = subscriptionPeriodEnd(sub)
  } catch (err) {
    console.error('[player-subscription] subscription retrieve failed:', subscriptionId, err)
  }

  try {
    const rows = (await db`
      UPDATE users
      SET plan = ${plan},
          plan_interval = ${interval},
          plan_status = ${status},
          plan_anchor = ${anchor},
          plan_period_end = ${periodEnd},
          plan_cancel_at_period_end = FALSE,
          stripe_subscription_id = ${subscriptionId},
          stripe_customer_id = COALESCE(${customerId}, stripe_customer_id)
      WHERE id = ${userId}
      RETURNING id
    `) as unknown as unknown[]
    return rows.length > 0
  } catch (err) {
    console.error('[player-subscription] checkout apply failed:', userId, err)
    return false
  }
}

/**
 * The Stripe Product for a player plan, created on first use. Only the
 * in-place plan change needs this: SubscriptionItemUpdateParams.PriceData
 * requires `product` (an id) where checkout takes inline `product_data` —
 * same constraint and same lazy idempotent pattern as ensureTierProduct in
 * lib/org-subscription.ts. A Product is currency-agnostic, so one per plan
 * serves USD and CAD off the same numeric amount.
 */
export async function ensurePlayerPlanProduct(plan: PlayerPlan, name: string): Promise<string> {
  const id = `learnhoops-player-${plan}`
  const stripe = getStripe()
  try {
    await stripe.products.retrieve(id)
  } catch {
    try {
      await stripe.products.create({ id, name })
    } catch (err) {
      // A concurrent request may have created it between the two calls.
      const code = (err as { code?: string })?.code
      if (code !== 'resource_already_exists') throw err
    }
  }
  return id
}

/**
 * Open a Stripe billing portal session for a player. Null when they have no
 * Stripe customer (never subscribed) — callers hide the button rather than
 * erroring, same contract as the org's billingPortalUrl.
 */
export async function playerBillingPortalUrl(
  userId: string,
  returnUrl: string,
): Promise<string | null> {
  const [row] = (await db`
    SELECT stripe_customer_id FROM users WHERE id = ${userId}
  `) as unknown as [{ stripe_customer_id: string | null } | undefined]
  const customer = row?.stripe_customer_id
  if (!customer) return null
  const session = await getStripe().billingPortal.sessions.create({
    customer,
    return_url: returnUrl,
  })
  return session.url
}

// --- usage -------------------------------------------------------------------

export interface SubscriptionUsage {
  weeklyUsed: number
  monthlyUsed: number
  weeklyWindowStart: Date
  weeklyResetAt: Date
  monthlyWindowStart: Date
  monthlyResetAt: Date
}

/**
 * The usage predicate, in one place: a submission consumes included allowance
 * when it is stamped 'subscription' and either finished successfully or is
 * still in flight (recent 'processing' rows count so a concurrent request
 * can't slip in while one is mid-grade; rows stranded by a crash age out of
 * the count after 15 minutes instead of eating allowance forever; 'failed'
 * rows never count — a genuine server failure refunds the included analysis).
 */
function countUsage(
  sql: typeof db,
  userId: string,
  weekly: { start: Date; end: Date },
  monthly: { start: Date; end: Date },
) {
  return sql`
    SELECT
      COUNT(*) FILTER (
        WHERE created_at >= ${weekly.start} AND created_at < ${weekly.end}
      )::int AS weekly_used,
      COUNT(*) FILTER (
        WHERE created_at >= ${monthly.start} AND created_at < ${monthly.end}
      )::int AS monthly_used
    FROM submissions
    WHERE user_id = ${userId}
      AND entitlement_source = 'subscription'
      AND (
        status = 'complete'
        OR (status = 'processing' AND created_at > NOW() - INTERVAL '15 minutes')
      )
  ` as unknown as Promise<[{ weekly_used: number; monthly_used: number }]>
}

/** Current-window usage for display. Not serialized — reads only. */
export async function getSubscriptionUsage(
  userId: string,
  sub: PlayerSubscription,
  now = new Date(),
): Promise<SubscriptionUsage> {
  const weekly = weeklyWindow(sub.anchor, now)
  const monthly = monthlyWindow(sub.anchor, now)
  const [row] = await countUsage(db, userId, weekly, monthly)
  return {
    weeklyUsed: row?.weekly_used ?? 0,
    monthlyUsed: row?.monthly_used ?? 0,
    weeklyWindowStart: weekly.start,
    weeklyResetAt: weekly.end,
    monthlyWindowStart: monthly.start,
    monthlyResetAt: monthly.end,
  }
}

export type ReserveResult =
  | { ok: true; decision: QuotaDecision }
  | { ok: false; reason: 'not_subscribed' }
  | { ok: false; reason: 'weekly' | 'monthly'; decision: QuotaDecision; usage: SubscriptionUsage }

/**
 * Try to fund `submissionId` from the included subscription allowance.
 *
 * Runs in a transaction that locks the user row FIRST, so concurrent attempts
 * queue: the second one re-counts after the first commits and sees its stamp.
 * (The bare `FOR UPDATE` elsewhere in /api/analyze releases at statement end
 * because it runs in autocommit — the db.begin here is what makes this one
 * actually serialize.)
 */
export async function reserveSubscriptionAnalysis(
  userId: string,
  submissionId: string,
  now = new Date(),
): Promise<ReserveResult> {
  return (await db.begin(async (sql) => {
    const [row] = (await sql`
      SELECT plan, plan_interval, plan_status, plan_anchor, plan_period_end,
             plan_cancel_at_period_end, stripe_subscription_id, stripe_customer_id
      FROM users WHERE id = ${userId} FOR UPDATE
    `) as unknown as [UserPlanRow | undefined]

    const sub = rowToSubscription(row)
    if (!subscriptionEntitled(sub)) return { ok: false as const, reason: 'not_subscribed' as const }

    const weekly = weeklyWindow(sub.anchor, now)
    const monthly = monthlyWindow(sub.anchor, now)
    const [counts] = await countUsage(sql as unknown as typeof db, userId, weekly, monthly)
    const weeklyUsed = counts?.weekly_used ?? 0
    const monthlyUsed = counts?.monthly_used ?? 0

    const decision = quotaDecision(sub.plan, weeklyUsed, monthlyUsed)
    if (!decision.allowed) {
      return {
        ok: false as const,
        reason: decision.blockedBy!,
        decision,
        usage: {
          weeklyUsed,
          monthlyUsed,
          weeklyWindowStart: weekly.start,
          weeklyResetAt: weekly.end,
          monthlyWindowStart: monthly.start,
          monthlyResetAt: monthly.end,
        },
      }
    }

    await sql`
      UPDATE submissions SET entitlement_source = 'subscription' WHERE id = ${submissionId}
    `
    return { ok: true as const, decision }
  })) as ReserveResult
}

/**
 * The "refund" for an included analysis: mark the submission failed so it
 * drops out of the usage count. (Purchased tokens are refunded by
 * incrementing the balance back; included allowance has no balance to
 * increment — exclusion from the count IS the refund.) Also the terminal
 * state for any errored analysis, which used to strand at 'processing'.
 */
export async function markSubmissionFailed(submissionId: string): Promise<void> {
  try {
    await db`UPDATE submissions SET status = 'failed' WHERE id = ${submissionId}`
  } catch (err) {
    console.error('[player-subscription] failed to mark submission failed:', submissionId, err)
  }
}
