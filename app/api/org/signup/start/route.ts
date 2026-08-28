import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { BCRYPT_COST } from '@/lib/password'
import { rateLimitByIp } from '@/lib/rate-limit'
import { isCleanDisplayText, BLOCKED_TEXT_ERROR } from '@/lib/moderation'
import { verifyTurnstile } from '@/lib/turnstile'
import {
  createPendingOrgSignup,
  pendingCookieOptions,
  purgeExpiredPendingSignups,
} from '@/lib/pending-org'

/**
 * Step one of organization signup: capture the details, hold them, send the
 * visitor to the pricing page.
 *
 * This does NOT create an organization. The org row is created only once a
 * payment succeeds — see lib/create-org-from-checkout.ts. What lands here is a
 * `pending_org_signups` row holding the bcrypt hash, plus an httpOnly cookie
 * carrying nothing but an opaque token.
 *
 * Replaces the old /api/org/apply, which inserted an application for a human
 * to approve by hand.
 */
export async function POST(req: NextRequest) {
  // This endpoint runs bcrypt at cost 12 (~250ms of CPU) for an anonymous
  // caller, so the limiter is load-bearing, not decoration. The route it
  // replaced only did an INSERT and had none.
  const limit = await rateLimitByIp(req, 'org-signup-start', 10, 3600)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many signup attempts. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  try {
    const body = await req.json()
    const orgName = typeof body?.orgName === 'string' ? body.orgName.trim() : ''
    const emailRaw = typeof body?.email === 'string' ? body.email.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    const playerCountRaw = body?.playerCount
    const website = body?.website
    const turnstileToken = body?.turnstileToken

    // Honeypot: a field hidden from real visitors. Bots fill every input they
    // find. Answer with a plain success so the operator cannot tell their
    // submission was dropped and start probing for the reason. Carried over
    // from /api/org/apply, which this route replaces.
    if (typeof website === 'string' && website.trim() !== '') {
      return NextResponse.json({ ok: true }, { status: 201 })
    }

    const captcha = await verifyTurnstile(req, turnstileToken)
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.error }, { status: 400 })
    }

    if (!orgName || !emailRaw) {
      return NextResponse.json({ error: 'Organization name and email are required' }, { status: 400 })
    }
    if (!isCleanDisplayText(orgName)) {
      return NextResponse.json({ error: BLOCKED_TEXT_ERROR }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const email = emailRaw.toLowerCase()
    const playerCount =
      typeof playerCountRaw === 'number' && Number.isFinite(playerCountRaw)
        ? Math.max(0, Math.floor(playerCountRaw))
        : null

    // Catch the collision here rather than letting them pay and only then
    // discover the account exists. The organizations.admin_email UNIQUE
    // constraint is still the backstop for a race.
    const existing = (await db`
      SELECT 1 FROM organizations WHERE admin_email = ${email} LIMIT 1
    `) as unknown as unknown[]
    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'An organization already uses that email. Log in instead.' },
        { status: 409 },
      )
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST)
    const pending = await createPendingOrgSignup({
      orgName,
      adminEmail: email,
      playerCount,
      passwordHash,
    })

    // Abandoned rows hold a password hash, so sweep them occasionally rather
    // than letting them accumulate. Opportunistic on ~1% of calls, the same
    // approach lib/rate-limit.ts takes with its own table.
    if (Math.random() < 0.01) await purgeExpiredPendingSignups()

    const res = NextResponse.json({ ok: true }, { status: 201 })
    res.cookies.set(pendingCookieOptions(pending.token))
    return res
  } catch (err) {
    console.error('[org/signup/start] failed:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
