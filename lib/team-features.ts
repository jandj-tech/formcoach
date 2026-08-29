import { db } from '@/lib/db'
import { isOrgTier, type OrgTier } from '@/lib/team-pricing'

/**
 * THE entitlement resolver. There is exactly one, it returns exactly one tier,
 * and every gate in the product derives from that tier through the table below.
 *
 * A tier is reached two ways: by paying, or by being grandfathered. That is a
 * deliberate design constraint, not an accident of implementation. A team that
 * existed before paid plans is treated as fully subscribed — Plus, free,
 * forever — and the way that promise stays true as the product grows is that
 * there is no second code path to forget about.
 *
 * Rules for anyone extending this:
 *   - never write `if (grandfathered || subscribed)` at a call site
 *   - never add a per-feature flag alongside the capability table
 *   - a feature needing a distinction the table cannot express is a reason to
 *     reconsider the feature, not to add a parallel predicate
 *
 * The moment two predicates exist, parity starts to rot.
 */

/** Everything a tier may or may not do. One row per tier, no exceptions elsewhere. */
export interface TierCapabilities {
  chat: boolean
  leaderboard: boolean
  schedule: boolean
  classes: boolean
  /** Non-class teams the organization may have. Class teams never count. */
  maxTeams: number
}

export const CAPABILITIES: Readonly<Record<OrgTier, TierCapabilities>> = {
  none: { chat: false, leaderboard: false, schedule: false, classes: false, maxTeams: 0 },
  basic: { chat: true, leaderboard: true, schedule: false, classes: true, maxTeams: 1 },
  plus: { chat: true, leaderboard: true, schedule: true, classes: true, maxTeams: Infinity },
}

export type Capability = keyof Omit<TierCapabilities, 'maxTeams'>

export function tierCan(tier: OrgTier, capability: Capability): boolean {
  return CAPABILITIES[tier][capability]
}

export function maxTeamsFor(tier: OrgTier): number {
  return CAPABILITIES[tier].maxTeams
}

/**
 * Subscription states that count as paid-up.
 *
 * 'legacy' is the backfill for organizations that predate paid plans and
 * 'comp'   is the manual admin path — both resolve to Plus, forever.
 *
 * 'past_due' is deliberately included. Stripe retries a failed card for days
 * before giving up, and cutting a team's chat off mid-season on the first
 * decline is a worse outcome than a few free days. Stripe moves the
 * subscription to 'canceled' or 'unpaid' once retries are exhausted, and those
 * are the real off switch.
 */
export const ENTITLED_STATUSES = ['active', 'trialing', 'legacy', 'comp', 'past_due'] as const

/** Statuses that mean "entitled to everything, and never billed". */
const ALWAYS_PLUS_STATUSES = ['legacy', 'comp'] as const

export function statusIsEntitled(status: string | null | undefined): boolean {
  return !!status && (ENTITLED_STATUSES as ReadonlyArray<string>).includes(status)
}

/**
 * The tier an organization row grants.
 *
 * `legacy` and `comp` resolve to Plus from their STATUS, never from a written
 * tier — which is why the migration deliberately leaves their subscription_tier
 * NULL. Keeping the grandfathering rule here, in one branch, means re-pricing
 * or renaming a tier later can never silently demote an org that was promised
 * everything for free.
 */
function tierFromOrg(status: string | null, tier: string | null): OrgTier {
  if (!statusIsEntitled(status)) return 'none'
  if (status && (ALWAYS_PLUS_STATUSES as ReadonlyArray<string>).includes(status)) return 'plus'
  return isOrgTier(tier) && tier !== 'none' ? tier : 'plus'
}

/** Rank for picking the best of several tiers. */
const TIER_RANK: Record<OrgTier, number> = { none: 0, basic: 1, plus: 2 }
export function bestTier(a: OrgTier, b: OrgTier): OrgTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b
}

/** Shown wherever a Plus-only feature is surfaced to a Basic org. */
export const FEATURE_UPGRADE_MESSAGE = 'Team scheduling is part of the Plus plan.'

/** Shown when an org with no plan at all hits a gated feature. */
export const NO_PLAN_MESSAGE =
  'Team chat, scheduling and leaderboards are part of the organization plan.'

/**
 * Shown when a lapsed organization tries to grow — add a team, a coach, a
 * player, a class. What they already have keeps working; they just cannot
 * add to it until the plan is back.
 */
export const SUBSCRIPTION_ENDED_MESSAGE =
  'Your organization plan has ended. Reactivate it to add teams, coaches and players again.'

/** Shown when a Basic org hits its one-team limit. */
export const TEAM_LIMIT_MESSAGE =
  'The Basic plan covers one team. Upgrade to Plus to add more.'

export interface TeamEntitlement {
  tier: OrgTier
  /** True when this team is entitled because it predates paid plans. */
  grandfathered: boolean
  /** The owning organization's subscription status, if the team is in an org. */
  orgStatus: string | null
}

/**
 * Resolve a team's tier in one query.
 *
 * Fails OPEN as `plus`: if the column or table is missing (a migration that has
 * not run yet), everything stays unlocked. That matches the pre-migration
 * degradation convention used throughout lib/team-tokens.ts, and it is the
 * right way round — a schema hiccup that silently locks every team out of chat,
 * or overcharges them for tokens, is far worse than a few unpaid days.
 */
