import { NextRequest, NextResponse } from 'next/server'
import { adminCookieOptions, isAdminPassword, signAdminSession } from '@/lib/admin-auth'
import { rateLimitByIp } from '@/lib/rate-limit'

// The cookie used to hold the admin password itself, in plaintext, and the
// check was an unlimited-attempt `!==` against the env var. It now issues a
// signed, expiring session token and throttles guesses.
export async function POST(req: NextRequest) {
  const limit = await rateLimitByIp(req, 'admin-login', 8, 900)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many attempts — try again later' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    )
  }

  const { password } = (await req.json().catch(() => ({}))) as { password?: unknown }

  // isAdminPassword throws when ADMIN_PASSWORD is unset, so an unconfigured
  // deployment returns 500 rather than granting access — the old comparison
  // let `undefined !== undefined` through as a successful login.
  let ok: boolean
  try {
    ok = isAdminPassword(password)
  } catch (err) {
    console.error('[admin/login]', err)
    return NextResponse.json({ error: 'Admin login is not configured' }, { status: 500 })
  }

  if (!ok) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set(adminCookieOptions(await signAdminSession()))
  return res
}
