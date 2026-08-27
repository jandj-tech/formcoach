import { NextRequest, NextResponse } from 'next/server'
import {
  appleAppClientId,
  appleProfileFromCode,
  verifyAppleIdToken,
  type OAuthProfile,
} from '@/lib/oauth'
import { OAuthSignInError, signInWithOAuthProfile } from '@/lib/oauth-account'
import { rateLimitByIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

interface NativeBody {
  identityToken?: string
  /** Apple's short-lived code — exchanged for the refresh token that account deletion revokes. */
  authorizationCode?: string
  fullName?: string
  nonce?: string
}

/**
 * Sign in with Apple, done natively.
 *
 * iOS presents Apple's own sheet (Face ID, one tap, no browser) and hands the
 * app a signed identity token. Everything that matters is verified here against
 * Apple's public keys — the app is not trusted to have checked anything.
 *
 * Google on mobile deliberately does NOT go through here: it runs the same web
 * flow in a system browser, which is what Google requires of native apps and
 * what keeps one implementation instead of two.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  if (provider !== 'apple') {
    return NextResponse.json(
      { error: 'Native sign-in is only available for Apple. Use the browser flow.' },
      { status: 404 }
    )
  }

  const limit = await rateLimitByIp(req, 'oauth-native', 20, 900)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts — try again later' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const body = (await req.json().catch(() => ({}))) as NativeBody
  if (!body.identityToken) {
    return NextResponse.json({ error: 'Missing identity token' }, { status: 400 })
  }

  const clientId = appleAppClientId()

  let profile: OAuthProfile
  try {
    profile = await verifyAppleIdToken(body.identityToken, { audience: clientId, nonce: body.nonce })
  } catch (err) {
    console.error('Apple native token verification failed:', err)
    return NextResponse.json({ error: 'Could not verify that Apple sign-in.' }, { status: 401 })
  }

  // Best effort: exchanging the authorization code yields the refresh token
  // Apple's revoke endpoint needs at account deletion. A failure here must not
  // block the sign-in — the person in front of us did nothing wrong.
  if (body.authorizationCode) {
    try {
      const exchanged = await appleProfileFromCode(body.authorizationCode, { clientId })
      if (exchanged.subject === profile.subject) {
        profile = { ...profile, refreshToken: exchanged.refreshToken ?? null }
      }
    } catch (err) {
      console.warn('Apple code exchange failed (revocation token unavailable):', err instanceof Error ? err.message : err)
    }
  }

  // Apple sends the name only on the first authorization, and only to the app.
  if (body.fullName?.trim()) profile = { ...profile, name: body.fullName.trim() }

  try {
    const result = await signInWithOAuthProfile(profile)
    if (result.accountType !== 'player' || !result.token) {
      return NextResponse.json(
        { error: 'That address belongs to a coach or organization account — please sign in on the website.' },
        { status: 403 }
      )
    }
    return NextResponse.json({ success: true, token: result.token })
  } catch (err) {
    if (err instanceof OAuthSignInError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('Apple native sign-in failed:', err)
    return NextResponse.json({ error: 'Sign-in failed. Please try again.' }, { status: 500 })
  }
}
