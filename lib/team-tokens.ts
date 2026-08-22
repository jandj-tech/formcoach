import { db } from '@/lib/db'
import { INITIATION_MIN_PLAYERS, INITIATION_MIN_TOKENS } from '@/lib/team-pricing'

export * from '@/lib/team-pricing'

export interface TeamTokenState {
  teamId: string
  name: string
  /** True once the team has both a full roster and its token buy-in (or a class package). */
  initiated: boolean
  /** Number of joined player accounts (team_memberships). */
  playerCount: number
  /** Cumulative tokens the team has ever purchased (never decremented). */
  tokensPurchased: number
  /** Unassigned tokens sitting in the team pool. */
  tokenPool: number
}

/**
 * Initiation / token-pool status for a team. Returns null if the team does not exist.
 * Degrades gracefully if the migrate-team-tokens migration has not been run yet.
 */
export async function getTeamTokenState(teamId: string): Promise<TeamTokenState | null> {
  let name = ''
  let tokenPool = 0
  let tokensPurchased = 0
  let hasClassPackage = false

  try {
    const [team] = (await db`
      SELECT name, COALESCE(token_pool, 0)::int AS token_pool,
             COALESCE(tokens_purchased, 0)::int AS tokens_purchased,
             (class_package_id IS NOT NULL) AS has_class_package
      FROM teams WHERE id = ${teamId}
    `) as unknown as [{ name: string; token_pool: number; tokens_purchased: number; has_class_package: boolean } | undefined]
    if (!team) return null
    name = team.name
    tokenPool = team.token_pool
    tokensPurchased = team.tokens_purchased
    hasClassPackage = team.has_class_package
  } catch {
    const [team] = (await db`
      SELECT name FROM teams WHERE id = ${teamId}
    `) as unknown as [{ name: string } | undefined]
    if (!team) return null
    name = team.name
  }

  const [row] = (await db`
    SELECT COUNT(*)::int AS count FROM team_memberships WHERE team_id = ${teamId}
  `) as unknown as [{ count: number }]

  // A team is "initiated" (unlocks the discounted rate) once it EITHER has a
  // class package bought for it, OR reaches the minimum roster AND has bought
  // its token buy-in. The buy-in means the first INITIATION_MIN_TOKENS tokens
  // are bought at the regular rate before the discount kicks in.
  const initiated =
    hasClassPackage ||
    (row.count >= INITIATION_MIN_PLAYERS && tokensPurchased >= INITIATION_MIN_TOKENS)

  return { teamId, name, initiated, playerCount: row.count, tokensPurchased, tokenPool }
}

/**
 * True if the user belongs to at least one team that is initiated — either by
 * having a class package bought for it, or by reaching INITIATION_MIN_PLAYERS
 * players AND having bought at least INITIATION_MIN_TOKENS tokens for the team.
 */
export async function userHasInitiatedTeam(userId: string): Promise<boolean> {
  try {
    const rows = (await db`
      SELECT 1 FROM team_memberships tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = ${userId}
      AND (
        t.class_package_id IS NOT NULL
        OR (
          (SELECT COUNT(*) FROM team_memberships WHERE team_id = tm.team_id) >= ${INITIATION_MIN_PLAYERS}
          AND COALESCE(t.tokens_purchased, 0) >= ${INITIATION_MIN_TOKENS}
        )
      )
      LIMIT 1
    `) as unknown as unknown[]
    return rows.length > 0
  } catch {
    // Pre-migration fallback — no class_package_id / tokens_purchased column.
    try {
      const rows = (await db`
        SELECT 1 FROM team_memberships tm
        WHERE tm.user_id = ${userId}
        AND (SELECT COUNT(*) FROM team_memberships WHERE team_id = tm.team_id) >= ${INITIATION_MIN_PLAYERS}
        LIMIT 1
      `) as unknown as unknown[]
      return rows.length > 0
    } catch {
      return false
    }
  }
}

/**
 * True if the organization has at least one team that is initiated — by having
 * a class package bought for it, or by reaching INITIATION_MIN_PLAYERS players
 * AND having bought at least INITIATION_MIN_TOKENS tokens for that team. Org
 * leaders get the discounted rate across every buy flow once this is true.
 */
export async function orgHasInitiatedTeam(orgId: string): Promise<boolean> {
  try {
    const rows = (await db`
      SELECT 1 FROM teams t
      LEFT JOIN team_memberships tm ON tm.team_id = t.id
      WHERE t.organization_id = ${orgId}
      GROUP BY t.id
      HAVING bool_or(t.class_package_id IS NOT NULL)
        OR (COUNT(tm.user_id) >= ${INITIATION_MIN_PLAYERS} AND COALESCE(MAX(t.tokens_purchased), 0) >= ${INITIATION_MIN_TOKENS})
      LIMIT 1
    `) as unknown as unknown[]
    return rows.length > 0
  } catch {
    // Pre-migration fallback — no class_package_id / tokens_purchased column.
    try {
      const rows = (await db`
        SELECT 1 FROM teams t
        JOIN team_memberships tm ON tm.team_id = t.id
        WHERE t.organization_id = ${orgId}
        GROUP BY t.id HAVING COUNT(tm.user_id) >= ${INITIATION_MIN_PLAYERS}
        LIMIT 1
      `) as unknown as unknown[]
      return rows.length > 0
    } catch {
      return false
    }
  }
}
