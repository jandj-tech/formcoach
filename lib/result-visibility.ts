// Visibility tiers for org-released results — pure constants, no DB imports,
// so this file is safe to import from client components.
//
// When an organization sends a player their evaluation, a result_releases row
// snapshots how much of the report the player sees for free. The four tiers
// are strictly ordered; a paywall is simply free_tier < unlock_tier, and a
// purchase moves the viewer from the free tier to the unlock tier. Coaches,
// org admins, and the site admin always see the full report regardless.

export type VisibilityTier = 'score' | 'categories' | 'breakdown' | 'full'

/** Lowest → highest. Order is load-bearing: tierRank/atLeast derive from it. */
export const TIER_ORDER: readonly VisibilityTier[] = ['score', 'categories', 'breakdown', 'full']

export function isVisibilityTier(value: unknown): value is VisibilityTier {
  return value === 'score' || value === 'categories' || value === 'breakdown' || value === 'full'
}

export function tierRank(tier: VisibilityTier): number {
  return TIER_ORDER.indexOf(tier)
}

/** True when a viewer at `viewer` may see content that needs `needed`. */
export function atLeast(viewer: VisibilityTier, needed: VisibilityTier): boolean {
  return tierRank(viewer) >= tierRank(needed)
}

/** Short names for the builder UI and the manual. */
export const TIER_LABELS: Record<VisibilityTier, string> = {
  score: 'Main score only',
  categories: 'Score + category scores',
  breakdown: 'Full score breakdown',
  full: 'Full results including comments',
}

/** Plain-language descriptions of exactly what each tier reveals. */
export const TIER_DESCRIPTIONS: Record<VisibilityTier, string> = {
  score: 'The overall score and letter grade — nothing else.',
  categories: 'The overall score plus a score for each area of the shot (base, grip, release, follow-through, flow).',
  breakdown: 'Every individual check with its score — but no written feedback.',
  full: 'Everything: every check, the written feedback on each one, coach notes, improvement tips, and the shot frames.',
}
