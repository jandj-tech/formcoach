import { NextRequest, NextResponse } from 'next/server'
import { teamTier } from '@/lib/team-features'
import type { OrgTier } from '@/lib/team-pricing'
import { db } from '@/lib/db'
import { getSessionFromRequest } from '@/lib/auth'
import { getTeamSessionFromRequest, teamSwitchEmail } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'

export interface ChatIdentity {
  isMember: boolean
  isCoach: boolean
  senderName: string
  muted: boolean
  /** Coach granted this player chat access (matters in coach-only mode). */
  allowed: boolean
  chatMode: 'everyone' | 'coach-only'
  teamName: string
}

/** Central posting rule: coaches always; players need the open mode or an
 *  explicit grant, and must not be muted. */
export function canPostInChat(identity: ChatIdentity): boolean {
  if (identity.isCoach) return true
  if (identity.muted) return false
  if (identity.chatMode === 'everyone') return true
  return identity.allowed
}

export const NO_ACCESS_MESSAGE =
  "You don't have access to send messages. If you'd like access, ask your coach."


// Resolves what a logged-in PLAYER account may do in a team's chat: players
// by team membership only.
//
// This used to also make the account a coach when its email matched the
// team's head coach or a team_coaches row. A player account proves nothing
// about that address — public signup has no email verification — so anyone
// who signed up with a coach's email got coach powers (moderation, posting
// in coach-only mode, schedule edits) on that coach's team. Coach powers now
// come only from a coach credential: a team session (password, invite link,
// or verified Google/Apple sign-in, which lib/oauth-account.ts routes to a
// team session before any player account) or an organization session.
export async function resolveChatIdentity(
  teamId: string,
  userId: string,
): Promise<ChatIdentity | null> {
  const [team] = (await db`
    SELECT id, name, COALESCE(chat_mode, 'coach-only') AS chat_mode
    FROM teams WHERE id = ${teamId}
  `) as unknown as [{ id: string; name: string; chat_mode: string } | undefined]
  if (!team) return null

  const [membership] = (await db`
    SELECT first_name, last_name_initial FROM team_memberships
    WHERE team_id = ${teamId} AND user_id = ${userId} LIMIT 1
  `) as unknown as [{ first_name: string | null; last_name_initial: string | null } | undefined]

  if (!membership) return null

  let muted = false
  try {
    const rows = (await db`
      SELECT 1 FROM team_chat_mutes WHERE team_id = ${teamId} AND user_id = ${userId} LIMIT 1
    `) as unknown as unknown[]
    muted = rows.length > 0
  } catch {}

  let allowed = false
  try {
    const rows = (await db`
      SELECT 1 FROM team_chat_allows WHERE team_id = ${teamId} AND user_id = ${userId} LIMIT 1
    `) as unknown as unknown[]
    allowed = rows.length > 0
  } catch {}

  const senderName = membership.first_name
    ? `${membership.first_name}${membership.last_name_initial ? ` ${membership.last_name_initial.charAt(0)}.` : ''}`
    : 'Player'

  return {
    isMember: true,
    isCoach: false,
    senderName,
    muted,
    allowed,
    chatMode: team.chat_mode === 'everyone' ? 'everyone' : 'coach-only',
    teamName: team.name,
  }
}

export type ChatSenderKind = 'player' | 'coach' | 'org'

export interface ChatActor {
  /** users.id when authenticated as a player account; null for team/org sessions. */
  userId: string | null
  email: string
  /**
   * Which kind of session this is. Stored on each message with the email
   * (team_messages.sender_kind / sender_email) so "mine" is decided by who
   * sent it, not by the display name — see isOwnMessage.
   */
  senderKind: ChatSenderKind
  /**
   * The name this coach's posts were stored under before sender_kind existed,
   * when it identified them alone (built from their nickname); else null.
   */
  legacyChatName: string | null
  identity: ChatIdentity
  /**
   * The team's plan tier.
   *
   * Carried here rather than resolved at each route because every chat and
   * schedule route already funnels through this one resolver — see the note at
   * the top of lib/team-schedule.ts — so this is the one place the answer
   * cannot be forgotten. Routes read the capability they need off it
   * (`tierCan(actor.tier, 'chat' | 'schedule')`) and turn a false into a 402,
   * which is how chat can be Basic-or-better while scheduling is Plus-only
   * without the two ever disagreeing about the plan.
   */
  tier: OrgTier
}

