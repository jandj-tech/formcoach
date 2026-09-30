import { NextRequest, NextResponse } from 'next/server'
import {
  choiceRowForTeam,
  getTeamSessionFromRequest,
  signTeamSession,
  teamSessionCookieOptions,
  teamSwitchTarget,
  verifyTeamChoice,
} from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { clearOtherSessions, ORG_COOKIE, TEAM_COOKIE } from '@/lib/sessions'
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
 *      valid team session. Sharing an email with the target's coach is NOT
 *      enough (self-serve team registration never proved the inbox, so a
 *      stranger could hold a team session under a director's or assistant's
 *      address): the session's own row must carry the same password hash as
 *      the email's row on the target team, or — for an org director — the
 *      request must also carry a valid org session for the target's org.
 *      See teamSwitchEmail() in lib/team-auth.ts.
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

    // The proven identity, and which team it may land on.
    let signedEmail: string | null = null
    // The credential the new session is bound to (see signTeamSession).
    let credential: string | null = null

    // Path A — fresh login, holding a team-choice token. Login put in it only
    // teams whose own row's password matched (head or added coach), so the
    // chosen id must be one of them; it is re-checked against the database in
    // case the coach was removed in the ten minutes since.
    if (typeof choiceToken === 'string' && choiceToken) {
      const choice = await verifyTeamChoice(choiceToken)
      const row = choice ? await choiceRowForTeam(choice, teamId) : null
      if (row) {
        signedEmail = row.email
        credential = row.credential
      }
    }

    // Path B — already signed in (getTeamSessionFromRequest re-checks that the
    // session's email still coaches its team), switching to another team with
    // the SAME proven credential: an equal password hash on both rows, or a
    // live org session for the target's org when the email is its director.
    let authenticated = !!signedEmail
    let keepOrgCookie = false
    if (!signedEmail) {
      const session = await getTeamSessionFromRequest(req)
      if (session) {
        authenticated = true
        const orgSession = await getOrgSessionFromRequest(req)
        const target = await teamSwitchTarget(session, teamId, orgSession)
        signedEmail = target?.email ?? null
        credential = target?.credential ?? null
        keepOrgCookie = !!orgSession && typeof orgSession.adminEmail === 'string' &&
          orgSession.adminEmail.toLowerCase() === session.adminEmail.toLowerCase()
      }
    }

    if (!authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (!signedEmail) {
      return NextResponse.json({ error: 'Not authorized for this team' }, { status: 403 })
    }

    // Signed from the database's copy of the address, never the request's.
    const token = await signTeamSession({ teamId, adminEmail: signedEmail }, credential)
    // `token` is for the mobile app (Bearer auth); the web follows the cookie.
    const res = NextResponse.json({ success: true, token })
    res.cookies.set(teamSessionCookieOptions(token))
    // A director switching between their org's teams keeps their own org
    // cookie — it is what authorises the next switch (and the "back to
    // organization" link). Everyone else ends up with just the team session.
    if (keepOrgCookie) clearOtherSessions(res, TEAM_COOKIE, ORG_COOKIE)
    else clearOtherSessions(res, TEAM_COOKIE)
    return res
  } catch (err) {
    console.error('Team select error:', err)
    return NextResponse.json({ error: 'Failed to select team' }, { status: 500 })
  }
}
