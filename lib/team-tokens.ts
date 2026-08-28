import { db } from '@/lib/db'
import { INITIATION_MIN_PLAYERS } from '@/lib/team-pricing'

export * from '@/lib/team-pricing'

export interface TeamTokenState {
  teamId: string
  name: string
  /** True once the team has bought its initiation package. */
  initiated: boolean
  /** Number of joined player accounts (team_memberships). */
  playerCount: number
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
  let hasClassPackage = false

  try {
    const [team] = (await db`
      SELECT name, COALESCE(token_pool, 0)::int AS token_pool,
             (class_package_id IS NOT NULL) AS has_class_package
      FROM teams WHERE id = ${teamId}
    `) as unknown as [{ name: string; token_pool: number; has_class_package: boolean } | undefined]
    if (!team) return null
    name = team.name
    tokenPool = team.token_pool
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

  // A team is "live" (initiated) once it either reaches the minimum player
  // count or a class package was bought for it. Either path unlocks $1.49.
  const initiated = hasClassPackage || row.count >= INITIATION_MIN_PLAYERS

  return { teamId, name, initiated, playerCount: row.count, tokenPool }
}

/**
 * True if the user belongs to at least one team that is initiated — either
 * by having reached INITIATION_MIN_PLAYERS players, or by having had a class
 * package purchased for it (teams.class_package_id IS NOT NULL).
 */
export async function userHasInitiatedTeam(userId: string): Promise<boolean> {
  try {
    const rows = (await db`
      SELECT 1 FROM team_memberships tm
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.user_id = ${userId}
      AND (
        t.class_package_id IS NOT NULL
        OR (SELECT COUNT(*) FROM team_memberships WHERE team_id = tm.team_id) >= ${INITIATION_MIN_PLAYERS}
      )
      LIMIT 1
    `) as unknown as unknown[]
    return rows.length > 0
  } catch {
    // Pre-migration fallback — no class_package_id column.
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
 * True if the organization has at least one team that is initiated — either
 * by reaching INITIATION_MIN_PLAYERS players or by having a class package
 * bought for it. Org leaders get $1.49 across every buy flow once this is true.
 */
export async function orgHasInitiatedTeam(orgId: string): Promise<boolean> {
  try {
    const rows = (await db`
      SELECT 1 FROM teams t
      LEFT JOIN team_memberships tm ON tm.team_id = t.id
      WHERE t.organization_id = ${orgId}
      GROUP BY t.id
      HAVING bool_or(t.class_package_id IS NOT NULL) OR COUNT(tm.user_id) >= ${INITIATION_MIN_PLAYERS}
      LIMIT 1
    `) as unknown as unknown[]
    return rows.length > 0
  } catch {
    // Pre-migration fallback — no class_package_id column.
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

// Ensure the persistent grant ledger exists (self-healing, like the rate-limit
// and support tables) so this works even before the migration is applied.
let grantLedgerEnsured = false
async function ensureGrantLedger(): Promise<void> {
  if (grantLedgerEnsured) return
  await db`
    CREATE TABLE IF NOT EXISTS team_free_token_grants (
      user_id UUID NOT NULL,
      team_id UUID NOT NULL,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, team_id)
    )
  `
  grantLedgerEnsured = true
}

/**
 * Grant 1 free analysis token to every member of an org team that has just
 * reached INITIATION_MIN_PLAYERS players. Each user gets this AT MOST ONCE per
 * team, ever.
 *
 * The eligibility flag used to live on the team_memberships row, which
 * team/leave DELETEs — so a member could leave and rejoin to mint a fresh token
 * every cycle. The flag now lives in team_free_token_grants, a ledger keyed by
 * (user_id, team_id) that survives membership deletion. The grant is claimed
 * atomically with INSERT ... ON CONFLICT DO NOTHING RETURNING: only a row that
 * was actually inserted (first time for that user+team) gets the token, so
 * concurrent calls and leave/rejoin loops can't double-grant.
 */
export async function grantFreeOrgTokensIfEligible(teamId: string): Promise<void> {
  try {
    const [team] = (await db`
      SELECT organization_id FROM teams WHERE id = ${teamId}
    `) as unknown as [{ organization_id: string | null } | undefined]
    if (!team?.organization_id) return

    const [countRow] = (await db`
      SELECT COUNT(*)::int AS count FROM team_memberships WHERE team_id = ${teamId}
    `) as unknown as [{ count: number }]
    if (countRow.count < INITIATION_MIN_PLAYERS) return

    await ensureGrantLedger()

    const members = (await db`
      SELECT user_id FROM team_memberships WHERE team_id = ${teamId}
    `) as unknown as { user_id: string }[]

    for (const m of members) {
      const claimed = (await db`
        INSERT INTO team_free_token_grants (user_id, team_id)
        VALUES (${m.user_id}, ${teamId})
        ON CONFLICT (user_id, team_id) DO NOTHING
        RETURNING user_id
      `) as unknown as unknown[]
      // Only credit when THIS call won the claim — an already-granted user (incl.
      // one who left and rejoined) inserts nothing and gets no second token.
      if (claimed.length > 0) {
        await db`UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + 1 WHERE id = ${m.user_id}`
      }
    }
  } catch (err) {
    console.error('[grantFreeOrgTokensIfEligible] error:', err)
  }
}
