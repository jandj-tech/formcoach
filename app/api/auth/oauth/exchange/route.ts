import { NextRequest, NextResponse } from 'next/server'
import { signSession, sessionCookieOptions } from '@/lib/auth'
import { redeemLoginCode } from '@/lib/oauth-account'
import { rateLimitByIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Trades the one-time code from a native sign-in deep link for a session JWT.
 *
 * The code is single-use and expires in two minutes, so the window in which a
 * leaked deep link is worth anything is tiny — and the JWT itself is only ever
 * returned over HTTPS, in a response body, to whoever holds the code.
 */
export async function POST(req: NextRequest) {
  const limit = await rateLimitByIp(req, 'oauth-exchange', 20, 900)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts — try again later' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const { code } = (await req.json().catch(() => ({}))) as { code?: string }
  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 })
  }

  const user = await redeemLoginCode(code)
  if (!user) {
    return NextResponse.json({ error: 'That sign-in link has expired. Please try again.' }, { status: 400 })
  }

  const token = await signSession({ userId: user.id, email: user.email })
  const res = NextResponse.json({ success: true, token })
  // The app reads `token`; the cookie is set as well so the same endpoint works
  // from a browser without a second round trip.
  res.cookies.set(sessionCookieOptions(token))
  return res
}
