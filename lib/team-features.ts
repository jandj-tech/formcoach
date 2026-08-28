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

/**
 * Shown when a lapsed organization tries to grow — add a team, a coach, a
 * player, a class. What they already have keeps working; they just cannot
 * add to it until the plan is back.
 */
export const SUBSCRIPTION_ENDED_MESSAGE =
  'Your organization plan has ended. Reactivate it to add teams, coaches and players again.'

/**
 * Is this organization paid up (or grandfathered / comped)?
 *
 * Fails OPEN on a thrown error, for the same reason resolveTeamEntitlement
 * does: a schema hiccup must not lock a paying customer out of their own
 * organization.
 */
export async function orgIsEntitledById(orgId: string): Promise<boolean> {
  try {
    const [row] = (await db`
      SELECT subscription_status FROM organizations WHERE id = ${orgId}
    `) as unknown as [{ subscription_status: string | null } | undefined]
    if (!row) return true
    return orgIsEntitled(row.subscription_status)
  } catch (err) {
    console.error('[orgIsEntitledById] lookup failed, failing open:', err)
    return true
  }
}

/**
 * Does this player belong to at least one ENTITLED team?
 *
 * Drives the per-analysis price a player sees. The team rate is a benefit of
 * being on a team whose organization is paid up (or which predates paid
 * plans); a player whose only team belongs to a lapsed organization pays the
 * regular rate, same as someone with no team at all.
 *
 * Fails OPEN — an error here would silently overcharge a real customer.
 */
export async function userIsOnEntitledTeam(userId: string): Promise<boolean> {
  try {
    const rows = (await db`
      SELECT 1 FROM team_memberships tm
      JOIN teams t ON t.id = tm.team_id
      LEFT JOIN organizations o ON o.id = t.organization_id
      WHERE tm.user_id = ${userId}
        AND (
          t.entitlement_grandfathered = TRUE
          OR o.subscription_status = ANY(${ENTITLED_STATUSES as unknown as string[]})
        )
      LIMIT 1
    `) as unknown as unknown[]
    return rows.length > 0
  } catch (err) {
    console.error('[userIsOnEntitledTeam] lookup failed, failing open:', err)
    return true
  }
}

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
