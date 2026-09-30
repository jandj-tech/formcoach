import { NextRequest, NextResponse } from 'next/server'
import {
  OAUTH_CHOICE_COOKIE,
  clearOAuthPlayerChoiceCookie,
  completeOAuthPlayerChoice,
  oauthPlayerChoiceOptions,
} from '@/lib/oauth-account'
import { clearOtherSessions } from '@/lib/sessions'
import { rateLimitByIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * The website's "Which player?" after Google/Apple sign-in, when several
 * unlinked player accounts share the provider-verified address. The OAuth
 * callback leaves an encrypted, httpOnly, 10-minute choice cookie bound to
 * the provider identity (lib/oauth-account.ts); no password is needed because
 * the provider proved the inbox.
 *
 *   GET  → { provider, players: [{ id, firstName }] }  (401 when no choice pending)
 *   POST { playerId } → links the identity to that account, player session
 *        cookie, { success: true, redirect }
 */
export async function GET(req: NextRequest) {
  const options = await oauthPlayerChoiceOptions(req.cookies.get(OAUTH_CHOICE_COOKIE)?.value)
  if (!options) {
    const res = NextResponse.json({ error: 'That sign-in has expired. Please try again.' }, { status: 401 })
    res.cookies.set(clearOAuthPlayerChoiceCookie())
    return res
  }
  return NextResponse.json(options)
}

export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimitByIp(req, 'player-select', 30, 900)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }
    const body = (await req.json().catch(() => ({}))) as { playerId?: unknown }
    if (typeof body.playerId !== 'string' || !body.playerId) {
      return NextResponse.json({ error: 'Player is required' }, { status: 400 })
    }

    const result = await completeOAuthPlayerChoice(req.cookies.get(OAUTH_CHOICE_COOKIE)?.value, body.playerId)
    if (!result) {
      const res = NextResponse.json(
        { error: 'That sign-in has expired or that player is no longer available. Please sign in again.' },
        { status: 403 }
      )
      res.cookies.set(clearOAuthPlayerChoiceCookie())
      return res
    }

    const res = NextResponse.json({ success: true, redirect: result.next })
    res.cookies.set(result.cookie)
    clearOtherSessions(res, result.keepCookie)
    res.cookies.set(clearOAuthPlayerChoiceCookie())
    return res
  } catch (err) {
    console.error('OAuth player select error:', err)
    return NextResponse.json({ error: 'Failed to select player' }, { status: 500 })
  }
}
