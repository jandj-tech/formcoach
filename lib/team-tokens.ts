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

  try {
    const [team] = (await db`
      SELECT name, COALESCE(token_pool, 0)::int AS token_pool
      FROM teams WHERE id = ${teamId}
    `) as unknown as [{ name: string; token_pool: number } | undefined]
    if (!team) return null
    name = team.name
    tokenPool = team.token_pool
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

  // Teams are "live" (initiated) once they reach the minimum player count — no payment required.
  const initiated = row.count >= INITIATION_MIN_PLAYERS

  return { teamId, name, initiated, playerCount: row.count, tokenPool }
}

/**
 * Grant 1 free analysis token to every member of an org team that has just
 * reached INITIATION_MIN_PLAYERS players. Skips members who already got theirs.
 * No-ops silently if the team is not in an org or not yet large enough.
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

    const ungranted = (await db`
      SELECT user_id FROM team_memberships
      WHERE team_id = ${teamId} AND (free_token_granted IS NULL OR free_token_granted = FALSE)
    `) as unknown as { user_id: string }[]

    for (const m of ungranted) {
      await db`UPDATE users SET analysis_tokens = COALESCE(analysis_tokens, 0) + 1 WHERE id = ${m.user_id}`
      await db`UPDATE team_memberships SET free_token_granted = TRUE WHERE team_id = ${teamId} AND user_id = ${m.user_id}`
    }
  } catch (err) {
    console.error('[grantFreeOrgTokensIfEligible] error:', err)
  }
}
