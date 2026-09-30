import { db } from './db'
import {
  isPlayerPlan,
  playerStatusEntitled,
  type PlayerPlan,
} from './player-plans'

/**
 * THE one answer to "what plan does this player have right now?".
 *
 * A player can hold up to three kinds of entitlement at once:
 *
 *   legacy   — pre-2026 users.subscription_type + subscription_expires_at in
 *              the future: unlimited, no caps, never debited. Always wins.
 *   personal — their own Player/Pro subscription in the users.plan slot,
 *              billed by Stripe (stripe_subscription_id set) or Apple
 *              (RevenueCat writes the same columns with that id NULL).
 *   org      — an assigned org_membership_seats row whose term covers now.
 *
 * Personal vs org: the HIGHER plan wins (pro > player); on a tie the org seat
 * wins, so the club's prepaid allowance is used before a paused personal
 * subscription. The org pass deliberately never lives in users.plan — Apple
 * and Stripe events write that slot and would overwrite or cancel it.
 *
 * /api/analyze, lib/player-dashboard.ts and /api/auth/session all read this.
 * The reservation transaction in lib/player-subscription.ts reads it through
 * effectivePlanWith() on its own locked connection.
 */

export type EntitlementSource = 'legacy' | 'personal' | 'org'
export type BilledVia = 'org' | 'stripe' | 'apple' | 'legacy'

export interface EffectivePlan {
  source: EntitlementSource | null
  /** Player/Pro caps that apply. null for legacy (unlimited) and for none. */
  plan: PlayerPlan | null
  /** Usage windows derive from this (weeklyWindow/monthlyWindow). */
  anchor: Date | null
  /** When the active source stops covering: seat end, legacy expiry, or the personal period end. */
  endsAt: Date | null
  orgName: string | null
  billedVia: BilledVia | null
  // --- additive detail -------------------------------------------------------
  orgId: string | null
  seatId: string | null
  /** The personal subscription, when entitled — whether or not it is the active source. */
  personal: { plan: PlayerPlan; billedVia: 'stripe' | 'apple'; anchor: Date; endsAt: Date | null } | null
  /** An assigned seat whose term has not started yet (start dates may be up to 60 days out). */
  upcomingSeat: { seatId: string; orgName: string; plan: PlayerPlan; startsAt: Date; endsAt: Date } | null
  /** The assigned seat covering now — set even when a higher personal plan (or legacy) is the active source. */
  liveSeat: { seatId: string; orgId: string; orgName: string; plan: PlayerPlan; endsAt: Date } | null
}

export const NO_PLAN: EffectivePlan = {
  source: null,
  plan: null,
  anchor: null,
  endsAt: null,
  orgName: null,
  billedVia: null,
  orgId: null,
  seatId: null,
  personal: null,
  upcomingSeat: null,
  liveSeat: null,
}

const PLAN_RANK: Record<PlayerPlan, number> = { player: 1, pro: 2 }

export function planRank(plan: PlayerPlan | null | undefined): number {
  return plan ? PLAN_RANK[plan] : 0
}

// --- pure resolution (unit-tested) ---------------------------------------------

export interface EntitlementUserRow {
  subscription_type: string | null
  subscription_expires_at: string | Date | null
  plan: string | null
  plan_status: string | null
  plan_anchor: string | Date | null
  plan_period_end: string | Date | null
  stripe_subscription_id: string | null
}

export interface EntitlementSeatRow {
  id: string
  org_id: string
  org_name: string
  plan: string
  starts_at: string | Date
  ends_at: string | Date
  anchor_at: string | Date | null
}

const d = (v: string | Date) => (v instanceof Date ? v : new Date(v))

export function resolveEffectivePlan(
  user: EntitlementUserRow | undefined,
  seats: ReadonlyArray<EntitlementSeatRow>,
  now: Date,
): EffectivePlan {
  if (!user) return NO_PLAN

  const t = now.getTime()
  const liveSeat = seats.find(
    (s) => isPlayerPlan(s.plan) && d(s.starts_at).getTime() <= t && d(s.ends_at).getTime() > t,
  )
  const futureSeat = seats.find((s) => isPlayerPlan(s.plan) && d(s.starts_at).getTime() > t)
  const upcomingSeat = futureSeat
    ? {
        seatId: futureSeat.id,
        orgName: futureSeat.org_name,
        plan: futureSeat.plan as PlayerPlan,
        startsAt: d(futureSeat.starts_at),
        endsAt: d(futureSeat.ends_at),
      }
    : null
  const liveSeatInfo = liveSeat
    ? {
        seatId: liveSeat.id,
        orgId: liveSeat.org_id,
        orgName: liveSeat.org_name,
        plan: liveSeat.plan as PlayerPlan,
        endsAt: d(liveSeat.ends_at),
      }
    : null

  const personal =
    isPlayerPlan(user.plan) && user.plan_anchor && playerStatusEntitled(user.plan_status)
      ? {
          plan: user.plan,
          billedVia: (user.stripe_subscription_id ? 'stripe' : 'apple') as 'stripe' | 'apple',
          anchor: d(user.plan_anchor),
          endsAt: user.plan_period_end ? d(user.plan_period_end) : null,
        }
      : null

  const legacy =
    !!user.subscription_type &&
    !!user.subscription_expires_at &&
    d(user.subscription_expires_at).getTime() > t
  if (legacy) {
    return {
      ...NO_PLAN,
      source: 'legacy',
      endsAt: d(user.subscription_expires_at!),
      billedVia: 'legacy',
      personal,
      upcomingSeat,
      liveSeat: liveSeatInfo,
    }
  }

  if (liveSeat && planRank(liveSeat.plan as PlayerPlan) >= planRank(personal?.plan)) {
    const startsAt = d(liveSeat.starts_at)
    return {
      source: 'org',
      plan: liveSeat.plan as PlayerPlan,
      anchor: liveSeat.anchor_at ? d(liveSeat.anchor_at) : startsAt,
      endsAt: d(liveSeat.ends_at),
      orgName: liveSeat.org_name,
      billedVia: 'org',
      orgId: liveSeat.org_id,
      seatId: liveSeat.id,
      personal,
      upcomingSeat,
      liveSeat: liveSeatInfo,
    }
  }

  if (personal) {
    return {
      ...NO_PLAN,
      source: 'personal',
      plan: personal.plan,
      anchor: personal.anchor,
      endsAt: personal.endsAt,
      billedVia: personal.billedVia,
      personal,
      upcomingSeat,
      liveSeat: liveSeatInfo,
    }
  }

  return { ...NO_PLAN, upcomingSeat, liveSeat: liveSeatInfo }
}

