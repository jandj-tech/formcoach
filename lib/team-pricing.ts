// Pure pricing constants for the team token model — no DB imports, so this
// file is safe to import from client components.

/** A team needs at least this many joined players before it can be initiated. */
export const INITIATION_MIN_PLAYERS = 8

/** The one-time initiation package must include at least this many tokens. */
export const INITIATION_MIN_TOKENS = 10

/** Flat price (cents) of the initiation package — covers the first INITIATION_MIN_TOKENS tokens. */
export const INITIATION_BASE_PRICE_CENTS = 3000

/** Regular per-analysis price (cents) — players, and coaches/orgs before their team is initiated. */
export const REGULAR_ANALYSIS_PRICE_CENTS = 279

/** Discounted per-token price (cents) once a team is initiated. Also applies to initiation-package tokens beyond the minimum. */
export const TEAM_TOKEN_PRICE_CENTS = 149

/**
 * Price (cents) of an initiation package of `quantity` tokens.
 * The first INITIATION_MIN_TOKENS tokens are the flat $30 base; extras are $2.50 each.
 */
export function initiationPriceCents(quantity: number): number {
  const extra = Math.max(0, quantity - INITIATION_MIN_TOKENS)
  return INITIATION_BASE_PRICE_CENTS + extra * TEAM_TOKEN_PRICE_CENTS
}
