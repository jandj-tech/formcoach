import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import {
  appleAuthUrl,
  googleAuthUrl,
  isOAuthProvider,
  OAUTH_STATE_COOKIE,
  safeNext,
  signState,
  type OAuthMode,
} from '@/lib/oauth'

export const dynamic = 'force-dynamic'

/**
 * Kicks off a provider sign-in.
 *
 * `?mode=mobile` marks the round trip as coming from the native app, so the
 * callback deep-links back into it instead of rendering a page.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  if (!isOAuthProvider(provider)) {
    return NextResponse.json({ error: 'Unknown sign-in provider' }, { status: 404 })
  }

  const q = req.nextUrl.searchParams
  const mode: OAuthMode = q.get('mode') === 'mobile' ? 'mobile' : 'web'
  const next = safeNext(q.get('next'))
  const nonce = randomBytes(16).toString('hex')

  // Signup context is carried in the signed state, since the trip through the
  // provider loses every query parameter we started with.
  const short = (k: string) => q.get(k)?.trim().slice(0, 128) || undefined

  let state: string
  let authUrl: string
  try {
    state = await signState({
      nonce,
      mode,
      next,
      provider,
      claimToken: short('claimToken'),
      teamInvite: short('teamInvite'),
      teamCode: short('teamCode'),
    })
    authUrl =
      provider === 'google'
        ? googleAuthUrl({ state, nonce, loginHint: q.get('email') ?? undefined })
        : appleAuthUrl({ state, nonce })
  } catch (err) {
    // requireEnv throws when a provider is not configured yet. Say so plainly
    // rather than bouncing the visitor to a broken provider page.
    console.error(`OAuth start failed for ${provider}:`, err)
    return NextResponse.redirect(new URL('/login?error=oauth_unavailable', req.nextUrl.origin))
  }

  const res = NextResponse.redirect(authUrl)
  res.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Apple returns via a cross-site form POST, which a Lax cookie would not be
    // sent with. The cookie is a secondary check — the signed state is what the
    // callback actually trusts — so widening it here costs nothing.
    sameSite: provider === 'apple' ? 'none' : 'lax',
    path: '/',
    maxAge: 600,
  })
  return res
}
