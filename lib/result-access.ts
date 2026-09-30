// Visibility resolution for org-released results — the ONE place that decides
// how much of a report a viewer may see. Both surfaces that render a report
// (app/results/[token]/page.tsx and app/api/results/[token]/route.ts) consume
// this so their gating can never drift apart.
//
// A result_releases row exists for submissions an organization or team has
// sent to a player. Without one, callers fall back to the legacy
// is_free_preview behavior unchanged — EXCEPT for staff previewing as the
// player, who get a synthesized view so the "preview before you send" flow
// works before the first send.
//
// Product rule (owner, final): any shot a team/coach/org uploads shows the
// FULL report to the player, always. Team uploads are paid with purchased
// tokens, so there is no per-report paywall any more: every release resolves
// to 'full' for staff, the player and anyone holding the link — including
// old releases whose snapshotted free_tier is lower (that column and the
// org_result_settings row are kept but no longer gate anything). Ball/class
// offers are still returned for player-facing renders so the results page can
// keep selling real products under the full report.

import { db } from '@/lib/db'
import type { VisibilityTier } from '@/lib/result-visibility'
import { isVisibilityTier, TIER_ORDER } from '@/lib/result-visibility'
import type { OrgOffer } from '@/lib/org-offers'
import { getPurchasableOffers } from '@/lib/org-offers-db'

export interface ResultRelease {
  /** null when synthesized for a staff preview before the first send. */
  id: string | null
  orgId: string
  orgName: string
  teamId: string | null
  freeTier: VisibilityTier
  unlocked: boolean
  unlockedTier: VisibilityTier | null
  synthetic: boolean
}

export interface ResultAccess {
  /** What this render may show. */
  tier: VisibilityTier
  release: ResultRelease
  /** The viewer holds a staff session over this analysis. */
  isStaff: boolean
  /** Staff is previewing the player's view at `tier`. */
  previewTier: VisibilityTier | null
  /** What a non-staff viewer sees right now — always 'full'. */
  playerTier: VisibilityTier
  /** Kept for callers' shape; nothing is gated, so always 'full'. */
  unlockTier: VisibilityTier
  /**
   * Offers this viewer could buy — active rows of a selling-enabled org,
   * loaded only for player-facing renders (and staff previews of them).
   * Empty means the page must not render any buy UI.
   */
  offers: OrgOffer[]
  /** True when a purchasable offer would raise the player's tier — always false now. */
  unlockPathAvailable: boolean
}

/**
 * The organization a submission belongs to, through whichever of the org's
 * teams it is attached to (the direct team_id, a roster team_player, or the
 * player's team membership). null for submissions outside any organization.
 */
export async function orgForSubmission(
  submissionId: string
): Promise<{ orgId: string; orgName: string; teamId: string } | null> {
  const rows = await db`
    SELECT t.id AS team_id, org.id AS org_id, org.name AS org_name
    FROM submissions s
    JOIN teams t ON t.organization_id IS NOT NULL AND (
      t.id = s.team_id
      OR EXISTS (
        SELECT 1 FROM team_players tp WHERE tp.id = s.team_player_id AND tp.team_id = t.id
      )
      OR EXISTS (
        SELECT 1 FROM team_memberships tm WHERE tm.team_id = t.id AND tm.user_id = s.user_id
      )
    )
    JOIN organizations org ON org.id = t.organization_id
    WHERE s.id = ${submissionId}
    ORDER BY (t.id = s.team_id) DESC, t.created_at ASC
    LIMIT 1
  `
  const row = rows[0] as { team_id: string; org_id: string; org_name: string } | undefined
  return row ? { orgId: row.org_id, orgName: row.org_name, teamId: row.team_id } : null
}

/**
 * Resolve access for a submission. Returns null when there is no release and
 * the viewer is not a staff member previewing — the caller keeps its legacy
 * behavior in that case.
 *
 * `isStaff` is passed in rather than resolved here because both callers
 * already resolve the viewer's session (resolveNoteAuthorForAnalysis) for
 * their own purposes — resolving it twice would double the session queries.
 */
export async function resolveResultAccess(opts: {
  submissionId: string
  isStaff: boolean
  previewAsPlayer?: boolean
  requestedTier?: string | null
}): Promise<ResultAccess | null> {
  const previewing = opts.isStaff && opts.previewAsPlayer === true

  const rows = await db`
    SELECT r.id, r.org_id, r.team_id, r.free_tier, r.unlocked, r.unlocked_tier,
           org.name AS org_name
    FROM result_releases r
    JOIN organizations org ON org.id = r.org_id
    WHERE r.submission_id = ${opts.submissionId}
  `
  const row = rows[0] as
    | {
        id: string
        org_id: string
        team_id: string | null
        free_tier: string
        unlocked: boolean
        unlocked_tier: string | null
        org_name: string
      }
    | undefined

  let release: ResultRelease

  if (row) {
    release = {
      id: row.id,
      orgId: row.org_id,
      orgName: row.org_name,
      teamId: row.team_id,
      freeTier: isVisibilityTier(row.free_tier) ? row.free_tier : 'score',
      unlocked: row.unlocked,
      unlockedTier: isVisibilityTier(row.unlocked_tier) ? row.unlocked_tier : null,
      synthetic: false,
    }
  } else if (previewing) {
    // Nothing sent yet — synthesize what a send RIGHT NOW would produce, so
    // the coach can preview before the first send.
    const org = await orgForSubmission(opts.submissionId)
    if (!org) return null
    release = {
      id: null,
      orgId: org.orgId,
      orgName: org.orgName,
      teamId: org.teamId,
      freeTier: 'full',
      unlocked: false,
      unlockedTier: null,
      synthetic: true,
    }
  } else {
    return null
  }

  // Everyone — staff, the player, a staff preview of the player, a share-link
  // holder — sees the full report. `requestedTier` is accepted for old
  // preview links but no longer lowers anything.
  const playerTier: VisibilityTier = 'full'
  const tier: VisibilityTier = 'full'

  // Offers only exist on player-facing renders. Staff reviewing their own
  // report full-size gets none; a staff preview shows exactly what the player
  // gets, buy buttons included. Only ball/class offers are purchasable, and
  // nothing is gated, so no offer is ever an "unlock".
  const playerFacing = !opts.isStaff || previewing
  const offers = playerFacing ? await getPurchasableOffers(release.orgId) : []
  const unlockPathAvailable = false

  return {
    tier,
    release,
    isStaff: opts.isStaff,
    previewTier: previewing ? tier : null,
    playerTier,
    unlockTier: 'full',
    offers,
    unlockPathAvailable,
  }
}

/**
 * Which offers to surface where. While content is gated, every offer that
 * unlocks it sells from the lock card; pure products (no breakdown included)
 * and, once nothing is gated, ball/class offers sell from the strip below.
 */
export function splitOffersForDisplay(
  offers: OrgOffer[],
  opts: { gated: boolean }
): { unlockOffers: OrgOffer[]; productOffers: OrgOffer[] } {
  if (opts.gated) {
    return {
      unlockOffers: offers.filter((o) => o.includesBreakdown),
      productOffers: offers.filter((o) => !o.includesBreakdown && (o.includesBall || o.includesCourse)),
    }
  }
  return {
    unlockOffers: [],
    productOffers: offers.filter((o) => o.includesBall || o.includesCourse),
  }
}

export { TIER_ORDER }
