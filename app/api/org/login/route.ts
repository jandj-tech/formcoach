import { NextRequest, NextResponse } from 'next/server'
import { orgLoginForEmail } from '@/lib/org-admins'
import { signOrgSession, orgSessionCookieOptions } from '@/lib/org-auth'
import { rateLimitLogin } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    // Tight per-account limit, looser per-IP ceiling (a gym shares one IP).
    const limit = await rateLimitLogin(req, 'org-login', typeof email === 'string' ? email : null)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    // The owner's login (organizations) or a linked admin's (org_admins) —
    // whichever this email + password matches. lib/org-admins.ts.
    const cred = await orgLoginForEmail(String(email), String(password))
    if (!cred) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const token = await signOrgSession({ orgId: cred.orgId, adminEmail: cred.email }, cred.hash)
    const res = NextResponse.json({ success: true })
    res.cookies.set(orgSessionCookieOptions(token))
    return res
  } catch (err) {
    console.error('Org login error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
