import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signOrgSession, orgSessionCookieOptions } from '@/lib/org-auth'
import { cleanDisplayText } from '@/lib/moderation'
import { addToEmailList } from '@/lib/email-list'
import { randomInt } from 'crypto'
import { BCRYPT_COST } from '@/lib/password'
import { rateLimitLogin } from '@/lib/rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'
import { emailBelongsToCoachOrOrg } from '@/lib/team-auth'

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

// The approved application behind a signup link, so the form can open
// pre-filled. The token is the secret; nothing is returned without it.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  try {
    const [application] = await db`
      SELECT org_name, email FROM org_applications
      WHERE signup_token = ${token} AND status = 'approved'
    ` as unknown as [{ org_name: string; email: string } | undefined]
    if (!application) {
      return NextResponse.json({ error: 'This signup link is invalid or has already been used.' }, { status: 404 })
    }
    return NextResponse.json({ orgName: application.org_name, email: application.email.toLowerCase().trim() })
  } catch (err) {
    console.error('Org register lookup error:', err)
    return NextResponse.json({ error: 'Could not load this signup link' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, token, turnstileToken } = (await req.json().catch(() => ({}))) as {
      name?: unknown; email?: unknown; password?: unknown; token?: unknown; turnstileToken?: unknown
    }

    // Already gated by a one-time approval token, so this only blunts someone
    // brute-forcing tokens against the endpoint. Tight per email, looser per
    // IP so several directors on one network can still register.
    const limit = await rateLimitLogin(req, 'org-register', typeof email === 'string' ? email : null, {
      perIp: 30, perEmail: 5, windowSeconds: 3600,
    })
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const captcha = await verifyTurnstile(req, turnstileToken)
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.error }, { status: 400 })
    }

    if (
      typeof name !== 'string' || !name.trim() ||
      typeof email !== 'string' || !email.trim() ||
      typeof password !== 'string' || password.length < 6
    ) {
      return NextResponse.json({ error: 'Organization name, email, and password (6+ chars) required' }, { status: 400 })
    }
    const orgName = cleanDisplayText(name, 255)
    if (!orgName.ok) return NextResponse.json({ error: orgName.error }, { status: 400 })

    // Require a valid approval token
    if (typeof token !== 'string' || !token) {
      return NextResponse.json({ error: 'Invalid or missing approval token.' }, { status: 403 })
    }
    const [application] = await db`
      SELECT id, email FROM org_applications
      WHERE signup_token = ${token} AND status = 'approved'
    ` as unknown as [{ id: string; email: string } | undefined]
    if (!application) {
      return NextResponse.json({ error: 'This signup link is invalid or has already been used.' }, { status: 403 })
    }
    // The account is for the address that applied (and received this link),
    // not whatever was typed into the form.
    const emailLower = application.email.toLowerCase().trim()

    const existing = await db`SELECT id FROM organizations WHERE LOWER(admin_email) = ${emailLower}`
    if (existing.length > 0) {
      return NextResponse.json({ error: 'An organization already exists for this email. Please log in.' }, { status: 409 })
    }
    // The email here is typed, not proven: it must not become a second
    // identity for an existing coach (an org session under a coach's address
    // would list that coach's own uploads).
    if (await emailBelongsToCoachOrOrg(emailLower)) {
      return NextResponse.json(
        { error: 'This email already belongs to a coach or organization. Log in instead.' },
        { status: 409 },
      )
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
      VALUES (${orgName.value}, ${emailLower}, ${hash}, ${accessCode}, 'comp')
      RETURNING id, admin_email
    ` as unknown as [{ id: string; admin_email: string }]

    // Mark the application as used so the token can't be reused
    await db`UPDATE org_applications SET status = 'registered' WHERE signup_token = ${token}`

    // New accounts join the marketing list (unsubscribe honored/preserved).
    await addToEmailList(emailLower)

    const sessionToken = await signOrgSession({ orgId: org.id, adminEmail: org.admin_email }, hash)
    const res = NextResponse.json({ success: true })
    res.cookies.set(orgSessionCookieOptions(sessionToken))
    return res
  } catch (err) {
    console.error('Org register error:', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
