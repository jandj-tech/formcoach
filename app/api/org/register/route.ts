import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signOrgSession, orgSessionCookieOptions } from '@/lib/org-auth'
import { isCleanDisplayText, BLOCKED_TEXT_ERROR } from '@/lib/moderation'
import { addToEmailList } from '@/lib/email-list'
import { randomInt } from 'crypto'
import { BCRYPT_COST } from '@/lib/password'
import { rateLimitByIp } from '@/lib/rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'

function generateAccessCode(): string {
  // randomInt, not Math.random: an access code is a bearer credential (it lets
  // an anonymous player spend the coach's credits), and Math.random is
  // predictable from prior outputs.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[randomInt(chars.length)]
  }
  return code
}

export async function POST(req: NextRequest) {
  try {
    // Already gated by a one-time approval token, so this only blunts someone
    // brute-forcing tokens against the endpoint.
    const limit = await rateLimitByIp(req, 'org-register', 10, 3600)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const { name, email, password, token, turnstileToken } = await req.json()

    const captcha = await verifyTurnstile(req, turnstileToken)
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.error }, { status: 400 })
    }

    if (name && !isCleanDisplayText(name)) {
      return NextResponse.json({ error: BLOCKED_TEXT_ERROR }, { status: 400 })
    }
    if (!name || !email || !password || password.length < 6) {
      return NextResponse.json({ error: 'Organization name, email, and password (6+ chars) required' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()

    // Require a valid approval token
    if (!token) {
      return NextResponse.json({ error: 'Invalid or missing approval token.' }, { status: 403 })
    }
    const [application] = await db`
      SELECT id FROM org_applications
      WHERE signup_token = ${token} AND status = 'approved'
    ` as unknown as [{ id: string } | undefined]
    if (!application) {
      return NextResponse.json({ error: 'This signup link is invalid or has already been used.' }, { status: 403 })
    }

    const existing = await db`SELECT id FROM organizations WHERE admin_email = ${emailLower}`
    if (existing.length > 0) {
      return NextResponse.json({ error: 'An organization already exists for this email. Please log in.' }, { status: 409 })
    }

    const hash = await bcrypt.hash(password, BCRYPT_COST)

    let accessCode = generateAccessCode()
    for (let attempt = 0; attempt < 5; attempt++) {
      const collision = await db`SELECT id FROM organizations WHERE access_code = ${accessCode}`
      if (collision.length === 0) break
      accessCode = generateAccessCode()
    }

    const [org] = await db`
      INSERT INTO organizations (name, admin_email, password_hash, access_code, subscription_status)
      VALUES (${name.trim()}, ${emailLower}, ${hash}, ${accessCode}, 'comp')
      RETURNING id, admin_email
    ` as unknown as [{ id: string; admin_email: string }]

    // Mark the application as used so the token can't be reused
    await db`UPDATE org_applications SET status = 'registered' WHERE signup_token = ${token}`

    // New accounts join the marketing list (unsubscribe honored/preserved).
    await addToEmailList(emailLower)

    const sessionToken = await signOrgSession({ orgId: org.id, adminEmail: org.admin_email })
    const res = NextResponse.json({ success: true })
    res.cookies.set(orgSessionCookieOptions(sessionToken))
    return res
  } catch (err) {
    console.error('Org register error:', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
