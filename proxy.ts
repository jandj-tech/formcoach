import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { getTeamSessionFromRequest } from '@/lib/team-auth'
import { getOrgSessionFromRequest } from '@/lib/org-auth'
import { ALL_SESSION_COOKIES, UI_AUTH_HINT_COOKIE } from '@/lib/sessions'

/**
 * Keeps the readable `fc_ui_auth` hint in step with the httpOnly session
 * cookies, so the cookie banner can tell a signed-in visitor from a signed-out
 * one and show the small dismissable sheet instead of blocking the page.
 *
 * Presence is all we check — no JWT verification. This decides the size of a
 * banner and nothing else, so an expired or forged cookie costs nothing and is
 * not worth the crypto on every marketing page view.
 *
 * Only writes when the value actually changes, so the usual request carries no
 * Set-Cookie header and the statically prerendered pages here stay cacheable.
 */
function syncAuthHint(req: NextRequest, res: NextResponse): NextResponse {
  const signedIn = ALL_SESSION_COOKIES.some((name) => req.cookies.has(name))
  const hinted = req.cookies.get(UI_AUTH_HINT_COOKIE)?.value === '1'
  if (signedIn === hinted) return res

  if (signedIn) {
    res.cookies.set({
      name: UI_AUTH_HINT_COOKIE,
      value: '1',
      httpOnly: false, // the whole point: the banner has to be able to read it
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
  } else {
    res.cookies.set({ name: UI_AUTH_HINT_COOKIE, value: '', path: '/', maxAge: 0 })
  }
  return res
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Marketing routes: nothing to guard here, we only refresh the banner's hint.
  if (
    !pathname.startsWith('/dashboard') &&
    !pathname.startsWith('/team/dashboard') &&
    !pathname.startsWith('/org/dashboard')
  ) {
    return syncAuthHint(req, NextResponse.next())
  }

  if (pathname.startsWith('/dashboard')) {
    const session = await getSessionFromRequest(req)
    if (!session) {
      const loginUrl = new URL('/login', req.url)
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  if (pathname.startsWith('/team/dashboard')) {
    const session = await getTeamSessionFromRequest(req)
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  if (pathname.startsWith('/org/dashboard')) {
    const session = await getOrgSessionFromRequest(req)
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/team/dashboard/:path*',
    '/org/dashboard/:path*',
    // The routes that can show the blocking modal — matched only so the auth
    // hint is fresh before the banner decides how hard to interrupt. Keep this
    // list in step with MODAL_ROUTES in lib/consent-surface.ts.
    '/',
    '/mission',
    '/learn',
    '/shop',
    '/partners',
    '/team',
    '/pricing',
    '/org/pricing',
  ],
}
