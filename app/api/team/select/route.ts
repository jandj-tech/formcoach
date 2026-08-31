import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getTeamSessionFromRequest,
  signTeamSession,
  teamSessionCookieOptions,
  verifyTeamChoice,
} from '@/lib/team-auth'
import { clearOtherSessions, TEAM_COOKIE } from '@/lib/sessions'
import { rateLimitByIp } from '@/lib/rate-limit'

/**
 * Issues a team session for one of the caller's own teams.
 *
 * This endpoint used to take `{ teamId, email }` and mint a full team session
 * for whoever asked, checking only that the pair existed in the same row. No
 * password, no existing session, nothing tying the request to a login. A team
 * id is a UUID, so it was not guessable — but it is not a secret either: it
 * travels in API responses, in the mobile app, and to every org admin over that
 * team. Anyone who saw one once had permanent, passwordless coach access to
 * that team's roster, chat and credits. Authentication was being enforced by
 * the login page, which is to say not at all.
 *
 * There are exactly two legitimate callers, and each now has to prove itself:
 *
 *   A. the login page, where a coach with several teams picks one. Login has
 *      checked the password but cannot issue a session yet, so it hands back a
 *      10-minute team-choice token naming the teams that coach may choose
 *      between. The chosen id has to be one of them.
 *   B. the team dashboard's team switcher, where the coach already holds a
 *      valid team session. The target team must share that session's
 *      admin_email — a coach may only switch between their own teams.
 *
 * The email is never read from the request body any more; it comes from the
 * verified token in both paths.
 */
export async function POST(req: NextRequest) {
  try {
    // Cheap brute-force ceiling. Both paths require a signed token, so this is
    // depth rather than the primary control.
    const limit = await rateLimitByIp(req, 'team-select', 30, 900)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const { teamId, choiceToken } = await req.json()
    if (!teamId || typeof teamId !== 'string') {
      return NextResponse.json({ error: 'Team is required' }, { status: 400 })
    }

    let adminEmail: string | null = null

    // Path A — fresh login, holding a team-choice token.
    if (typeof choiceToken === 'string' && choiceToken) {
      const choice = await verifyTeamChoice(choiceToken)
      if (choice && choice.teamIds.includes(teamId)) {
        adminEmail = choice.adminEmail
      }
    }

    // Path B — already signed in, switching teams.
    if (!adminEmail) {
      const session = await getTeamSessionFromRequest(req)
      if (session) adminEmail = session.adminEmail
    }

    if (!adminEmail) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Even with a proven identity, confirm the team is actually theirs. Path A
    // already constrained the id to the token's list; this also covers path B,
    // and re-reads admin_email so the session is signed from the database
    // rather than from anything the client sent.
    const [team] = (await db`
      SELECT id, admin_email FROM teams
      WHERE id = ${teamId} AND admin_email = ${adminEmail.toLowerCase().trim()}
    `) as unknown as [{ id: string; admin_email: string } | undefined]

    if (!team) {
      return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })
    }

    const token = await signTeamSession({ teamId: team.id, adminEmail: team.admin_email })
    // `token` is for the mobile app (Bearer auth); the web follows the cookie.
    const res = NextResponse.json({ success: true, token })
    res.cookies.set(teamSessionCookieOptions(token))
    clearOtherSessions(res, TEAM_COOKIE)
    return res
  } catch (err) {
    console.error('Team select error:', err)
    return NextResponse.json({ error: 'Failed to select team' }, { status: 500 })
  }
}
