import { NextRequest, NextResponse } from 'next/server'
import { signSession, sessionCookieOptions } from '@/lib/auth'
import { choiceRowForPlayer, verifyPlayerChoice } from '@/lib/player-accounts'
import { applySignupContext } from '@/lib/oauth-account'
import { clearOtherSessions, PLAYER_COOKIE } from '@/lib/sessions'
import { rateLimitByIp } from '@/lib/rate-limit'

/**
 * Finishes a password login that opened several player accounts (a shared
 * login — see app/api/auth/login): `{ choiceToken, playerId, claimToken? }`
 * → a player session for the chosen account, as a cookie AND `token` in the
 * body (the Bearer the app stores), like /api/team/select.
 *
 * The choice token is the only proof accepted: it names exactly the accounts
 * the password opened, each bound to the password hash that matched, so a
 * password change in the ten minutes since voids that account's choice.
 */
export async function POST(req: NextRequest) {
  try {
    // Depth only — a signed, short-lived token is required either way.
    const limit = await rateLimitByIp(req, 'player-select', 30, 900)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const body = (await req.json().catch(() => ({}))) as {
      choiceToken?: unknown
      playerId?: unknown
      claimToken?: unknown
    }
    if (typeof body.playerId !== 'string' || !body.playerId) {
      return NextResponse.json({ error: 'Player is required' }, { status: 400 })
    }

    const choice = await verifyPlayerChoice(body.choiceToken)
    if (!choice) {
      return NextResponse.json({ error: 'That sign-in has expired. Log in again.' }, { status: 401 })
    }
    const row = await choiceRowForPlayer(choice, body.playerId)
    if (!row) {
      return NextResponse.json({ error: 'That player is not available for this login. Log in again.' }, { status: 403 })
    }

    if (typeof body.claimToken === 'string' && body.claimToken) {
      // Same one-time ball-purchase claim the login route redeems.
      await applySignupContext(row.id, { claimToken: body.claimToken })
    }

    const token = await signSession({ userId: row.id, email: row.email }, row.password_hash)
    const res = NextResponse.json({ success: true, token })
    res.cookies.set(sessionCookieOptions(token))
    clearOtherSessions(res, PLAYER_COOKIE)
    return res
  } catch (err) {
    console.error('Player select error:', err)
    return NextResponse.json({ error: 'Failed to select player' }, { status: 500 })
  }
}