// Resolves chat identity from ANY of the site's session types:
// player user session, coach team session, or organization session.
// The website's coach/org dashboards authenticate with the latter two; the
// mobile app sends exactly one of them as a Bearer token.
//
// Returns null both when nobody is signed in and when the caller is signed in
// but has no business on this team — use chatDeniedResponse() to tell the two
// apart (401 vs 403).
export async function resolveChatActorFromRequest(
  req: NextRequest,
  teamId: string,
): Promise<ChatActor | null> {
  if (!teamId) return null

  const [team] = (await db`
    SELECT id, name, admin_email, coach_nickname, organization_id,
           COALESCE(chat_mode, 'coach-only') AS chat_mode
    FROM teams WHERE id = ${teamId}
  `.catch(() => [])) as unknown as [{ id: string; name: string; admin_email: string; coach_nickname: string | null; organization_id: string | null; chat_mode: string } | undefined]
  if (!team) return null

  // Resolved once for whichever session type turns out to be in play.
  const tier = await teamTier(teamId)

  const coachIdentity = (name: string): ChatIdentity => ({
    isMember: false,
    isCoach: true,
    senderName: name.slice(0, 120),
    muted: false,
    allowed: true,
    chatMode: team.chat_mode === 'everyone' ? 'everyone' : 'coach-only',
    teamName: team.name,
  })

  const orgName = async (): Promise<string> => {
    if (!team.organization_id) return 'Organization'
    const [org] = (await db`
      SELECT name FROM organizations WHERE id = ${team.organization_id}
    `.catch(() => [])) as unknown as [{ name: string | null } | undefined]
    return org?.name?.trim() || 'Organization'
  }

  // 1. Coach team session (web team dashboard, or the app's coach login).
  //    getTeamSessionFromRequest has already confirmed the session's email
  //    still coaches the team it was issued for; this confirms the session
  //    may act on the team being asked about with the SAME proven credential
  //    (teamSwitchEmail: equal password hash on both rows, or a live org
  //    session for an org team) — so a multi-team coach reaches each of their
  //    teams, but a session that only shares an email with a coach does not.
  const teamSession = await getTeamSessionFromRequest(req)
  if (teamSession) {
    const email = await teamSwitchEmail(teamSession, teamId, await getOrgSessionFromRequest(req))
    if (email) {
      const e = email.toLowerCase()
      if (e === team.admin_email.toLowerCase()) {
        const name = coachChatName('head', team.coach_nickname, email)
        return {
          userId: null, email: e, senderKind: 'coach', legacyChatName: legacyCoachName(team.coach_nickname),
          identity: coachIdentity(name), tier,
        }
      }
      const [row] = (await db`
        SELECT nickname FROM team_coaches
        WHERE team_id = ${teamId} AND LOWER(email) = ${e} AND password_hash IS NOT NULL LIMIT 1
      `.catch(() => [])) as unknown as [{ nickname: string | null } | undefined]
      if (row) {
        const name = coachChatName('assistant', row.nickname, email)
        return {
          userId: null, email: e, senderKind: 'coach', legacyChatName: legacyCoachName(row.nickname),
          identity: coachIdentity(name), tier,
        }
      }
      // Otherwise teamSwitchEmail matched the owning org's admin, who opened
      // the team from the org dashboard: they post as the organization.
      return { userId: null, email: e, senderKind: 'org', legacyChatName: null, identity: coachIdentity(await orgName()), tier }
    }
  }

  // 2. Organization session (web org dashboard) — coach powers over org teams.
  const orgSession = await getOrgSessionFromRequest(req)
  if (orgSession && team.organization_id && team.organization_id === orgSession.orgId) {
    return {
      userId: null,
      email: orgSession.adminEmail.toLowerCase(),
      senderKind: 'org',
      legacyChatName: null,
      identity: coachIdentity(await orgName()),
      tier,
    }
  }

  // 3. Player account — team members only, never a coach (see
  //    resolveChatIdentity for why an email match is not enough).
  const user = await getSessionFromRequest(req)
  if (user) {
    const identity = await resolveChatIdentity(teamId, user.userId)
    return identity
      ? { userId: user.userId, email: user.email.toLowerCase(), senderKind: 'player', legacyChatName: null, identity, tier }
      : null
  }

  return null
}

