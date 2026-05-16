import type { NextResponse } from 'next/server'

// One session cookie per account type — player, team coach, organization.
export const PLAYER_COOKIE = 'fc_session'
export const TEAM_COOKIE = 'fc_team_session'
export const ORG_COOKIE = 'fc_org_session'

const ALL_SESSION_COOKIES = [PLAYER_COOKIE, TEAM_COOKIE, ORG_COOKIE]

function expire(res: NextResponse, name: string) {
  res.cookies.set({ name, value: '', httpOnly: true, path: '/', maxAge: 0 })
}

/** Full logout — expires every account's session cookie. */
export function clearAllSessions(res: NextResponse) {
  for (const name of ALL_SESSION_COOKIES) expire(res, name)
}

/**
 * Expires every session cookie except `keep`, so only one account stays
 * signed in. Call after setting the cookie you want to keep.
 */
export function clearOtherSessions(res: NextResponse, keep: string) {
  for (const name of ALL_SESSION_COOKIES) {
    if (name !== keep) expire(res, name)
  }
}
