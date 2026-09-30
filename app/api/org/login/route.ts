import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
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

    const emailLower = email.toLowerCase().trim()
    const [org] = await db`
      SELECT id, admin_email, password_hash FROM organizations WHERE admin_email = ${emailLower}
    ` as unknown as [{ id: string; admin_email: string; password_hash: string } | undefined]

    if (!org) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, org.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const token = await signOrgSession({ orgId: org.id, adminEmail: org.admin_email }, org.password_hash)
    const res = NextResponse.json({ success: true })
    res.cookies.set(orgSessionCookieOptions(token))
    return res
  } catch (err) {
    console.error('Org login error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
