// Visibility resolution for org-released results — the ONE place that decides
// how much of a report a viewer may see. Both surfaces that render a report
// (app/results/[token]/page.tsx and app/api/results/[token]/route.ts) consume
// this so their gating can never drift apart.
//
// A result_releases row exists for submissions an organization has sent to a
// player. Without one, callers fall back to the legacy is_free_preview
// behavior unchanged — EXCEPT for staff previewing as the player, who get a
// synthesized view from the org's current settings so the "preview before you
// send" flow works before the first send. With a release:
//
//   staff (admin / the analysis's team coach / its org admin) → 'full', always;
//     ?as=player&tier=X lets staff preview any tier without granting anything
//   everyone else → the release's snapshotted free tier, raised by any unlock:
//     the release's own purchase (tier stamped at purchase), or a player-scoped
//     unlock the same person bought on another report from this org
//
// The legacy owner-has-tokens auto-unlock (submissions.is_free_preview) is
// deliberately NOT consulted here: an org's paywall is the org's, and a
// player's personal token balance doesn't override it.

import { db } from '@/lib/db'
import type { VisibilityTier } from '@/lib/result-visibility'
import { isVisibilityTier, tierRank, TIER_ORDER } from '@/lib/result-visibility'
import type { OrgOffer } from '@/lib/org-offers'
import { getOrgResultSettings, getPurchasableOffers } from '@/lib/org-offers-db'

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
  /** What a non-staff viewer sees right now (shown to staff in the coach bar). */
  playerTier: VisibilityTier
  /** What a qualifying purchase raises the viewer to. */
  unlockTier: VisibilityTier
  /**
   * Offers this viewer could buy — active rows of a selling-enabled org,
   * loaded only for player-facing renders (and staff previews of them).
   * Empty means the page must not render any buy UI.
   */
  offers: OrgOffer[]
  /** True when a purchasable offer would raise the player's tier. */
  unlockPathAvailable: boolean
}

function maxTier(a: VisibilityTier, b: VisibilityTier): VisibilityTier {
  return tierRank(a) >= tierRank(b) ? a : b
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
 * Player-scoped unlocks this person holds with the org (class / ball buyers),
 * matched by user id or, failing that, by email. Returns the highest tier.
 */
async function playerUnlockTier(
  orgId: string,
  userId: string | null,
  email: string | null
): Promise<VisibilityTier | null> {
  if (!userId && !email) return null
  const rows = await db`
    SELECT unlocked_tier FROM org_player_unlocks
    WHERE org_id = ${orgId}
      AND (
        (${userId}::uuid IS NOT NULL AND user_id = ${userId}::uuid)
        OR (${email}::text IS NOT NULL AND LOWER(email) = LOWER(${email}::text))
      )
  `
  let best: VisibilityTier | null = null
  for (const r of rows as unknown as Array<{ unlocked_tier: string }>) {
    if (!isVisibilityTier(r.unlocked_tier)) continue
    best = best ? maxTier(best, r.unlocked_tier) : r.unlocked_tier
  }
  return best
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
           r.recipient_user_id, r.recipient_email, s.user_id AS submission_user_id,
           org.name AS org_name
    FROM result_releases r
    JOIN organizations org ON org.id = r.org_id
    JOIN submissions s ON s.id = r.submission_id
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
        recipient_user_id: string | null
        recipient_email: string | null
        submission_user_id: string | null
        org_name: string
      }
    | undefined

  let release: ResultRelease
  let recipientUserId: string | null = null
  let recipientEmail: string | null = null

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
    recipientUserId = row.recipient_user_id ?? row.submission_user_id
    recipientEmail = row.recipient_email
  } else if (previewing) {
    // Nothing sent yet — synthesize what a send RIGHT NOW would produce, so
    // the coach can preview before the first send.
    const org = await orgForSubmission(opts.submissionId)
    if (!org) return null
    const settings = await getOrgResultSettings(org.orgId)
    release = {
      id: null,
      orgId: org.orgId,
      orgName: org.orgName,
      teamId: org.teamId,
      freeTier: settings.freeTier,
      unlocked: false,
      unlockedTier: null,
      synthetic: true,
    }
  } else {
    return null
  }

  const settings = await getOrgResultSettings(release.orgId)

  // The player's tier: the free snapshot, raised by any unlock they hold.
  let playerTier: VisibilityTier = release.freeTier
  if (release.unlocked) {
    playerTier = maxTier(playerTier, release.unlockedTier ?? settings.unlockTier)
  }
  if (!release.synthetic) {
    const held = await playerUnlockTier(release.orgId, recipientUserId, recipientEmail)
    if (held) playerTier = maxTier(playerTier, held)
  }

  let tier: VisibilityTier
  if (opts.isStaff && !previewing) {
    tier = 'full'
  } else if (previewing) {
    tier = isVisibilityTier(opts.requestedTier) ? opts.requestedTier : playerTier
  } else {
    tier = playerTier
  }

  // Offers only exist on player-facing renders. Staff reviewing their own
  // report full-size gets none; a staff preview shows exactly what the player
  // gets, buy buttons included.
  const playerFacing = !opts.isStaff || previewing
  const offers = playerFacing ? await getPurchasableOffers(release.orgId) : []
  const unlockPathAvailable =
    offers.some((o) => o.includesBreakdown) && tierRank(settings.unlockTier) > tierRank(tier)

  return {
    tier,
    release,
    isStaff: opts.isStaff,
    previewTier: previewing ? tier : null,
    playerTier,
    unlockTier: settings.unlockTier,
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
