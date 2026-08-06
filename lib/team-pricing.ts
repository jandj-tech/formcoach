// Pure pricing constants for the team token model — no DB imports, so this
// file is safe to import from client components.

/**
 * A team unlocks the discounted token price once it reaches this many joined
 * players (or has a class package bought for it).
 */
export const INITIATION_MIN_PLAYERS = 8

/** Regular per-analysis price (cents) — players, and coaches/orgs before their team is initiated. */
export const REGULAR_ANALYSIS_PRICE_CENTS = 179

/** Discounted per-token price (cents) once a team is initiated. */
export const TEAM_TOKEN_PRICE_CENTS = 99