// --- database ------------------------------------------------------------------

const MISSING_SCHEMA = /(column|relation) .* does not exist/i

/**
 * Resolve on a given connection. Pass the transaction's `sql` from inside
 * db.begin so the read sees (and is serialized by) the caller's row lock.
 */
export async function effectivePlanWith(
  sql: typeof db,
  userId: string,
  now = new Date(),
): Promise<EffectivePlan> {
  let user: EntitlementUserRow | undefined
  try {
    ;[user] = (await sql`
      SELECT subscription_type, subscription_expires_at, plan, plan_status, plan_anchor,
             plan_period_end, stripe_subscription_id
      FROM users WHERE id = ${userId}
    `) as unknown as [EntitlementUserRow | undefined]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!MISSING_SCHEMA.test(msg)) throw err
    return NO_PLAN
  }
  if (!user) return NO_PLAN

  let seats: EntitlementSeatRow[] = []
  try {
    seats = (await sql`
      SELECT s.id, s.org_id, o.name AS org_name, s.plan, s.starts_at, s.ends_at, s.anchor_at
      FROM org_membership_seats s
      JOIN organizations o ON o.id = s.org_id
      WHERE s.user_id = ${userId}
        AND s.status = 'assigned'
        AND s.ends_at > ${now}
      ORDER BY s.starts_at ASC
    `) as unknown as EntitlementSeatRow[]
  } catch (err) {
    // Degrade to "no seat" on a database that hasn't run the migration.
    const msg = err instanceof Error ? err.message : String(err)
    if (!MISSING_SCHEMA.test(msg)) throw err
  }
  return resolveEffectivePlan(user, seats, now)
}

export async function effectivePlan(userId: string, now = new Date()): Promise<EffectivePlan> {
  return effectivePlanWith(db, userId, now)
}

/** Entitled to an included (capped) allowance — personal or org. Legacy is unlimited and handled separately. */
export function hasIncludedAllowance(p: EffectivePlan): p is EffectivePlan & { plan: PlayerPlan; anchor: Date } {
  return (p.source === 'personal' || p.source === 'org') && !!p.plan && !!p.anchor
}

// --- personal plan purchases while a club seat covers the player -------------------

const SHORT_PLAN_NAME: Record<PlayerPlan, string> = { player: 'Player', pro: 'Pro' }

/** "December 27, 2026" — the last day the seat covers (ends_at is exclusive), like the membership emails. */
function lastCoveredDay(endsAt: Date): string {
  return new Date(endsAt.getTime() - 1).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export type ClubPlanCheck =
  | { ok: false; message: string }
  | { ok: true; note: string | null }

/**
 * May this player buy / switch to the personal plan `requested` while a club
 * seat covers them? Equal or lower than the seat: no — the club already pays
 * for it. Higher (Player seat, personal Pro): yes, with a note that the seat
 * stays on the account until it ends (the higher personal plan is the one
 * used meanwhile — see resolveEffectivePlan).
 */
export function personalPlanVsClub(eff: EffectivePlan, requested: PlayerPlan): ClubPlanCheck {
  const seat = eff.liveSeat
  if (!seat) return { ok: true, note: null }
  const seatName = SHORT_PLAN_NAME[seat.plan]
  const until = lastCoveredDay(seat.endsAt)
  if (planRank(requested) <= planRank(seat.plan)) {
    return { ok: false, message: `Your club already covers your ${seatName} membership until ${until}.` }
  }
  return {
    ok: true,
    note:
      `Your club’s ${seatName} membership stays on your account until ${until}. ` +
      `Your own ${SHORT_PLAN_NAME[requested]} plan is the one used while it’s active.`,
  }
}
