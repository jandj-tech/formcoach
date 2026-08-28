import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'
import { isCleanDisplayText, BLOCKED_TEXT_ERROR } from '@/lib/moderation'
import { addToEmailList } from '@/lib/email-list'
import { randomInt } from 'crypto'
import { BCRYPT_COST } from '@/lib/password'
import { rateLimitByIp } from '@/lib/rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'
import { checkEmailAbuse } from '@/lib/email-abuse'

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
    // A team is a billing entity with an access code that lets anonymous
    // players spend its credits, so registration is worth more to an abuser
    // than a plain account.
    const limit = await rateLimitByIp(req, 'team-register', 5, 3600)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const { name, email, password, orgCode, ageGroup, website, turnstileToken } = await req.json()

    // Honeypot: hidden from real visitors, irresistible to bots.
    if (typeof website === 'string' && website.trim() !== '') {
      return NextResponse.json({ success: true })
    }

    const captcha = await verifyTurnstile(req, turnstileToken)
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.error }, { status: 400 })
    }

    if (name && !isCleanDisplayText(name)) {
      return NextResponse.json({ error: BLOCKED_TEXT_ERROR }, { status: 400 })
    }
    if (!name || !email || !password || password.length < 6) {
      return NextResponse.json({ error: 'Team name, email, and password (6+ chars) required' }, { status: 400 })
    }

    const emailLower = email.toLowerCase().trim()

    // Optional organization link
    let organizationId: string | null = null
    if (typeof orgCode === 'string' && orgCode.trim()) {
      const [org] = await db`
        SELECT id FROM organizations WHERE access_code = ${orgCode.trim().toUpperCase()}
      ` as unknown as [{ id: string } | undefined]
      if (!org) {
        return NextResponse.json({ error: 'Organization code not found' }, { status: 404 })
      }
      organizationId = org.id
    }

    const ageGroupValue =
      typeof ageGroup === 'string' && ageGroup.trim() ? ageGroup.trim() : null

    const existing = await db`SELECT id FROM teams WHERE admin_email = ${emailLower}`
    if (existing.length > 0) {
      return NextResponse.json({ error: 'A team already exists for this email. Please log in.' }, { status: 409 })
    }

    const abuse = await checkEmailAbuse(emailLower, 'teams')
    if (!abuse.ok) {
      return NextResponse.json({ error: abuse.error }, { status: 409 })
    }

    const hash = await bcrypt.hash(password, BCRYPT_COST)

    // Generate a unique access code (retry on rare collision)
    let accessCode = generateAccessCode()
    for (let attempt = 0; attempt < 5; attempt++) {
      const collision = await db`SELECT id FROM teams WHERE access_code = ${accessCode}`
      if (collision.length === 0) break
      accessCode = generateAccessCode()
    }

    const [team] = await db`
      INSERT INTO teams (name, admin_email, password_hash, access_code, organization_id, age_group)
      VALUES (${name.trim()}, ${emailLower}, ${hash}, ${accessCode}, ${organizationId}, ${ageGroupValue})
      RETURNING id, admin_email
    ` as unknown as [{ id: string; admin_email: string }]

    // New accounts join the marketing list (unsubscribe honored/preserved).
    await addToEmailList(emailLower)

    const token = await signTeamSession({ teamId: team.id, adminEmail: team.admin_email })
    const res = NextResponse.json({ success: true })
    res.cookies.set(teamSessionCookieOptions(token))
    return res
  } catch (err) {
    console.error('Team register error:', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
