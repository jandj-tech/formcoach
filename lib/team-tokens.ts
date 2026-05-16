import { db } from '@/lib/db'

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
  let initiated = false

  try {
    const [team] = (await db`
      SELECT name,
             COALESCE(token_pool, 0)::int AS token_pool,
             (initiated_at IS NOT NULL) AS initiated
      FROM teams WHERE id = ${teamId}
    `) as unknown as [{ name: string; token_pool: number; initiated: boolean } | undefined]
    if (!team) return null
    name = team.name
    tokenPool = team.token_pool
    initiated = team.initiated
  } catch {
    // token_pool / initiated_at columns not migrated yet — fall back to a name-only lookup.
    const [team] = (await db`
      SELECT name FROM teams WHERE id = ${teamId}
    `) as unknown as [{ name: string } | undefined]
    if (!team) return null
    name = team.name
  }

  const [row] = (await db`
    SELECT COUNT(*)::int AS count FROM team_memberships WHERE team_id = ${teamId}
  `) as unknown as [{ count: number }]

  return { teamId, name, initiated, playerCount: row.count, tokenPool }
}
