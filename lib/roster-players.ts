import crypto from 'crypto'
import { db } from '@/lib/db'
import { addToEmailList } from '@/lib/email-list'
import { grantFreeOrgTokensIfEligible } from '@/lib/team-tokens'
import { sendPlayerSetupEmail } from '@/lib/email'
import { resolveBaseUrl } from '@/lib/base-url'
import { isCleanDisplayText } from '@/lib/moderation'

// Adds a player to a team the way a coach or org would: no password required.
//
// The account model (chosen 2026-09-23): when an email is given we create a
// real users row up front with roster_pending = true, plus a team_membership,
// so the player is a first-class roster entry immediately — the org can give
// them tokens and upload for them, and a later self-signup with the same email
// completes THIS record instead of duplicating it. Without an email we fall
// back to the existing name-only pending_team_members placeholder (claimed by
// invite link).

const SETUP_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 days — an invite, not a reset

export type AddPlayerStatus =
  | 'created'          // new stub account created + membership (setup email if requested)
  | 'linked'           // an account with this email already existed → added to the team
  | 'already_on_team'  // that account was already a member of this team
  | 'invited'          // no email → name-only pending invite created

export interface AddPlayerResult {
  status: AddPlayerStatus
  userId?: string
  /** Present for name-only invites, and for new stubs when no email was sent. */
  inviteUrl?: string
  /** Present when a fresh stub account was created and a setup link exists. */
  setupUrl?: string
  emailed?: boolean
  displayName: string
}

export interface AddPlayerInput {
  teamId: string
  firstName: string
  lastName?: string | null
  email?: string | null
  parentName?: string | null
  phone?: string | null
  /** Email the player/parent the setup link. Ignored when there is no email. */
  sendEmail?: boolean
  /** Team name, only used to personalise the setup email. */
  teamName?: string | null
}

export class AddPlayerError extends Error {}

function cleanName(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ')
}

function lastInitial(lastName: string | null | undefined): string | null {
  const c = cleanName(lastName).charAt(0)
  return c ? c.toUpperCase() : null
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Issues (or re-issues) a 14-day setup token for a roster-pending player and
 * returns the link that lets them set a password. Reuses the reset_token
 * column so the existing /reset-password flow completes the account.
 */
export async function issuePlayerSetupToken(userId: string): Promise<string | null> {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SETUP_TOKEN_TTL_MS)
  const rows = (await db`
    UPDATE users SET reset_token = ${token}, reset_token_expires = ${expires}
    WHERE id = ${userId} AND roster_pending = true
    RETURNING id
  `) as unknown as Array<{ id: string }>
  if (rows.length === 0) return null
  return `${resolveBaseUrl()}/reset-password?token=${token}&setup=1`
}

export async function addPlayerToTeam(input: AddPlayerInput): Promise<AddPlayerResult> {
  const firstName = cleanName(input.firstName)
  if (!firstName) throw new AddPlayerError('First name is required')

  const lastNameRaw = cleanName(input.lastName)
  const parentName = cleanName(input.parentName) || null
  const phone = cleanName(input.phone) || null
  const email = input.email ? input.email.toLowerCase().trim() : ''

  if (!isCleanDisplayText(`${firstName} ${lastNameRaw} ${parentName ?? ''}`)) {
    throw new AddPlayerError('Please use appropriate names only.')
  }

  const li = lastInitial(lastNameRaw)
  const displayName = `${firstName}${li ? ' ' + li + '.' : ''}`

  // ── No email: name-only pending invite (existing behaviour) ──────────────
  if (!email) {
    const inviteToken = crypto.randomBytes(24).toString('hex')
    await db`
      INSERT INTO pending_team_members (team_id, first_name, last_name_initial, invite_token)
      VALUES (${input.teamId}, ${firstName}, ${li}, ${inviteToken})
    `
    return {
      status: 'invited',
      inviteUrl: `${resolveBaseUrl()}/signup?teamInvite=${inviteToken}`,
      displayName,
    }
  }

  if (!isValidEmail(email)) throw new AddPlayerError('That email address looks invalid.')

  // ── Email given: create or reuse a real account, then attach to the team ──
  const [existing] = (await db`
    SELECT id, password_hash, roster_pending FROM users WHERE email = ${email}
  `) as unknown as [{ id: string; password_hash: string | null; roster_pending: boolean | null } | undefined]

  let userId: string
  let created = false
  if (existing) {
    userId = existing.id
    // Fill in contact details we didn't have, without clobbering anything set.
    await db`
      UPDATE users
      SET parent_name = COALESCE(parent_name, ${parentName}),
          phone = COALESCE(phone, ${phone}),
          nickname = COALESCE(NULLIF(nickname, ''), ${firstName})
      WHERE id = ${userId}
    `
  } else {
    const [row] = (await db`
      INSERT INTO users (email, nickname, parent_name, phone, roster_pending, free_analysis_used)
      VALUES (${email}, ${firstName}, ${parentName}, ${phone}, true, true)
      RETURNING id
    `) as unknown as [{ id: string }]
    userId = row.id
    created = true
    // Adopt any anonymous submissions already sitting under this email.
    await db`UPDATE submissions SET user_id = ${userId} WHERE email = ${email} AND user_id IS NULL`
  }

  await addToEmailList(email)

  // Attach to the team (idempotent). ON CONFLICT tells us if they were new to
  // the roster: xmax = 0 on a freshly inserted row.
  const membership = (await db`
    INSERT INTO team_memberships (user_id, team_id, first_name, last_name_initial)
    VALUES (${userId}, ${input.teamId}, ${firstName}, ${li})
    ON CONFLICT (user_id, team_id) DO UPDATE
      SET first_name = EXCLUDED.first_name, last_name_initial = EXCLUDED.last_name_initial
    RETURNING (xmax = 0) AS inserted
  `) as unknown as [{ inserted: boolean }]
  const newlyOnTeam = membership[0]?.inserted ?? true

  if (newlyOnTeam) {
    try { await grantFreeOrgTokensIfEligible(input.teamId) } catch {}
  }

  // A brand-new stub gets a setup link. An account that already existed does
  // not — the person already has (or is setting up) their own credentials.
  let setupUrl: string | undefined
  let emailed = false
  if (created) {
    setupUrl = (await issuePlayerSetupToken(userId)) ?? undefined
    if (input.sendEmail && setupUrl) {
      try {
        await sendPlayerSetupEmail(email, input.teamName ?? null, setupUrl, parentName)
        emailed = true
      } catch (err) {
        console.error('[roster] setup email failed:', err instanceof Error ? err.message : err)
      }
    }
  }

  return {
    status: created ? 'created' : newlyOnTeam ? 'linked' : 'already_on_team',
    userId,
    setupUrl,
    emailed,
    displayName,
  }
}
