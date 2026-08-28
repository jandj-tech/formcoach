import { NextRequest, NextResponse } from 'next/server'
import {
  appleProfileFromCode,
  googleProfileFromCode,
  isOAuthProvider,
  safeNext,
  verifyState,
  type OAuthProfile,
  type OAuthState,
} from '@/lib/oauth'
import {
  OAuthSignInError,
  applySignupContext,
  createLoginCode,
  signInWithOAuthProfile,
} from '@/lib/oauth-account'
import { clearOtherSessions } from '@/lib/sessions'
import { sendMetaEvent, makeRegistrationEvent } from '@/lib/meta-server'
import { OAUTH_STATE_COOKIE } from '../start/route'

export const dynamic = 'force-dynamic'

/** Custom scheme the native app is registered for (app.json `scheme`). */
const APP_SCHEME = 'learnhoops'

/** Google comes back as a redirect. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  const q = req.nextUrl.searchParams
  return finish(req, provider, {
    code: q.get('code'),
    state: q.get('state'),
    error: q.get('error'),
    user: null,
  })
}

/**
 * Apple comes back as a cross-site form POST, because asking for the name or
 * email scope forces `response_mode=form_post`.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  const form = await req.formData()
  const str = (k: string) => {
    const v = form.get(k)
    return typeof v === 'string' ? v : null
  }
  return finish(req, provider, {
    code: str('code'),
    state: str('state'),
    error: str('error'),
    // Apple sends the person's name exactly once, on the very first
    // authorization, and never again. If it is not captured here it is gone.
    user: str('user'),
  })
}

interface CallbackInput {
  code: string | null
  state: string | null
  error: string | null
  user: string | null
}

async function finish(req: NextRequest, providerParam: string, input: CallbackInput) {
  const origin = req.nextUrl.origin

  if (!isOAuthProvider(providerParam)) {
    return NextResponse.json({ error: 'Unknown sign-in provider' }, { status: 404 })
  }
  const provider = providerParam

  const state = input.state ? await verifyState(input.state) : null

  // The state carries where to go back to, so a failure before it is verified
  // can only fall back to the website's login page.
  if (input.error || !input.code || !state || state.provider !== provider) {
    const reason = input.error === 'user_cancelled_authorize' ? 'cancelled' : 'failed'
    return bail(origin, state, reason)
  }

  // Secondary check: when the browser did send the state cookie back, it must
  // match. Apple's cross-site POST may legitimately drop it, so a missing
  // cookie is not treated as an attack — the signature is the real defence.
  const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value
  if (cookieState && cookieState !== input.state) {
    return bail(origin, state, 'failed')
  }

  let profile: OAuthProfile
  try {
    profile =
      provider === 'google'
        ? await googleProfileFromCode(input.code, state.nonce)
        : await appleProfileFromCode(input.code, { nonce: state.nonce })
    profile = { ...profile, name: profile.name ?? appleNameFrom(input.user) }
  } catch (err) {
    console.error(`OAuth callback failed for ${provider}:`, err)
    return bail(origin, state, 'failed')
  }

  try {
    const result = await signInWithOAuthProfile(profile)

    if (result.userId) {
      await applySignupContext(result.userId, {
        claimToken: state.claimToken,
        teamInvite: state.teamInvite,
      })
    }

    // New accounts are reported to Meta the same way password signups are, so
    // the two paths do not disagree about how many registrations there were.
    if (result.isNewAccount && state.mode === 'web' && profile.email) {
      await sendMetaEvent(
        makeRegistrationEvent({
          email: profile.email,
          ip: req.headers.get('x-forwarded-for') ?? undefined,
          userAgent: req.headers.get('user-agent') ?? undefined,
          url: `${origin}/signup`,
        })
      ).catch(() => {})
    }

    if (state.mode === 'mobile') {
      // The app only signs players in; coach and organization dashboards live
      // on the website.
      if (result.accountType !== 'player' || !result.userId) {
        return NextResponse.redirect(`${APP_SCHEME}://auth?error=coach_account`)
      }
      const code = await createLoginCode(result.userId)
      const res = NextResponse.redirect(`${APP_SCHEME}://auth?code=${encodeURIComponent(code)}`)
      res.cookies.delete(OAUTH_STATE_COOKIE)
      return res
    }

    const target = result.accountType === 'player' ? safeNext(state.next) : result.redirect
    const url = new URL(target, origin)
    // A team code typed on the signup form needs a first name and last initial
    // that no provider supplies, so hand it to the dashboard's join popup —
    // the same one a password signup with ?teamCode= ends up at.
    if (result.accountType === 'player' && state.teamCode) {
      url.searchParams.set('joinTeam', state.teamCode)
    }
    const res = NextResponse.redirect(url)
    res.cookies.set(result.cookie)
    clearOtherSessions(res, result.keepCookie)
    res.cookies.delete(OAUTH_STATE_COOKIE)
    return res
  } catch (err) {
    if (err instanceof OAuthSignInError) return bail(origin, state, 'no_email')
    console.error(`OAuth sign-in failed for ${provider}:`, err)
    return bail(origin, state, 'failed')
  }
}

/** Apple's one-shot `user` payload: {"name":{"firstName":"Sam","lastName":"Doe"}}. */
function appleNameFrom(raw: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { name?: { firstName?: string; lastName?: string } }
    const full = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(' ').trim()
    return full || null
  } catch {
    return null
  }
}

function bail(origin: string, state: OAuthState | null, reason: string) {
  if (state?.mode === 'mobile') {
    return NextResponse.redirect(`${APP_SCHEME}://auth?error=${encodeURIComponent(reason)}`)
  }
  const url = new URL('/login', origin)
  url.searchParams.set('error', `oauth_${reason}`)
  if (state?.next) url.searchParams.set('next', safeNext(state.next))
  return NextResponse.redirect(url)
}
