import type { NextResponse } from 'next/server'

// One session cookie per account type — player, team coach, organization.
export const PLAYER_COOKIE = 'fc_session'
export const TEAM_COOKIE = 'fc_team_session'
export const ORG_COOKIE = 'fc_org_session'

// The owner's admin cookie counts as a session too. It lasts 7 days and used
// to survive every logout and account switch, so a results page kept saying
// "you're viewing this as a coach" long after signing out.
export const ADMIN_COOKIE = 'admin_auth'

const ALL_SESSION_COOKIES = [PLAYER_COOKIE, TEAM_COOKIE, ORG_COOKIE, ADMIN_COOKIE]

function expire(res: NextResponse, name: string) {
  res.cookies.set({ name, value: '', httpOnly: true, path: '/', maxAge: 0 })
}

/** Full logout — expires every account's session cookie. */
export function clearAllSessions(res: NextResponse) {
  for (const name of ALL_SESSION_COOKIES) expire(res, name)
}

/**
 * Expires every session cookie except `keep`, so only one account stays
 * signed in. Call after setting the cookie you want to keep. Signing into any
 * account therefore also drops admin mode — otherwise the browser would still
 * be treated as the owner while showing someone else's login.
 */
export function clearOtherSessions(res: NextResponse, keep: string) {
  for (const name of ALL_SESSION_COOKIES) {
    if (name !== keep) expire(res, name)
  }
}
