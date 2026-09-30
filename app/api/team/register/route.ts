import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { emailBelongsToCoachOrOrg, signTeamSession, teamSessionCookieOptions } from '@/lib/team-auth'
import { cleanDisplayText, cleanOptionalDisplayText } from '@/lib/moderation'
import { addToEmailList } from '@/lib/email-list'
import { randomInt } from 'crypto'
import { BCRYPT_COST } from '@/lib/password'
import { rateLimitLogin } from '@/lib/rate-limit'
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
    const { name, email, password, orgCode, ageGroup, website, turnstileToken } =
      (await req.json().catch(() => ({}))) as {
        name?: unknown; email?: unknown; password?: unknown; orgCode?: unknown
        ageGroup?: unknown; website?: unknown; turnstileToken?: unknown
      }

    // A team is a billing entity with an access code that lets anonymous
    // players spend its credits, so registration is worth more to an abuser
    // than a plain account. Tight per email; the per-IP ceiling is looser so
    // a clinic's coaches on one gym Wi-Fi can all register.
    const limit = await rateLimitLogin(req, 'team-register', typeof email === 'string' ? email : null, {
      perIp: 20, perEmail: 3, windowSeconds: 3600,
    })
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Too many attempts — try again later' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    // Honeypot: hidden from real visitors, irresistible to bots.
    if (typeof website === 'string' && website.trim() !== '') {
      return NextResponse.json({ success: true })
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
      return NextResponse.json({ error: 'Team name, email, and password (6+ chars) required' }, { status: 400 })
    }
    const teamName = cleanDisplayText(name, 255)
    if (!teamName.ok) return NextResponse.json({ error: teamName.error }, { status: 400 })
    const ageGroupClean = cleanOptionalDisplayText(ageGroup, 50)
    if (!ageGroupClean.ok) return NextResponse.json({ error: ageGroupClean.error }, { status: 400 })

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

    const ageGroupValue = ageGroupClean.value

    // Registration never proves the inbox, so it must not mint a second
    // identity under an address that is already a coach's or an org's —
    // head coach, added coach (even with the invite still pending) or org
    // admin. Doing so used to hand a stranger a team session carrying that
    // person's email, which the team switcher then honoured on their real
    // teams and which listed their own uploads.
    if (await emailBelongsToCoachOrOrg(emailLower)) {
      return NextResponse.json(
        { error: 'This email already belongs to a coach or organization. Log in instead.' },
        { status: 409 },
      )
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
      VALUES (${teamName.value}, ${emailLower}, ${hash}, ${accessCode}, ${organizationId}, ${ageGroupValue})
      RETURNING id, admin_email
    ` as unknown as [{ id: string; admin_email: string }]

    // New accounts join the marketing list (unsubscribe honored/preserved).
    await addToEmailList(emailLower)

    const token = await signTeamSession({ teamId: team.id, adminEmail: team.admin_email }, hash)
    const res = NextResponse.json({ success: true })
    res.cookies.set(teamSessionCookieOptions(token))
    return res
  } catch (err) {
    console.error('Team register error:', err)
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 })
  }
}