/** "derek.james42@x.test" -> "Derek"; the whole local part when it has no break. */
function emailFirstName(email: string): string {
  const local = (email.split('@')[0] ?? '').trim()
  const first = local.split(/[._\-+0-9]+/).find(Boolean) ?? local
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : 'Coach'
}

/**
 * A coach's name in chat. Coaches have no stored first/last name — only an
 * optional nickname and their email — so: role + nickname ("Head coach
 * Mike", "Assistant coach Dana"), else role + the first part of the email
 * ("Assistant coach Sam"). A nickname that already says "Coach ..." keeps
 * its own wording after the role ("Coach Mike" -> "Head coach Mike").
 * Every coach used to be stored as plain "Coach" without a nickname, which
 * made two coaches indistinguishable.
 */
export function coachChatName(role: 'head' | 'assistant', nickname: string | null | undefined, email: string): string {
  const label = role === 'head' ? 'Head coach' : 'Assistant coach'
  const nick = (nickname ?? '').replace(/\s+/g, ' ').trim().replace(/^coach\b\s*/i, '')
  return `${label} ${nick || emailFirstName(email)}`
}

/**
 * The name the pre-sender_kind code stored for a coach with this nickname,
 * or null without one (it stored the generic "Coach" every such coach shared).
 */
function legacyCoachName(nickname: string | null | undefined): string | null {
  if (!nickname) return null
  return nickname.toLowerCase().includes('coach') ? nickname : `${nickname} (Coach)`
}

/**
 * Whether a stored message was sent by this actor.
 *
 * Messages carry sender_kind + sender_email (players also sender_user_id).
 * Rows written before those columns existed have neither: a player's is
 * still matched by user id; a coach/org row can only be matched by name,
 * and only when that name was unique to one coach (a nickname) — the
 * generic "Coach" / "Organization (Coach)" of that era was shared by every
 * coach without a nickname, so it is never claimed as anyone's.
 */
export function isOwnMessage(
  actor: ChatActor,
  m: { sender_user_id: string | null; sender_kind: string | null; sender_email: string | null; sender_name: string },
): boolean {
  if (actor.senderKind === 'player') return !!actor.userId && m.sender_user_id === actor.userId
  if (m.sender_user_id) return false
  if (m.sender_kind) {
    return m.sender_kind === actor.senderKind && (m.sender_email ?? '').toLowerCase() === actor.email
  }
  return !!actor.legacyChatName && m.sender_name === actor.legacyChatName
}

/**
 * The response for a null resolveChatActorFromRequest: 401 when no session of
 * any kind is present, 403 when the caller is signed in but not on this team.
 * (A coach of the wrong team used to get "Login required", which sent them to
 * a login page that could not help.)
 */
export async function chatDeniedResponse(req: NextRequest): Promise<NextResponse> {
  const signedIn =
    !!(await getTeamSessionFromRequest(req)) ||
    !!(await getOrgSessionFromRequest(req)) ||
    !!(await getSessionFromRequest(req))
  return signedIn
    ? NextResponse.json({ error: 'Not your team' }, { status: 403 })
    : NextResponse.json({ error: 'Login required' }, { status: 401 })
}
