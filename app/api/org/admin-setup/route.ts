import { NextRequest, NextResponse } from 'next/server'
import { acceptOrgAdminInvite } from '@/lib/org-admins'
import { signOrgSession, orgSessionCookieOptions } from '@/lib/org-auth'
import { rateLimitByIp } from '@/lib/rate-limit'

// Trades an org-admin invite token (emailed link) for a password and an org
// session. Rate-limited like /api/team/setup: an unlimited endpoint is a
// token-guessing oracle.
export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimitByIp(req, 'org-admin-setup', 60, 900)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
      )
    }
    const { token, password } = (await req.json().catch(() => ({}))) as { token?: unknown; password?: unknown }
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Setup token is required' }, { status: 400 })
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password (6+ characters) required' }, { status: 400 })
    }
    const cred = await acceptOrgAdminInvite(token, password)
    if (!cred) return NextResponse.json({ error: 'Invalid or expired setup link' }, { status: 404 })

    const sessionToken = await signOrgSession({ orgId: cred.orgId, adminEmail: cred.email }, cred.hash)
    const res = NextResponse.json({ success: true, redirect: '/org/dashboard' })
    res.cookies.set(orgSessionCookieOptions(sessionToken))
    return res
  } catch (err) {
    console.error('Org admin setup error:', err)
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 })
  }
}
