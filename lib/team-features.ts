import { db } from '@/lib/db'

/**
 * THE entitlement predicate. There is exactly one, and it is satisfied two
 * ways: by paying, or by being grandfathered.
 *
 * This is a deliberate design constraint, not an accident of implementation.
 * A team that existed before paid plans is treated as fully subscribed — every
 * feature, no carve-outs — and the only difference is that it never pays. The
 * way that promise stays true as the product grows is that there is no second
 * code path to forget about: gate on `teamIsEntitled()` and a grandfathered
 * team is automatically included in whatever ships next.
 *
 * Rules for anyone extending this:
 *   - never write `if (grandfathered || subscribed)` at a call site
 *   - never add a per-feature flag alongside this one
 *   - a feature needing a FINER distinction than "entitled" is a reason to
 *     reconsider the feature, not to add a parallel predicate
 *
 * The moment two predicates exist, parity starts to rot.
 */

/**
 * Subscription states that count as paid-up.
 *
 * 'legacy' is the backfill for organizations that predate paid plans and
 * 'comp'   is the manual admin path — both are entitled forever.
 *
 * 'past_due' is deliberately included. Stripe retries a failed card for days
 * before giving up, and cutting a team's chat off mid-season on the first
 * decline is a worse outcome than a few free days. Stripe moves the
 * subscription to 'canceled' or 'unpaid' once retries are exhausted, and those
 * are the real off switch.
 */
export const ENTITLED_STATUSES = [
  'active',
  'trialing',
  'legacy',
  'comp',
  'past_due',
] as const

export function orgIsEntitled(status: string | null | undefined): boolean {
  return !!status && (ENTITLED_STATUSES as ReadonlyArray<string>).includes(status)
}

/** Shown wherever a locked feature is surfaced. One string, so the ask is consistent. */
export const FEATURE_UPGRADE_MESSAGE =
  'Team chat, scheduling and leaderboards are part of the organization plan.'

export interface TeamEntitlement {
  entitled: boolean
  /** True when this team is entitled because it predates paid plans. */
  grandfathered: boolean
  /** The owning organization's subscription status, if the team is in an org. */
  orgStatus: string | null
}

/**
 * Resolve a team's entitlement in one query.
 *
 * Fails OPEN: if the column or table is missing (a migration that has not run
 * yet), this returns entitled. That matches the pre-migration degradation
 * convention used throughout lib/team-tokens.ts and lib/stripe-idempotency.ts,
 * and it is the right way round — a schema hiccup that silently locks every
 * team out of chat is far worse than a few unpaid days.
 */
export async function resolveTeamEntitlement(teamId: string): Promise<TeamEntitlement> {
  try {
    const [row] = (await db`
      SELECT t.entitlement_grandfathered, o.subscription_status
      FROM teams t
      LEFT JOIN organizations o ON o.id = t.organization_id
      WHERE t.id = ${teamId}
    `) as unknown as [
      { entitlement_grandfathered: boolean | null; subscription_status: string | null } | undefined,
    ]

    // An unknown team is not a billing question — let the caller's own
    // not-found handling deal with it rather than inventing a paywall.
    if (!row) return { entitled: true, grandfathered: false, orgStatus: null }

    const grandfathered = row.entitlement_grandfathered === true
    const orgStatus = row.subscription_status ?? null
    return {
      entitled: grandfathered || orgIsEntitled(orgStatus),
      grandfathered,
      orgStatus,
    }
  } catch (err) {
    console.error('[teamIsEntitled] entitlement lookup failed, failing open:', err)
    return { entitled: true, grandfathered: false, orgStatus: null }
  }
}

/** The boolean on its own, for the many call sites that need nothing else. */
export async function teamIsEntitled(teamId: string): Promise<boolean> {
  return (await resolveTeamEntitlement(teamId)).entitled
}
