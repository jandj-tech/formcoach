import { db } from '@/lib/db'

/**
 * A coach invited to several teams of one organization gets one invite email
 * per team. Accepting ANY of them used to leave the others pending: the team
 * switcher hid those teams (they had no password yet) and the director kept
 * seeing "Invite sent — not set up" until the coach found the other emails.
 *
 * Once an invite that went only to this inbox has been accepted, the address
 * is proven (lib/team-auth.ts recordInviteInboxProof), so every other pending
 * coach invite for that same address in the SAME organization is accepted
 * with the same credential, exactly as if the coach had opened each link:
 * the password is set on those invite rows only, their links stop working,
 * and inbox proof is recorded for the same hash. Rows that already have a
 * password are never touched, and invites from other organizations stay
 * separate (each org's invite proves nothing about another org's).
 *
 * Callers must only pass an invite whose acceptance proved the inbox: a
 * head-coach setup link (always emailed), or an added-coach link that was
 * never shown to the inviter (team_coaches.invite_emailed_only).
 *
 * Returns how many other invites were accepted. Never throws.
 */
export async function acceptSameOrgCoachInvites(
  email: string,
  hash: string,
  accepted: { teamId: string } | { coachId: string },
): Promise<number> {
  const e = email.toLowerCase().trim()
  if (!e || !hash) return 0
  try {
    const [src] = ('teamId' in accepted
      ? await db`SELECT organization_id FROM teams WHERE id = ${accepted.teamId}`
      : await db`
          SELECT t.organization_id FROM team_coaches c JOIN teams t ON t.id = c.team_id
          WHERE c.id = ${accepted.coachId}
        `) as unknown as [{ organization_id: string | null } | undefined]
    const orgId = src?.organization_id ?? null
    if (!orgId) return 0
    const selfTeam = 'teamId' in accepted ? accepted.teamId : null
    const selfCoach = 'coachId' in accepted ? accepted.coachId : null

    const heads = (await db`
      UPDATE teams
      SET password_hash = ${hash}, coach_invite_token = NULL, invite_sent_at = NULL,
          coach_email_proven_at = NOW(), coach_email_proven_hash = ${hash}
      WHERE organization_id = ${orgId}
        AND LOWER(admin_email) = ${e}
        AND password_hash IS NULL
        AND coach_invite_token IS NOT NULL
        AND (${selfTeam}::uuid IS NULL OR id <> ${selfTeam}::uuid)
      RETURNING id
    `) as unknown as Array<{ id: string }>
    const added = (await db`
      UPDATE team_coaches c
      SET password_hash = ${hash}, invite_token = NULL,
          email_proven_at = NOW(), email_proven_hash = ${hash}
      FROM teams t
      WHERE t.id = c.team_id
        AND t.organization_id = ${orgId}
        AND LOWER(c.email) = ${e}
        AND c.password_hash IS NULL
        AND c.invite_token IS NOT NULL
        AND (${selfCoach}::uuid IS NULL OR c.id <> ${selfCoach}::uuid)
      RETURNING c.id
    `) as unknown as Array<{ id: string }>
    return heads.length + added.length
  } catch (err) {
    console.warn('[coach-invite] other invites not accepted:', err instanceof Error ? err.message : err)
    return 0
  }
}
