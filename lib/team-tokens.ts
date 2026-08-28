import { db } from '@/lib/db'

export * from '@/lib/team-pricing'

export interface TeamTokenState {
  teamId: string
  name: string
  /** Number of joined player accounts (team_memberships). */
  playerCount: number
  /** Unassigned tokens sitting in the team pool. */
  tokenPool: number
}

/**
 * Roster size and token-pool status for a team. Returns null if the team does
 * not exist. Degrades gracefully if the migrate-team-tokens migration has not
 * been run yet.
 *
 * There is deliberately no `initiated` flag any more: every team gets the team
 * token rate from its first day, so the field would be a permanently-true
 * boolean — exactly the kind of thing that rots into a stale gate.
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

  return { teamId, name, playerCount: row.count, tokenPool }
}

/**
 * True if the user belongs to at least one team.
 *
 * Being on a team is the whole test now — there is no roster minimum and no
 * class-package special case, because every team gets the team token rate from
 * day one. Only individuals with no team at all pay the regular rate.
 *
 * (There is no `orgHasInitiatedTeam` counterpart any more: an organization
 * always gets the team rate, so every org buy route uses TEAM_TOKEN_PRICE_CENTS
 * directly rather than asking a question whose answer is always yes.)
 */
export async function userIsOnTeam(userId: string): Promise<boolean> {
  try {
    const rows = (await db`
      SELECT 1 FROM team_memberships WHERE user_id = ${userId} LIMIT 1
    `) as unknown as unknown[]
    return rows.length > 0
  } catch {
    return false
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
 * Grant 1 free analysis token to every member of an org team. Each user gets
 * this AT MOST ONCE per team, ever.
 *
 * There is no roster threshold: the grant used to fire only when a team crossed
 * 8 players, but that cliff is gone along with the rest of the initiation rule,
 * so every member of an org team gets their token as soon as they are on it.
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