export async function resolveTeamEntitlement(teamId: string): Promise<TeamEntitlement> {
  try {
    const [row] = (await db`
      SELECT t.entitlement_grandfathered, o.subscription_status, o.subscription_tier
      FROM teams t
      LEFT JOIN organizations o ON o.id = t.organization_id
      WHERE t.id = ${teamId}
    `) as unknown as [
      {
        entitlement_grandfathered: boolean | null
        subscription_status: string | null
        subscription_tier: string | null
      } | undefined,
    ]

    // An unknown team is not a billing question — let the caller's own
    // not-found handling deal with it rather than inventing a paywall.
    if (!row) return { tier: 'plus', grandfathered: false, orgStatus: null }

    const grandfathered = row.entitlement_grandfathered === true
    const orgStatus = row.subscription_status ?? null
    // Grandfathered wins outright: a team that predates paid plans keeps Plus
    // even if its organization is on Basic, or has lapsed entirely.
    const tier = grandfathered ? 'plus' : tierFromOrg(orgStatus, row.subscription_tier ?? null)

    return { tier, grandfathered, orgStatus }
  } catch (err) {
    console.error('[team-features] entitlement lookup failed, failing open:', err)
    return { tier: 'plus', grandfathered: false, orgStatus: null }
  }
}

/** The tier on its own, for the many call sites that need nothing else. */
export async function teamTier(teamId: string): Promise<OrgTier> {
  return (await resolveTeamEntitlement(teamId)).tier
}

/** Whether a team may use one specific capability. */
export async function teamCan(teamId: string, capability: Capability): Promise<boolean> {
  return tierCan(await teamTier(teamId), capability)
}

/** Whether a team has any plan at all. Chat and leaderboards need only this. */
export async function teamIsEntitled(teamId: string): Promise<boolean> {
  return (await teamTier(teamId)) !== 'none'
}

/**
 * The tier an organization holds.
 *
 * Fails OPEN as `plus`, for the same reason resolveTeamEntitlement does: a
 * schema hiccup must not lock a paying customer out of their own organization.
 */
export async function orgTierById(orgId: string): Promise<OrgTier> {
  try {
    const [row] = (await db`
      SELECT subscription_status, subscription_tier FROM organizations WHERE id = ${orgId}
    `) as unknown as [
      { subscription_status: string | null; subscription_tier: string | null } | undefined,
    ]
    if (!row) return 'plus'
    return tierFromOrg(row.subscription_status, row.subscription_tier)
  } catch (err) {
    console.error('[team-features] org tier lookup failed, failing open:', err)
    return 'plus'
  }
}

export async function orgIsEntitledById(orgId: string): Promise<boolean> {
  return (await orgTierById(orgId)) !== 'none'
}

/**
 * The best tier a player holds across every team they are on.
 *
 * Drives the per-analysis price a player sees. Someone on both a Basic team and
 * a Plus team gets the Plus rate — charging them the worse of the two for an
 * accident of which team they happen to be on would be indefensible.
 *
 * Fails OPEN as `plus` — an error here would silently overcharge a real
 * customer, which is the failure worth avoiding.
 */
export async function userTier(userId: string): Promise<OrgTier> {
  try {
    const rows = (await db`
      SELECT t.entitlement_grandfathered, o.subscription_status, o.subscription_tier
      FROM team_memberships tm
      JOIN teams t ON t.id = tm.team_id
      LEFT JOIN organizations o ON o.id = t.organization_id
      WHERE tm.user_id = ${userId}
    `) as unknown as Array<{
      entitlement_grandfathered: boolean | null
      subscription_status: string | null
      subscription_tier: string | null
    }>

    return rows.reduce<OrgTier>((best, r) => {
      const tier =
        r.entitlement_grandfathered === true
          ? 'plus'
          : tierFromOrg(r.subscription_status, r.subscription_tier)
      return bestTier(best, tier)
    }, 'none')
  } catch (err) {
    console.error('[team-features] user tier lookup failed, failing open:', err)
    return 'plus'
  }
}

/** Whether a player is on any team with a plan. Kept for the session wire field. */
export async function userIsOnEntitledTeam(userId: string): Promise<boolean> {
  return (await userTier(userId)) !== 'none'
}

/**
 * How many non-class teams an organization already has.
 *
 * Class-package teams are excluded on purpose: buying a class auto-creates a
 * team, and that must not consume a Basic org's single slot — the class was
 * paid for separately, per player.
 */
export async function countableTeams(orgId: string): Promise<number> {
  try {
    const [row] = (await db`
      SELECT COUNT(*)::int AS n
      FROM teams
      WHERE organization_id = ${orgId} AND class_package_id IS NULL
    `) as unknown as [{ n: number }]
    return row?.n ?? 0
  } catch (err) {
    console.error('[team-features] team count failed, reporting 0:', err)
    return 0
  }
}

/** Whether an org may create one more normal team right now. */
export async function orgCanAddTeam(orgId: string): Promise<boolean> {
  const tier = await orgTierById(orgId)
  if (tier === 'none') return false
  const limit = maxTeamsFor(tier)
  if (limit === Infinity) return true
  return (await countableTeams(orgId)) < limit
}
